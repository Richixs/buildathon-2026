import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import type { Hash } from "viem";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/address";
import { createInvestmentSchema } from "@/lib/validations/investment";
import { weiToHsk } from "@/lib/escrow/config";
import { verifyInvestmentTx } from "@/lib/escrow/server";
import { escrowErrorResponse } from "@/lib/escrow/http";
import { syncCampaignFromChain } from "@/lib/escrow/sync";

// "Mis Inversiones" tab: every investment made by this wallet, most recent
// first, with enough of the campaign (status + milestones + token) to show
// how many hitos are left and the investor's EquityToken balance.
export async function GET(request: NextRequest) {
  const investor = request.nextUrl.searchParams.get("investor");

  if (!investor) {
    return NextResponse.json(
      { error: "El parámetro investor es obligatorio." },
      { status: 400 },
    );
  }

  const investments = await prisma.investment.findMany({
    where: { investorAddress: normalizeAddress(investor) },
    orderBy: { createdAt: "desc" },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          tokenSymbol: true,
          tokenAddress: true,
          status: true,
          milestones: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, isCompleted: true },
          },
        },
      },
    },
  });

  const body = investments.map(({ amount, campaign, ...investment }) => ({
    ...investment,
    amount: amount.toNumber(),
    campaign,
  }));

  return NextResponse.json(body);
}

// Records an EquityEscrow.invest() call. The amount comes from the tx's
// Invested event, not from the client, and the tx must target this
// campaign's escrow from this wallet.
export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = createInvestmentSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { walletAddress, campaignId } = parsed.data;
  const txHash = parsed.data.txHash.toLowerCase() as Hash;
  const investorAddress = normalizeAddress(walletAddress);

  const investor = await prisma.profile.findUnique({
    where: { address: investorAddress },
  });

  if (!investor) {
    return NextResponse.json(
      { error: "No existe un perfil para esta wallet." },
      { status: 404 },
    );
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: "La campaña no existe." },
      { status: 404 },
    );
  }

  if (!campaign.contractAddress) {
    return NextResponse.json(
      { error: "Esta campaña todavía no tiene escrow desplegado." },
      { status: 409 },
    );
  }

  if (campaign.founderAddress === investorAddress) {
    return NextResponse.json(
      { error: "El founder no puede invertir en su propia campaña." },
      { status: 403 },
    );
  }

  // No `status === "ACTIVE"` check here: the tx that fills the goal also
  // flips the escrow to Active (FUNDED), and an Invested event can only
  // exist if the escrow was accepting funds when it was mined.
  let amountWei: bigint;
  try {
    ({ amountWei } = await verifyInvestmentTx(txHash, {
      escrowAddress: campaign.contractAddress,
      investorAddress,
    }));
  } catch (error) {
    const response = escrowErrorResponse(error);
    if (response) return response;
    throw error;
  }

  let investment;
  try {
    investment = await prisma.investment.create({
      data: {
        amount: weiToHsk(amountWei),
        txHash,
        investorAddress,
        campaignId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Esta transacción ya fue registrada." },
        { status: 409 },
      );
    }
    throw error;
  }

  // Best effort: the investment is already recorded; a failed sync only
  // means totals/status catch up on the next one.
  await syncCampaignFromChain(campaignId).catch((error) => {
    console.error("syncCampaignFromChain failed after investment", error);
  });

  return NextResponse.json(
    { ...investment, amount: investment.amount.toNumber() },
    { status: 201 },
  );
}
