"use client";

import { useCallback } from "react";
import { equityEscrowFactoryAbi } from "@/lib/abi";
import { equityToBps, getFactoryAddress, hskToWei } from "@/lib/escrow/config";
import { useEscrowWrite } from "@/hooks/use-escrow-write";
import type { CampaignDTO } from "@/lib/campaigns";

export type DeployStep = "signing" | "confirming" | "activating";

export const DEPLOY_STEP_LABELS: Record<DeployStep, string> = {
  signing: "[ FIRMA_EN_WALLET... ]",
  confirming: "[ DESPLEGANDO_ESCROW... ]",
  activating: "[ VERIFICANDO_Y_ACTIVANDO... ]",
};

export type DeployableCampaign = Pick<
  CampaignDTO,
  | "id"
  | "title"
  | "goalAmount"
  | "equityOffered"
  | "tokenSymbol"
  | "fundingDurationSeconds"
> & {
  milestones: { releasePercentage: number; position: number }[];
};

/**
 * Founder flow for a DRAFT campaign: EquityEscrowFactory.createCampaign from
 * the founder's wallet (they become `startup` and pay gas), then
 * POST /api/campaigns/[id]/activate so the server verifies the tx and flips
 * the campaign to ACTIVE.
 */
export function useDeployEscrow() {
  const send = useEscrowWrite();

  return useCallback(
    async (
      campaign: DeployableCampaign,
      onStep?: (step: DeployStep) => void,
    ) => {
      const factory = getFactoryAddress();
      if (!factory) {
        throw new Error(
          "Falta configurar NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS: la campaña quedó como borrador.",
        );
      }

      const percentages = [...campaign.milestones]
        .sort((a, b) => a.position - b.position)
        .map((milestone) => milestone.releasePercentage);

      onStep?.("signing");
      const receipt = await send(
        (write) =>
          write({
            address: factory,
            abi: equityEscrowFactoryAbi,
            functionName: "createCampaign",
            args: [
              hskToWei(campaign.goalAmount),
              equityToBps(campaign.equityOffered),
              BigInt(campaign.fundingDurationSeconds),
              campaign.title,
              campaign.tokenSymbol,
              percentages,
            ],
          }),
        { onSubmitted: () => onStep?.("confirming") },
      );

      onStep?.("activating");
      const response = await fetch(`/api/campaigns/${campaign.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: receipt.transactionHash }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "No se pudo activar la campaña.");
      }

      return (await response.json()) as CampaignDTO;
    },
    [send],
  );
}
