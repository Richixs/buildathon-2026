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

On WSL, if `npm` resolves to the Windows binary (HH1 / UNC path errors),
call Hardhat directly: `node ./node_modules/hardhat/internal/cli/cli.js test`.

## Wiring into the app

The Next.js app can't import this folder (it's excluded from its
`tsconfig`), so ABIs are copied over after every Solidity change:

```bash
node ./node_modules/hardhat/internal/cli/cli.js compile
node ./scripts/export-abis.js   # writes ../lib/abi/*.ts
```

After deploying the factory, set `NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS` (and
`NEXT_PUBLIC_ESCROW_CHAIN_ID`) in the app's `.env`. The founder's wallet
calls `createCampaign`, the investor's wallet calls `invest`, and the API
verifies every tx on-chain — see `lib/escrow/` in the app.
