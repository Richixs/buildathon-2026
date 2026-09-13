import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/address";
import { createCampaignSchema } from "@/lib/validations/campaign";
import {
  getActiveCampaigns,
  getCampaignById,
  getCampaignsByFounder,
} from "@/lib/campaigns";
import { SECONDS_PER_DAY } from "@/lib/escrow/config";

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

// Creates the campaign as DRAFT. It only becomes ACTIVE through
// POST /api/campaigns/[id]/activate, once the founder's
// EquityEscrowFactory.createCampaign tx is verified on-chain.
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
    fundingDurationDays,
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
    const campaignId = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          title,
          description,
          goalAmount,
          equityOffered,
          tokenSymbol,
          fundingDurationSeconds: fundingDurationDays * SECONDS_PER_DAY,
          pitchVideoUrl: pitchVideoUrl ?? null,
          founderAddress,
        },
      });

      // `position` is the index in the escrow's milestonePercentages —
      // the order the founder entered them in the form.
      await tx.milestone.createMany({
        data: milestones.map((milestone, position) => ({
          title: milestone.title,
          targetDate: milestone.targetDate,
          releasePercentage: milestone.releasePercentage,
          position,
          campaignId: created.id,
        })),
      });

      return created.id;
    });

    return NextResponse.json(await getCampaignById(campaignId), {
      status: 201,
    });
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
