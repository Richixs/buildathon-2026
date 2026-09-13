"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount, useReadContracts } from "wagmi";
import { formatEther, type Address, type Hash } from "viem";
import ConnectButton from "@/components/web3/ConnectButton";
import { equityEscrowAbi } from "@/lib/abi";
import {
  ESCROW_STATUS,
  getEscrowChainId,
  hskToWei,
  readableTxError,
} from "@/lib/escrow/config";
import { formatHsk } from "@/lib/format";
import { useEscrowWrite } from "@/hooks/use-escrow-write";
import { useCheckProfile } from "@/hooks/use-profile";
import { useNow } from "@/hooks/use-now";

const investFormSchema = z.object({
  amount: z
    .number({ error: "Ingresa un número válido." })
    .positive("El monto debe ser mayor a 0."),
});

type InvestFormValues = z.infer<typeof investFormSchema>;

const INPUT_CLASSES =
  "border-muted-teal bg-crt-black text-off-white w-full border-2 px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-neon-cyan focus:shadow-[4px_4px_0px_0px_#66FCF1]";

const FIELD_ERROR_CLASSES = "text-red-400 font-mono text-xs";

const NOTICE_CLASSES =
  "border-off-white/20 bg-terminal-gray flex flex-col items-center gap-3 border p-6 text-center";

type SubmitState =
  "idle" | "signing" | "confirming" | "recording" | "success" | "error";

const BUSY_LABELS: Partial<Record<SubmitState, string>> = {
  signing: "[ FIRMA_EN_WALLET... ]",
  confirming: "[ CONFIRMANDO_TX... ]",
  recording: "[ REGISTRANDO_INVERSIÓN... ]",
};

interface InvestFormProps {
  campaignId: string;
  contractAddress: string;
  founderAddress: string;
}

export default function InvestForm({
  campaignId,
  contractAddress,
  founderAddress,
}: InvestFormProps) {
  const router = useRouter();
  const { address } = useAccount();
  const { data: profile, isLoading: isProfileLoading } =
    useCheckProfile(address);
  const send = useEscrowWrite();
  const now = useNow();
  const escrowAddress = contractAddress as Address;
  const chainId = getEscrowChainId();

  const { data: onchain, refetch } = useReadContracts({
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
        functionName: "goalAmount",
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
        functionName: "fundingDeadline",
      },
    ],
  });

  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // invest() succeeded on-chain but POST /api/investments didn't: lets the
  // investor retry the bookkeeping without sending HSK a second time.
  const [unrecordedTx, setUnrecordedTx] = useState<Hash | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InvestFormValues>({
    resolver: zodResolver(investFormSchema),
    defaultValues: { amount: 0 },
  });

  const isBusy = submitState in BUSY_LABELS;

  async function recordInvestment(txHash: Hash) {
    setSubmitState("recording");

    const response = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address, campaignId, txHash }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setUnrecordedTx(txHash);
      throw new Error(body?.error ?? "No se pudo registrar la inversión.");
    }

    setUnrecordedTx(null);
    setSubmitState("success");
    reset();
    refetch();
    router.refresh();
  }

  async function withErrorState(action: () => Promise<void>) {
    setSubmitError(null);
    try {
      await action();
    } catch (error) {
      setSubmitState("error");
      setSubmitError(readableTxError(error));
    }
  }

  if (!address) {
    return (
      <div className="border-neon-cyan bg-terminal-gray flex flex-col items-center gap-4 border-2 p-6 text-center">
        <p className="text-off-white/70 font-mono text-sm">
          &gt; CONECTA TU WALLET PARA INVERTIR_
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (address.toLowerCase() === founderAddress.toLowerCase()) {
    return (
      <div className={NOTICE_CLASSES}>
        <p className="text-off-white/70 font-mono text-sm">
          Eres el founder de esta campaña: no puedes invertir en ella.
        </p>
      </div>
    );
  }

  if (isProfileLoading) return null;

  if (!profile) {
    return (
      <div className={NOTICE_CLASSES}>
        <p className="text-off-white/70 font-mono text-sm">
          Registra tu perfil antes de invertir.
        </p>
        <Link
          href="/profile"
          className="text-neon-cyan font-mono text-sm underline"
        >
          CREAR_PERFIL →
        </Link>
      </div>
    );
  }

  if (!onchain) {
    return (
      <div className={NOTICE_CLASSES}>
        <p className="text-neon-cyan font-mono text-sm tracking-widest">
          [ LEYENDO_ESCROW_ONCHAIN... ]
        </p>
      </div>
    );
  }

  const [status, goalAmount, totalRaised, fundingDeadline] = onchain;
  const remaining = goalAmount - totalRaised;
  const isOpen =
    status === ESCROW_STATUS.Funding &&
    now <= Number(fundingDeadline) * 1000 &&
    remaining > BigInt(0);

  if (!isOpen && !unrecordedTx && submitState !== "success") {
    return (
      <div className={NOTICE_CLASSES}>
        <p className="text-off-white/70 font-mono text-sm">
          La ronda on-chain ya no acepta inversiones.
        </p>
      </div>
    );
  }

  const onSubmit: SubmitHandler<InvestFormValues> = (values) => {
    const value = hskToWei(values.amount);

    if (value === BigInt(0)) {
      setError("amount", { message: "El monto es demasiado pequeño." });
      return;
    }
    if (value > remaining) {
      setError("amount", {
        message: `Supera lo que falta para la meta (${formatHsk(Number(formatEther(remaining)))}).`,
      });
      return;
    }

    return withErrorState(async () => {
      setSubmitState("signing");
      const receipt = await send(
        (write) =>
          write({
            address: escrowAddress,
            abi: equityEscrowAbi,
            functionName: "invest",
            value,
          }),
        { onSubmitted: () => setSubmitState("confirming") },
      );
      await recordInvestment(receipt.transactionHash);
    });
  };

  return (
    <div className="border-neon-cyan bg-terminal-gray flex flex-col gap-4 border-2 p-6">
      <h2 className="text-neon-cyan font-mono text-lg font-bold tracking-widest">
        INVERTIR_AHORA
      </h2>

      <p className="text-off-white/50 font-mono text-xs">
        Falta para la meta: {formatHsk(Number(formatEther(remaining)))}. Tu HSK
        queda bloqueado en el escrow y recibes tokens 1:1 al instante.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="amount"
            className="text-off-white/70 font-mono text-xs tracking-widest"
          >
            MONTO A INVERTIR (HSK)
          </label>
          <input
            id="amount"
            type="number"
            step="any"
            className={INPUT_CLASSES}
            {...register("amount", { valueAsNumber: true })}
          />
          {errors.amount && (
            <p className={FIELD_ERROR_CLASSES}>{errors.amount.message}</p>
          )}
        </div>

        {submitState === "success" && (
          <p className="text-retro-green font-mono text-sm">
            ¡Inversión confirmada on-chain y registrada!
          </p>
        )}
        {submitState === "error" && submitError && (
          <p className={FIELD_ERROR_CLASSES}>{submitError}</p>
        )}

        {unrecordedTx ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => withErrorState(() => recordInvestment(unrecordedTx))}
            className="bg-warning-orange text-crt-black border-crt-black border-2 px-6 py-3 font-mono font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {BUSY_LABELS[submitState] ?? "[ REINTENTAR_REGISTRO ]"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={isBusy || !isOpen}
            className="bg-neon-cyan text-crt-black border-crt-black border-2 px-6 py-3 font-mono font-bold shadow-[4px_4px_0px_0px_#45A29E] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {BUSY_LABELS[submitState] ?? "[ INVERTIR_AHORA ]"}
          </button>
        )}
      </form>
    </div>
  );
}
