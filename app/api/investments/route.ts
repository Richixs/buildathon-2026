import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/address";
import { createInvestmentSchema } from "@/lib/validations/investment";

// "Mis Inversiones" tab: every investment made by this wallet, most recent
// first, with enough of the campaign (status + milestones) to show how many
// hitos are left before the rest of the escrowed capital is released.
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
          status: true,
          milestones: {
            orderBy: { targetDate: "asc" },
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

// Records a native HSK transfer already sent wallet-to-wallet via
// useSendTransaction (see components/campaigns/InvestForm.tsx) — there's no
// escrow contract yet, so this is bookkeeping around a real transfer, not a
// verified on-chain claim. See EQUITY_CHAIN_HANDOFF.md gap #1.
export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = createInvestmentSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { walletAddress, campaignId, amount, txHash } = parsed.data;
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

  if (campaign.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Esta campaña ya no acepta inversiones." },
      { status: 409 },
    );
  }

  try {
    const investment = await prisma.investment.create({
      data: { amount, txHash, investorAddress, campaignId },
    });

    return NextResponse.json(
      { ...investment, amount: investment.amount.toNumber() },
      { status: 201 },
    );
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
}
