// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EquityEscrow} from "./EquityEscrow.sol";

/**
 * @title EquityEscrowFactory
 * @author EQUITY_CHAIN
 * @notice Deploys one {EquityEscrow} per campaign and keeps an on-chain
 *         registry (`allEscrows`, `escrowsByStartup`) so every campaign
 *         contract can be discovered from a single well-known address
 *         instead of relying only on the off-chain `Campaign.contractAddress`
 *         column to remember where each one lives.
 * @dev Anyone can call {createCampaign} — the caller becomes `startup` in
 *      the deployed escrow, so a founder deploys (and pays gas for) their
 *      own campaign contract directly from their wallet, e.g. via wagmi's
 *      `useWriteContract`. Every escrow's `admin_` is fixed to this
 *      factory's `owner()`, so the platform keeps one consistent
 *      oracle/arbiter across every campaign without passing it in per call.
 */
contract EquityEscrowFactory is Ownable {
    /// @notice Every escrow ever deployed by this factory, in deployment order.
    address[] public allEscrows;

    /// @notice Escrows deployed by a given startup wallet.
    mapping(address startup => address[] escrows) public escrowsByStartup;

    event CampaignCreated(
        address indexed startup,
        address indexed escrow,
        address equityToken,
        uint256 goalAmount,
        string tokenSymbol
    );

    /// @param admin_ Platform admin/oracle address shared by every escrow
    ///        this factory deploys — see {EquityEscrow}'s `admin_` param.
    constructor(address admin_) Ownable(admin_) {}

    /**
     * @notice Deploys a new {EquityEscrow} for the caller's campaign.
     * @dev Mirrors {EquityEscrow}'s constructor — see its NatSpec for what
     *      each parameter means off-chain (Campaign/Milestone columns).
     *      `msg.sender` becomes `startup` in the deployed escrow.
     * @return escrow Address of the newly deployed {EquityEscrow}.
     */
    function createCampaign(
        uint256 goalAmount,
        uint16 equityOfferedBps,
        uint256 fundingDurationSeconds,
        string calldata tokenName,
        string calldata tokenSymbol,
        uint8[] calldata milestonePercentages
    ) external returns (address escrow) {
        EquityEscrow deployed = new EquityEscrow(
            owner(),
            msg.sender,
            goalAmount,
            equityOfferedBps,
            fundingDurationSeconds,
            tokenName,
            tokenSymbol,
            milestonePercentages
        );

        escrow = address(deployed);
        allEscrows.push(escrow);
        escrowsByStartup[msg.sender].push(escrow);

        emit CampaignCreated(
            msg.sender,
            escrow,
            address(deployed.equityToken()),
            goalAmount,
            tokenSymbol
        );
    }

    /// @notice Total number of campaigns ever deployed by this factory.
    function totalCampaigns() external view returns (uint256) {
        return allEscrows.length;
    }

    /// @notice Number of campaigns deployed by a given startup wallet.
    function campaignCountFor(address startupWallet) external view returns (uint256) {
        return escrowsByStartup[startupWallet].length;
    }
}
