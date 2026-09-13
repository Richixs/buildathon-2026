// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EquityToken} from "./EquityToken.sol";

/**
 * @title EquityEscrow
 * @author EQUITY_CHAIN
 * @notice On-chain escrow + tokenized-SAFE for a single Campaign. One
 *         instance mirrors one row of the `Campaign` table (see
 *         prisma/schema.prisma): `goalAmount`, `equityOffered`, `tokenSymbol`,
 *         and the `Milestone.releasePercentage` schedule (validated off-chain
 *         to sum to 100 in lib/validations/campaign.ts — re-validated here).
 *
 *         Lifecycle:
 *           Funding   -> investors call {invest} until `goalAmount` is raised
 *                        or `fundingDeadline` passes.
 *           Active    -> goal reached; the startup (or the platform admin,
 *                        acting as milestone oracle) calls
 *                        {releaseNextMilestone} once per completed milestone.
 *           Completed -> every milestone released; escrow balance is 0.
 *           Failed    -> deadline passed without reaching `goalAmount`, OR
 *                        the platform admin aborts an `Active` campaign
 *                        (fraud / abandonment). Investors call {claimRefund}
 *                        for their pro-rata share of whatever HSK remains.
 *
 * @dev Design notes for whoever audits/extends this next:
 *
 *      - Native HSK only, no IERC20. The shipped frontend already sends a
 *        native transfer via wagmi's `useSendTransaction`
 *        (components/campaigns/InvestForm.tsx), so this contract mirrors
 *        that trust model instead of introducing a second, ERC20-denominated
 *        path. Swapping in a stablecoin (USDC-style) would replace
 *        `payable`/`call{value:}` with `transferFrom`/`transfer` against a
 *        stored `IERC20` handle — worth doing before mainnet, since native
 *        HSK-denominated goals are exposed to HSK/USD price risk that a
 *        stablecoin round would not have.
 *      - Centralization: `owner()` (the platform admin) can unilaterally
 *        {cancelCampaign} and can also call {releaseNextMilestone} as a
 *        stand-in oracle. This is a deliberate MVP trust assumption — the
 *        alternative (a real milestone oracle / DAO vote) is out of scope
 *        for this contract and should be layered on before real capital
 *        moves through it.
 *      - No `receive()`/`fallback()` is defined on purpose: a bare HSK
 *        transfer to this contract (bypassing {invest}) reverts by default,
 *        which is exactly what we want — every wei in this contract must be
 *        attributable to an `investments[investor]` entry.
 *      - Rounding: the *last* milestone releases whatever is left
 *        (`totalRaised - totalReleased`) instead of its own percentage, so
 *        integer-division dust from earlier milestones can't get stuck
 *        forever. The equivalent dust in {claimRefund} (each investor's
 *        share is floored independently) is accepted as immaterial at HSK's
 *        18-decimal precision — fully eliminating it would require a
 *        withdrawal-pattern "last claimant sweeps remainder" scheme that
 *        isn't worth the added complexity here.
 */
contract EquityEscrow is Ownable, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Status {
        Funding,
        Active,
        Completed,
        Failed
    }

    // ---------------------------------------------------------------------
    // Immutable campaign terms (set once at deployment)
    // ---------------------------------------------------------------------

    /// @notice The startup's wallet (`Campaign.founderAddress`) — receives milestone payouts.
    address public immutable startup;

    /// @notice Funding target in wei of native HSK (`Campaign.goalAmount`).
    uint256 public immutable goalAmount;

    /// @notice Equity offered for `goalAmount`, in basis points (e.g. 1000 =
    ///         10.00%) — mirrors `Campaign.equityOffered`. Kept on-chain only
    ///         for provenance/off-chain display; no on-chain math depends on
    ///         it, since token minting is a flat 1:1 with HSK invested.
    uint16 public immutable equityOfferedBps;

    /// @notice Unix timestamp after which an under-funded campaign can be
    ///         marked Failed via {markFailedIfExpired}.
    uint256 public immutable fundingDeadline;

    /// @notice The ERC20 "security token" minted 1:1 per HSK invested.
    EquityToken public immutable equityToken;

    /// @notice Milestone release schedule in whole percentage points,
    ///         summing to exactly 100 (checked in the constructor). Mirrors
    ///         `Milestone.releasePercentage`, in completion order (index 0 first).
    uint8[] public milestonePercentages;

    // ---------------------------------------------------------------------
    // Mutable campaign state
    // ---------------------------------------------------------------------

    Status public status;

    /// @notice Total HSK ever invested. Only grows — does not shrink when
    ///         milestones drain the balance or investors are refunded.
    uint256 public totalRaised;

    /// @notice Total HSK already paid out to the startup across all released milestones.
    uint256 public totalReleased;

    /// @notice Index into `milestonePercentages` of the next milestone to release.
    uint256 public currentMilestoneIndex;

    /// @notice HSK contributed by each investor, before any refund. Zeroed
    ///         out once that investor calls {claimRefund}.
    mapping(address investor => uint256 amount) public investments;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Invested(address indexed investor, uint256 amount, uint256 tokensMinted);
    event GoalReached(uint256 totalRaised);
    event MilestoneReleased(uint256 indexed milestoneIndex, uint256 amount, address startup);
    event CampaignFailed(string reason);
    event RefundClaimed(address indexed investor, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidMilestones();
    error FundingClosed();
    error FundingNotExpired();
    error ZeroInvestment();
    error ExceedsGoal(uint256 attempted, uint256 remaining);
    error NotStartupOrAdmin(address caller);
    error CampaignNotActive();
    error AllMilestonesReleased();
    error CampaignNotFailed();
    error NothingToRefund();
    error TransferFailed();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @dev The startup itself, or the platform admin (`owner()`) acting as
    ///      the oracle that confirms a milestone was actually hit — matches
    ///      spec: "Solo invocable por la Startup (o un oráculo/admin)".
    modifier onlyStartupOrAdmin() {
        if (msg.sender != startup && msg.sender != owner()) {
            revert NotStartupOrAdmin(msg.sender);
        }
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /**
     * @param admin_ Platform admin / oracle address (the `Ownable` owner) —
     *        typically EQUITY_CHAIN's operational wallet, deliberately
     *        distinct from `startup_` so it can arbitrate {cancelCampaign}
     *        without the founder's cooperation.
     * @param startup_ The startup's wallet (`Campaign.founderAddress`).
     * @param goalAmount_ Funding target in wei (`Campaign.goalAmount`; HSK has 18 decimals).
     * @param equityOfferedBps_ `Campaign.equityOffered` expressed in basis points.
     * @param fundingDurationSeconds_ How long, from deployment, investors
     *        have to reach `goalAmount_` before the campaign can be marked
     *        Failed. Not part of the Prisma `Campaign` model today — add a
     *        column there (or derive it from the first `Milestone.targetDate`)
     *        before wiring this up end-to-end from the creation form.
     * @param tokenName_ ERC20 name for the security token (e.g. `Campaign.title`).
     * @param tokenSymbol_ ERC20 symbol, mirrors `Campaign.tokenSymbol`.
     * @param milestonePercentages_ Release schedule; must sum to exactly 100
     *        — the same invariant already enforced off-chain by
     *        lib/validations/campaign.ts's `.refine()`.
     */
    constructor(
        address admin_,
        address startup_,
        uint256 goalAmount_,
        uint16 equityOfferedBps_,
        uint256 fundingDurationSeconds_,
        string memory tokenName_,
        string memory tokenSymbol_,
        uint8[] memory milestonePercentages_
    ) Ownable(admin_) {
        uint256 sum;
        uint256 length = milestonePercentages_.length;
        for (uint256 i = 0; i < length; i++) {
            sum += milestonePercentages_[i];
        }
        if (length == 0 || sum != 100) revert InvalidMilestones();

        startup = startup_;
        goalAmount = goalAmount_;
        equityOfferedBps = equityOfferedBps_;
        fundingDeadline = block.timestamp + fundingDurationSeconds_;
        milestonePercentages = milestonePercentages_;

        equityToken = new EquityToken(tokenName_, tokenSymbol_, address(this));
    }

    // ---------------------------------------------------------------------
    // Investing
    // ---------------------------------------------------------------------

    /**
     * @notice Invest native HSK into this campaign. Mints an equal amount
     *         (1:1, matching HSK's 18 decimals) of {equityToken} to the caller.
     * @dev Reverts if funding is closed, the deadline passed, or the
     *      contribution would push `totalRaised` past `goalAmount` — callers
     *      should read `goalAmount - totalRaised` first to top up to exactly
     *      fill the round instead of over-sending.
     */
    function invest() external payable nonReentrant {
        if (status != Status.Funding) revert FundingClosed();
        if (block.timestamp > fundingDeadline) revert FundingClosed();
        if (msg.value == 0) revert ZeroInvestment();

        uint256 remaining = goalAmount - totalRaised;
        if (msg.value > remaining) revert ExceedsGoal(msg.value, remaining);

        investments[msg.sender] += msg.value;
        totalRaised += msg.value;

        equityToken.mint(msg.sender, msg.value);
        emit Invested(msg.sender, msg.value, msg.value);

        if (totalRaised == goalAmount) {
            status = Status.Active;
            emit GoalReached(totalRaised);
        }
    }

    /**
     * @notice Permissionless: flips an under-funded campaign to `Failed`
     *         once its deadline has passed, unlocking {claimRefund}. Anyone
     *         can call this (keepers, the frontend, an investor) — it only
     *         ever moves state in the investors' favor.
     */
    function markFailedIfExpired() external {
        if (status != Status.Funding) revert CampaignNotActive();
        if (block.timestamp <= fundingDeadline) revert FundingNotExpired();

        status = Status.Failed;
        emit CampaignFailed("Funding deadline passed before reaching goalAmount");
    }

    // ---------------------------------------------------------------------
    // Milestones
    // ---------------------------------------------------------------------

    /**
     * @notice Releases the next milestone's share of `totalRaised` to the
     *         startup. Every milestone but the last pays out a fixed
     *         percentage of `totalRaised`; the last pays out whatever
     *         remains, so rounding dust from integer division never gets
     *         stuck in the contract.
     * @dev Follows checks-effects-interactions: `currentMilestoneIndex` and
     *      `totalReleased` are updated before the external HSK transfer.
     */
    function releaseNextMilestone() external nonReentrant onlyStartupOrAdmin {
        if (status != Status.Active) revert CampaignNotActive();

        uint256 index = currentMilestoneIndex;
        uint256 length = milestonePercentages.length;
        if (index >= length) revert AllMilestonesReleased();

        bool isLastMilestone = index == length - 1;
        uint256 amount = isLastMilestone
            ? totalRaised - totalReleased
            : (totalRaised * milestonePercentages[index]) / 100;

        currentMilestoneIndex = index + 1;
        totalReleased += amount;

        if (isLastMilestone) {
            status = Status.Completed;
        }

        (bool ok, ) = startup.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit MilestoneReleased(index, amount, startup);
    }

    /**
     * @notice Admin-only kill switch for an `Active` campaign that stalls —
     *         e.g. the startup goes dark between milestones. Moves the
     *         campaign to `Failed`, freezing further milestone releases and
     *         opening {claimRefund} for whatever HSK remains in escrow.
     * @dev Restricted to `owner()` only, never the startup — a founder must
     *      never be able to self-certify failure after already spending
     *      part of the raise in bad faith.
     */
    function cancelCampaign(string calldata reason) external onlyOwner {
        if (status != Status.Active) revert CampaignNotActive();
        status = Status.Failed;
        emit CampaignFailed(reason);
    }

    // ---------------------------------------------------------------------
    // Refunds
    // ---------------------------------------------------------------------

    /**
     * @notice Claim a pro-rata share of the HSK still held in escrow after a
     *         campaign is marked `Failed`, and burn the caller's equity
     *         tokens — claiming a refund means exiting the position.
     * @dev `refundable = investments[msg.sender] * (totalRaised - totalReleased) / totalRaised`.
     *      This reduces to a full refund when nothing was ever released
     *      (a campaign that failed before reaching its goal) and to a
     *      pro-rata share of the remaining pot when the campaign failed
     *      mid-way through its milestone schedule.
     */
    function claimRefund() external nonReentrant {
        if (status != Status.Failed) revert CampaignNotFailed();

        uint256 contributed = investments[msg.sender];
        if (contributed == 0) revert NothingToRefund();

        uint256 remainingPot = totalRaised - totalReleased;
        uint256 refundable = (contributed * remainingPot) / totalRaised;

        investments[msg.sender] = 0;

        uint256 tokenBalance = equityToken.balanceOf(msg.sender);
        if (tokenBalance > 0) {
            equityToken.burn(msg.sender, tokenBalance);
        }

        (bool ok, ) = msg.sender.call{value: refundable}("");
        if (!ok) revert TransferFailed();

        emit RefundClaimed(msg.sender, refundable);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Number of milestones in the release schedule.
    function milestoneCount() external view returns (uint256) {
        return milestonePercentages.length;
    }

    /// @notice HSK still sitting in this contract (unreleased and unrefunded).
    function escrowBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
