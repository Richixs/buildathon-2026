import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { Hash } from "viem";
import { prisma } from "@/lib/prisma";
import { getCampaignById } from "@/lib/campaigns";
import { activateCampaignSchema } from "@/lib/validations/campaign";
import { verifyCampaignDeployment } from "@/lib/escrow/server";
import { escrowErrorResponse } from "@/lib/escrow/http";

// DRAFT → ACTIVE. The founder already called
// EquityEscrowFactory.createCampaign from their wallet; this checks that tx
// on-chain against the stored terms and links the escrow to the campaign.
// No walletAddress needed: the CampaignCreated event itself proves who the
// startup is.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rawBody = await request.json().catch(() => null);
  const parsed = activateCampaignSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const txHash = parsed.data.txHash.toLowerCase() as Hash;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      milestones: {
        orderBy: { position: "asc" },
        select: { releasePercentage: true },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaña no encontrada." },
      { status: 404 },
    );
  }

  if (campaign.status !== "DRAFT" || campaign.contractAddress) {
    return NextResponse.json(
      { error: "Esta campaña ya tiene un escrow desplegado." },
      { status: 409 },
    );
  }

  try {
    const deployment = await verifyCampaignDeployment(txHash, {
      founderAddress: campaign.founderAddress,
      goalAmount: campaign.goalAmount.toFixed(),
      equityOffered: campaign.equityOffered.toNumber(),
      tokenSymbol: campaign.tokenSymbol,
      fundingDurationSeconds: campaign.fundingDurationSeconds,
      milestonePercentages: campaign.milestones.map(
        (milestone) => milestone.releasePercentage,
      ),
    });

    // `status: "DRAFT"` in the filter makes two concurrent activations race
    // safely: the loser gets P2025 instead of overwriting the winner.
    await prisma.campaign.update({
      where: { id, status: "DRAFT" },
      data: {
        status: "ACTIVE",
        contractAddress: deployment.escrowAddress,
        tokenAddress: deployment.tokenAddress,
        fundingDeadline: deployment.fundingDeadline,
        deployTxHash: txHash,
      },
    });
  } catch (error) {
    const response = escrowErrorResponse(error);
    if (response) return response;

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2025")
    ) {
      return NextResponse.json(
        { error: "Este escrow ya está vinculado a una campaña." },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json(await getCampaignById(id));
}
