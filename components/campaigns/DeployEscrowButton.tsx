"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import ConnectButton from "@/components/web3/ConnectButton";
import {
  DEPLOY_STEP_LABELS,
  useDeployEscrow,
  type DeployableCampaign,
  type DeployStep,
} from "@/hooks/use-deploy-escrow";
import { readableTxError } from "@/lib/escrow/config";

/**
 * Retry path for a DRAFT campaign whose escrow deploy didn't finish in
 * CreateCampaignForm (wallet rejected, tx dropped, activation failed…).
 */
export default function DeployEscrowButton({
  campaign,
  founderAddress,
}: {
  campaign: DeployableCampaign;
  founderAddress: string;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const deploy = useDeployEscrow();
  const [step, setStep] = useState<DeployStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFounder = address?.toLowerCase() === founderAddress.toLowerCase();

  if (!address) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-off-white/70 font-mono text-sm">
          ¿Eres el founder? Conecta tu wallet para desplegar el escrow.
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (!isFounder) {
    return (
      <p className="text-off-white/70 font-mono text-sm">
        El founder todavía no desplegó el escrow on-chain de esta campaña.
      </p>
    );
  }

  async function handleDeploy() {
    setError(null);
    try {
      await deploy(campaign, setStep);
      router.refresh();
    } catch (deployError) {
      setError(readableTxError(deployError));
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleDeploy}
        disabled={step !== null}
        className="bg-neon-cyan text-crt-black border-crt-black border-2 px-6 py-3 font-mono font-bold shadow-[4px_4px_0px_0px_#45A29E] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {step ? DEPLOY_STEP_LABELS[step] : "[ DESPLEGAR_ESCROW_ONCHAIN ]"}
      </button>
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
    </div>
  );
}
