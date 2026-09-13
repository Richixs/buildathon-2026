import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/address";
import { createCampaignSchema } from "@/lib/validations/campaign";
import { getActiveCampaigns, getCampaignsByFounder } from "@/lib/campaigns";

// No `?founder=` → the public "STARTUPS_ACTIVAS" feed (ACTIVE only). With it
// → a founder's own campaigns regardless of status, for the "Mis Startups"
// tab of their dashboard.
export async function GET(request: NextRequest) {
  const founder = request.nextUrl.searchParams.get("founder");

  const campaigns = founder
    ? await getCampaignsByFounder(normalizeAddress(founder))
    : await getActiveCampaigns();

  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = createCampaignSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    walletAddress,
    title,
    description,
    goalAmount,
    equityOffered,
    tokenSymbol,
    contractAddress,
    pitchVideoUrl,
    milestones,
  } = parsed.data;
  const founderAddress = normalizeAddress(walletAddress);

  const founder = await prisma.profile.findUnique({
    where: { address: founderAddress },
  });

  if (!founder) {
    return NextResponse.json(
      { error: "No existe un perfil para esta wallet." },
      { status: 404 },
    );
  }

  if (founder.role !== "startup") {
    return NextResponse.json(
      { error: "Solo los perfiles de tipo Startup pueden crear campañas." },
      { status: 403 },
    );
  }

  try {
    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          title,
          description,
          goalAmount,
          equityOffered,
          tokenSymbol,
          contractAddress: contractAddress ?? null,
          pitchVideoUrl: pitchVideoUrl ?? null,
          founderAddress,
        },
      });

      await tx.milestone.createMany({
        data: milestones.map((milestone) => ({
          title: milestone.title,
          targetDate: milestone.targetDate,
          releasePercentage: milestone.releasePercentage,
          campaignId: created.id,
        })),
      });

      return tx.campaign.findUniqueOrThrow({
        where: { id: created.id },
        include: { milestones: true },
      });
    });

    return NextResponse.json(
      {
        ...campaign,
        goalAmount: campaign.goalAmount.toNumber(),
        equityOffered: campaign.equityOffered.toNumber(),
        raisedAmount: campaign.raisedAmount.toNumber(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "No se pudo crear la campaña." },
        { status: 409 },
      );
    }
    throw error;
  }
}
