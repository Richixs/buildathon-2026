import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";

const rawProjectId = process.env.NEXT_PUBLIC_PROJECT_ID;

if (!rawProjectId) {
  throw new Error(
    "NEXT_PUBLIC_PROJECT_ID no está definido. Crea un proyecto en https://cloud.reown.com y añádelo a tu .env",
  );
}

export const projectId = rawProjectId;

export const hashkeyTestnet = defineChain({
  id: 133,
  caipNetworkId: "eip155:133",
  chainNamespace: "eip155",
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HashKey", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "HashKey Explorer",
      url: "https://testnet-explorer.hskchain.net",
    },
  },
  testnet: true,
});

export const hashkeyMainnet = defineChain({
  id: 177,
  caipNetworkId: "eip155:177",
  chainNamespace: "eip155",
  name: "HashKey Chain",
  nativeCurrency: { name: "HashKey", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "HashKey Explorer", url: "https://explorer.hsk.xyz" },
  },
});

export const networks = [hashkeyTestnet, hashkeyMainnet];

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
