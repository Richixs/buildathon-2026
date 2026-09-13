// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title EquityToken
 * @author EQUITY_CHAIN
 * @notice ERC20 "security token" representing a fractional, tokenized claim
 *         on the equity a startup offered in its SAFE round (mirrors
 *         `Campaign.equityOffered` in the off-chain Prisma schema). Minted
 *         1:1 with the HSK an investor locks in the paired {EquityEscrow}
 *         contract — investing 1 HSK mints 1 token, so an investor's
 *         `balanceOf(investor) / totalSupply()` is exactly their share of
 *         the round's `equityOffered` percentage.
 * @dev Minting and burning are gated to the single {EquityEscrow} instance
 *      that deployed this token — there is no public mint/burn, so supply
 *      can only move in lockstep with real HSK entering/leaving escrow.
 *
 *      This is a claim token, not a speculative asset: every unit is tied to
 *      the campaign's off-chain SAFE agreement (Campaign/Milestone rows), and
 *      transferability (e.g. for the "secondary market" pitch) is a product
 *      decision for a later contract, not implemented here — vanilla ERC20
 *      transfers already work, but nothing on-chain currently prices or
 *      matches a secondary trade.
 */
contract EquityToken is ERC20 {
    /// @notice The only address allowed to mint or burn tokens.
    address public immutable escrow;

    /// @notice Thrown when anything other than `escrow` calls {mint} or {burn}.
    error NotEscrow(address caller);

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow(msg.sender);
        _;
    }

    /**
     * @param name_ Human-readable name, e.g. "NEXUS_LABS Equity Token"
     *        (can reuse `Campaign.title` off-chain).
     * @param symbol_ Ticker mirrored from `Campaign.tokenSymbol`, e.g. "NXUS".
     * @param escrow_ Address of the {EquityEscrow} instance that owns this token.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address escrow_
    ) ERC20(name_, symbol_) {
        escrow = escrow_;
    }

    /// @notice Mints `amount` tokens to `to`. Only callable by `escrow`,
    ///         on a new investment.
    function mint(address to, uint256 amount) external onlyEscrow {
        _mint(to, amount);
    }

    /// @notice Burns `amount` tokens from `from`. Only callable by `escrow`,
    ///         when an investor claims a refund and exits their position.
    function burn(address from, uint256 amount) external onlyEscrow {
        _burn(from, amount);
    }
}
