"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContracts } from "wagmi";
import { formatEther, type Address } from "viem";
import { equityEscrowAbi, equityTokenAbi } from "@/lib/abi";
import {
  ESCROW_STATUS,
  STATUS_LABELS,
  explorerUrl,
  getEscrowChainId,
  prismaStatusFromChain,
  readableTxError,
} from "@/lib/escrow/config";
import { shortenAddress } from "@/lib/address";
import { formatHsk, formatTokens } from "@/lib/format";
import { useEscrowWrite } from "@/hooks/use-escrow-write";
import { useNow } from "@/hooks/use-now";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ACTION_BUTTON_CLASSES =
  "border-2 px-4 py-2 font-mono text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

type Action = "markFailed" | "release" | "cancel" | "refund";

interface EscrowPanelProps {
  campaignId: string;
  contractAddress: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  milestones: { title: string; releasePercentage: number }[];
  // Postgres snapshot the page was rendered with — compared against the
  // chain to trigger a sync when it lags.
  dbStatus: string;
  dbRaisedAmount: number;
  dbEscrowBalance: number;
  dbCompletedMilestones: number;
}

function sameAddress(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

const toHsk = (wei: bigint) => Number(formatEther(wei));

/**
 * Live view of one EquityEscrow plus every post-funding action:
 * releaseNextMilestone (founder/admin), cancelCampaign (admin),
 * markFailedIfExpired (anyone) and claimRefund (investors). Each action is
 * followed by POST /api/campaigns/[id]/sync so Postgres catches up.
 */
export default function EscrowPanel({
  campaignId,
  contractAddress,
  tokenAddress,
  tokenSymbol,
  milestones,
  dbStatus,
  dbRaisedAmount,
  dbEscrowBalance,
  dbCompletedMilestones,
}: EscrowPanelProps) {
  const router = useRouter();
  const { address } = useAccount();
  const send = useEscrowWrite();
  const now = useNow();
  const chainId = getEscrowChainId();
  const escrowAddress = contractAddress as Address;

  const { data: state, refetch: refetchState } = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "status",
      },
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "totalRaised",
      },
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "totalReleased",
      },
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "escrowBalance",
      },
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "fundingDeadline",
      },
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "currentMilestoneIndex",
      },
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "startup",
      },
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "owner",
      },
    ],
  });

  const hasPosition = Boolean(address && tokenAddress);
  const wallet = (address ?? ZERO_ADDRESS) as Address;
  const { data: position, refetch: refetchPosition } = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: escrowAddress,
        abi: equityEscrowAbi,
        chainId,
        functionName: "investments",
        args: [wallet],
      },
      {
        address: (tokenAddress ?? ZERO_ADDRESS) as Address,
        abi: equityTokenAbi,
        chainId,
        functionName: "balanceOf",
        args: [wallet],
      },
    ],
    query: { enabled: hasPosition },
  });

  const [pending, setPending] = useState<Action | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Poor man's indexer: if anything moved on-chain without passing through
  // this app (an invest() whose POST failed, a release from the explorer…),
  // reconcile once per page load.
  const reconciled = useRef(false);
  useEffect(() => {
    if (!state || reconciled.current) return;

    const [status, totalRaised, , escrowBalance, , milestoneIndex] = state;
    const inSync =
      prismaStatusFromChain(status) === dbStatus &&
      toHsk(totalRaised) === dbRaisedAmount &&
      toHsk(escrowBalance) === dbEscrowBalance &&
      Number(milestoneIndex) === dbCompletedMilestones;
    if (inSync) return;

    reconciled.current = true;
    fetch(`/api/campaigns/${campaignId}/sync`, { method: "POST" })
      .then((response) => {
        if (response.ok) router.refresh();
      })
      .catch(() => {
        // Next page load retries; the panel already shows chain truth.
      });
  }, [
    state,
    campaignId,
    dbStatus,
    dbRaisedAmount,
    dbEscrowBalance,
    dbCompletedMilestones,
    router,
  ]);

  async function runAction(action: Action, submit: Parameters<typeof send>[0]) {
    setPending(action);
    setActionError(null);
    try {
      await send(submit);
      await fetch(`/api/campaigns/${campaignId}/sync`, { method: "POST" });
      await Promise.all([
        refetchState(),
        hasPosition ? refetchPosition() : Promise.resolve(),
      ]);
      router.refresh();
    } catch (error) {
      setActionError(readableTxError(error));
    } finally {
      setPending(null);
    }
  }

  if (!state) {
    return (
      <div className="bg-terminal-gray border-neon-cyan/30 border p-6">
        <p className="text-neon-cyan font-mono text-sm tracking-widest">
          [ LEYENDO_ESCROW_ONCHAIN... ]
        </p>
      </div>
    );
  }

  const [
    status,
    totalRaised,
    totalReleased,
    escrowBalance,
    fundingDeadline,
    milestoneIndexRaw,
    startup,
    owner,
  ] = state;
  const milestoneIndex = Number(milestoneIndexRaw);
  const deadlineMs = Number(fundingDeadline) * 1000;
  const nextMilestone = milestones[milestoneIndex];
  const isStartup = sameAddress(address, startup);
  const isAdmin = sameAddress(address, owner);
  const contributed = position?.[0] ?? BigInt(0);
  const tokenBalance = position?.[1] ?? BigInt(0);
  const refundEstimate =
    totalRaised > BigInt(0)
      ? (contributed * (totalRaised - totalReleased)) / totalRaised
      : BigInt(0);

  const canMarkFailed =
    Boolean(address) && status === ESCROW_STATUS.Funding && now > deadlineMs;
  const canRelease =
    (isStartup || isAdmin) &&
    status === ESCROW_STATUS.Active &&
    nextMilestone !== undefined;
  const canCancel = isAdmin && status === ESCROW_STATUS.Active;
  const canRefund = status === ESCROW_STATUS.Failed && contributed > BigInt(0);

  const escrowUrl = explorerUrl("address", contractAddress);
  const tokenUrl = tokenAddress ? explorerUrl("address", tokenAddress) : null;

  return (
    <div className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-4 border p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-off-white/40 font-mono text-xs tracking-widest">
          ESCROW_ONCHAIN
        </span>
        <span className="text-neon-cyan font-mono text-xs font-bold">
          [{STATUS_LABELS[prismaStatusFromChain(status)]}]
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-3 font-mono text-xs sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-off-white/40">CUSTODIADO EN ESCROW</dt>
          <dd className="text-retro-green font-bold">
            {formatHsk(toHsk(escrowBalance))}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-off-white/40">LIBERADO A LA STARTUP</dt>
          <dd className="text-off-white">{formatHsk(toHsk(totalReleased))}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-off-white/40">CIERRE DE RONDA</dt>
          <dd className="text-off-white">
            {new Date(deadlineMs).toLocaleString("es-ES", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {status === ESCROW_STATUS.Funding && now > deadlineMs && (
              <span className="text-warning-orange"> · VENCIDA</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-off-white/40">HITOS LIBERADOS</dt>
          <dd className="text-off-white">
            {milestoneIndex}/{milestones.length}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-off-white/40">CONTRATO</dt>
          <dd>
            {escrowUrl ? (
              <a
                href={escrowUrl}
                target="_blank"
                rel="noreferrer"
                className="text-neon-cyan underline"
              >
                {shortenAddress(contractAddress)} ↗
              </a>
            ) : (
              shortenAddress(contractAddress)
            )}
          </dd>
        </div>
        {tokenAddress && (
          <div className="flex flex-col gap-1">
            <dt className="text-off-white/40">TOKEN ${tokenSymbol}</dt>
            <dd>
              {tokenUrl ? (
                <a
                  href={tokenUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neon-cyan underline"
                >
                  {shortenAddress(tokenAddress)} ↗
                </a>
              ) : (
                shortenAddress(tokenAddress)
              )}
            </dd>
          </div>
        )}
      </dl>

      {hasPosition && (tokenBalance > BigInt(0) || contributed > BigInt(0)) && (
        <div className="border-off-white/10 flex flex-col gap-1 border-t pt-3 font-mono text-xs">
          <span className="text-off-white/40 tracking-widest">TU_POSICIÓN</span>
          <span className="text-retro-green font-bold">
            {formatTokens(toHsk(tokenBalance), tokenSymbol)}
          </span>
          <span className="text-off-white/60">
            Aporte en escrow: {formatHsk(toHsk(contributed))}
          </span>
        </div>
      )}

      {(canMarkFailed || canRelease || canCancel || canRefund) && (
        <div className="border-off-white/10 flex flex-col gap-3 border-t pt-4">
          {canRelease && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() =>
                runAction("release", (write) =>
                  write({
                    address: escrowAddress,
                    abi: equityEscrowAbi,
                    functionName: "releaseNextMilestone",
                  }),
                )
              }
              className={`${ACTION_BUTTON_CLASSES} bg-neon-cyan text-crt-black border-crt-black`}
            >
              {pending === "release"
                ? "[ LIBERANDO_HITO... ]"
                : `[ LIBERAR_HITO ${milestoneIndex + 1}: ${nextMilestone.title} (${nextMilestone.releasePercentage}%) ]`}
            </button>
          )}

          {canRefund && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() =>
                runAction("refund", (write) =>
                  write({
                    address: escrowAddress,
                    abi: equityEscrowAbi,
                    functionName: "claimRefund",
                  }),
                )
              }
              className={`${ACTION_BUTTON_CLASSES} bg-retro-green text-crt-black border-crt-black`}
            >
              {pending === "refund"
                ? "[ RECLAMANDO... ]"
                : `[ RECLAMAR_REEMBOLSO ~${formatHsk(toHsk(refundEstimate))} ]`}
            </button>
          )}

          {canMarkFailed && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() =>
                runAction("markFailed", (write) =>
                  write({
                    address: escrowAddress,
                    abi: equityEscrowAbi,
                    functionName: "markFailedIfExpired",
                  }),
                )
              }
              className={`${ACTION_BUTTON_CLASSES} border-warning-orange text-warning-orange hover:bg-warning-orange/10`}
            >
              {pending === "markFailed"
                ? "[ CERRANDO_RONDA... ]"
                : "[ MARCAR_RONDA_FALLIDA ] — venció sin llegar a la meta"}
            </button>
          )}

          {canCancel && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                aria-label="Motivo de cancelación"
                placeholder="Motivo (visible on-chain)"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                className="border-muted-teal bg-crt-black text-off-white flex-1 border-2 px-3 py-2 font-mono text-sm outline-none"
              />
              <button
                type="button"
                disabled={pending !== null || !cancelReason.trim()}
                onClick={() =>
                  runAction("cancel", (write) =>
                    write({
                      address: escrowAddress,
                      abi: equityEscrowAbi,
                      functionName: "cancelCampaign",
                      args: [cancelReason.trim()],
                    }),
                  )
                }
                className={`${ACTION_BUTTON_CLASSES} border-red-400 text-red-400 hover:bg-red-400/10`}
              >
                {pending === "cancel"
                  ? "[ CANCELANDO... ]"
                  : "[ ADMIN: CANCELAR_CAMPAÑA ]"}
              </button>
            </div>
          )}
        </div>
      )}

      {actionError && (
        <p className="font-mono text-xs text-red-400">{actionError}</p>
      )}
    </div>
  );
}
