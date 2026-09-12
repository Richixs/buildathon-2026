"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import {
  hashkeyMainnet,
  hashkeyTestnet,
  projectId,
  wagmiAdapter,
} from "@/config/wagmi";

const queryClient = new QueryClient();

const metadata = {
  name: "EquityChain",
  description:
    "Crowdfunding de equity tokenizado (SAFE) respaldado por escrow on-chain con liberación por hitos.",
  url:
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000"),
  icons: ["/favicon.ico"],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [hashkeyTestnet, hashkeyMainnet],
  defaultNetwork: hashkeyTestnet,
  metadata,
  features: { analytics: true },
});

export default function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
