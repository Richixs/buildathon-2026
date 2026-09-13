"use client";

import { useAccount, useReadContract } from "wagmi";
import { formatEther, type Address } from "viem";
import { equityTokenAbi } from "@/lib/abi";
import { getEscrowChainId } from "@/lib/escrow/config";
import { formatTokens } from "@/lib/format";

/** Connected wallet's EquityToken balance for one campaign. */
export default function TokenBalance({
  tokenAddress,
  tokenSymbol,
}: {
  tokenAddress: string;
  tokenSymbol: string;
}) {
  const { address } = useAccount();
  const { data } = useReadContract({
    address: tokenAddress as Address,
    abi: equityTokenAbi,
    functionName: "balanceOf",
    args: [address as Address],
    chainId: getEscrowChainId(),
    query: { enabled: Boolean(address) },
  });

  if (data === undefined) return null;

  return (
    <span className="text-retro-green font-mono text-xs">
      {formatTokens(Number(formatEther(data)), tokenSymbol)} en tu wallet
    </span>
  );
}
