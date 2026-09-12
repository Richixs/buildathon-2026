"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount, useSendTransaction } from "wagmi";
import { parseEther } from "viem";
import ConnectButton from "@/components/web3/ConnectButton";

const investFormSchema = z.object({
  amount: z
    .number({ error: "Ingresa un número válido." })
    .positive("El monto debe ser mayor a 0."),
});

type InvestFormValues = z.infer<typeof investFormSchema>;

const INPUT_CLASSES =
  "border-muted-teal bg-crt-black text-off-white w-full border-2 px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-neon-cyan focus:shadow-[4px_4px_0px_0px_#66FCF1]";

const FIELD_ERROR_CLASSES = "text-red-400 font-mono text-xs";

type SubmitState = "idle" | "sending" | "success" | "error";

export default function InvestForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  // No hay contrato de escrow todavía (ver EQUITY_CHAIN_HANDOFF.md gap #1):
  // esto manda HSK nativo a una wallet de tesorería y registra el txHash
  // real en Investment. El "escrow"/liberación por hitos se marca
  // manualmente desde el dashboard del founder por ahora. Read at render
  // time (not module scope) so it stays testable without a module reset.
  const treasuryAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS as
    `0x${string}` | undefined;
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InvestFormValues>({
    resolver: zodResolver(investFormSchema),
    defaultValues: { amount: 0 },
  });

  const onSubmit: SubmitHandler<InvestFormValues> = async (values) => {
    if (!address) return;

    setSubmitState("sending");
    setSubmitError(null);

    try {
      const txHash = await sendTransactionAsync({
        to: treasuryAddress!,
        value: parseEther(String(values.amount)),
      });

      const response = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          campaignId,
          amount: values.amount,
          txHash,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "No se pudo registrar la inversión.");
      }

      setSubmitState("success");
      reset();
      router.refresh();
    } catch (error) {
      setSubmitState("error");
      setSubmitError(
        error instanceof Error ? error.message : "Error desconocido.",
      );
    }
  };

  if (!treasuryAddress) {
    return (
      <div className="border-warning-orange/40 bg-terminal-gray flex flex-col gap-2 border-2 p-6">
        <p className="text-warning-orange font-mono text-xs tracking-widest">
          [ INVERSIÓN NO DISPONIBLE ]
        </p>
        <p className="text-off-white/70 font-sans text-sm">
          Falta configurar NEXT_PUBLIC_TREASURY_ADDRESS.
        </p>
      </div>
    );
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

  return (
    <div className="border-neon-cyan bg-terminal-gray flex flex-col gap-4 border-2 p-6">
      <h2 className="text-neon-cyan font-mono text-lg font-bold tracking-widest">
        INVERTIR_AHORA
      </h2>

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
            ¡Inversión registrada on-chain!
          </p>
        )}
        {submitState === "error" && submitError && (
          <p className={FIELD_ERROR_CLASSES}>{submitError}</p>
        )}

        <button
          type="submit"
          disabled={submitState === "sending"}
          className="bg-neon-cyan text-crt-black border-crt-black border-2 px-6 py-3 font-mono font-bold shadow-[4px_4px_0px_0px_#45A29E] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitState === "sending"
            ? "[ ENVIANDO_TX... ]"
            : "[ INVERTIR_AHORA ]"}
        </button>
      </form>
    </div>
  );
}
