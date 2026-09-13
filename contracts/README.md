# EQUITY_CHAIN contracts

Solidity source for the on-chain escrow + tokenized-SAFE side of EQUITY_CHAIN.
Separate npm project (own `node_modules`/lockfile) so this Hardhat toolchain
never touches the root Next.js app's pnpm install, `tsc`, `eslint`, `jest`, or
`prettier` runs — all of those explicitly exclude this directory.

## Contracts

- `contracts/EquityToken.sol` — ERC20 "security token", minted 1:1 per HSK
  invested. Mint/burn restricted to its escrow.
- `contracts/EquityEscrow.sol` — one instance per campaign: takes HSK during
  `Funding`, releases it to the startup per milestone once `Active`, and
  refunds investors pro-rata if marked `Failed`.
- `contracts/EquityEscrowFactory.sol` — deploys one `EquityEscrow` per
  campaign; a founder calls `createCampaign(...)` directly (they become
  `startup`, they pay the gas), so the platform doesn't need a backend wallet
  to deploy campaign contracts one by one.

## Setup

```bash
cd contracts
npm install
cp .env.example .env   # fill in PRIVATE_KEY before deploying to a real network
```

## Commands

```bash
npm run compile          # solc via Hardhat
npm test                 # Mocha/chai against an in-memory Hardhat network —
                          # 12 tests covering the full Funding -> Active ->
                          # Completed / Failed -> refund lifecycle
npm run deploy:testnet   # deploys EquityEscrowFactory to HashKey testnet (133)
npm run deploy:mainnet   # deploys EquityEscrowFactory to HashKey mainnet (177)
```

`PRIVATE_KEY` in `.env` needs testnet/mainnet HSK for gas before deploying —
this repo cannot fund or run that deploy for you.

## Known gaps before wiring this into the live app

- The Prisma `Campaign` model has no funding-deadline column yet
  (`EquityEscrow`'s constructor needs `fundingDurationSeconds`) — add one, or
  derive it from the first `Milestone.targetDate`.
- Nothing in `app/` calls these contracts yet — `CreateCampaignForm.tsx`
  writes straight to Postgres, and `InvestForm.tsx` sends a native transfer
  to a treasury wallet (see `EQUITY_CHAIN_HANDOFF.md` gap #1). Wiring either
  flow to `EquityEscrowFactory`/`EquityEscrow` via wagmi is a frontend task,
  not a contracts one — see the `useWriteContract` example in the session
  history for the shape of it.
