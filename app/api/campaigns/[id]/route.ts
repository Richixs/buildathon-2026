import { NextResponse } from "next/server";
import { getCampaignById } from "@/lib/campaigns";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const campaign = await getCampaignById(id);

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaña no encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json(campaign);
}
