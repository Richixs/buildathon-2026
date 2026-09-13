import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// Real, verified RPCs (see ../EQUITY_CHAIN_HANDOFF.md) — not hashkey.cloud,
// that domain doesn't resolve. Overridable via env for a private RPC.
const HSK_TESTNET_RPC_URL =
  process.env.HSK_TESTNET_RPC_URL ?? "https://testnet.hsk.xyz";
const HSK_MAINNET_RPC_URL =
  process.env.HSK_MAINNET_RPC_URL ?? "https://mainnet.hsk.xyz";

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hskTestnet: {
      url: HSK_TESTNET_RPC_URL,
      chainId: 133,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    hskMainnet: {
      url: HSK_MAINNET_RPC_URL,
      chainId: 177,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

export default config;
