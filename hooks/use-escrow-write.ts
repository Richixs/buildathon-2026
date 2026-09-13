"use client";

import { useCallback } from "react";
import {
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import type { Hash, TransactionReceipt } from "viem";
import { getEscrowChainId } from "@/lib/escrow/config";

type WriteContract = ReturnType<typeof useWriteContract>["mutateAsync"];

/**
 * Sends one escrow/factory write and waits for it to be mined.
 *
 * Callers pass a function that receives wagmi's `writeContract` so the ABI,
 * function name and args keep full type inference:
 *
 *   const receipt = await send((write) =>
 *     write({ address, abi: equityEscrowAbi, functionName: "invest", value }),
 *   );
 *
 * Switches the wallet to the escrow chain first, and throws if the tx
 * reverts, so a resolved promise always means "succeeded on-chain".
 */
export function useEscrowWrite() {
  const chainId = useChainId();
  const escrowChainId = getEscrowChainId();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { mutateAsync: writeContract } = useWriteContract();
  const publicClient = usePublicClient({ chainId: escrowChainId });

  return useCallback(
    async (
      submit: (write: WriteContract) => Promise<Hash>,
      options: { onSubmitted?: (hash: Hash) => void } = {},
    ): Promise<TransactionReceipt> => {
      if (!publicClient) {
        throw new Error(
          `La red ${escrowChainId} no está configurada en config/wagmi.ts.`,
        );
      }

      if (chainId !== escrowChainId) {
        await switchChain({ chainId: escrowChainId });
      }

      const hash = await submit(writeContract);
      options.onSubmitted?.(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("La transacción revirtió on-chain.");
      }

      return receipt;
    },
    [chainId, escrowChainId, publicClient, switchChain, writeContract],
  );
}
