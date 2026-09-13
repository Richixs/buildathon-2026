import { NextResponse } from "next/server";
import { syncCampaignFromChain } from "@/lib/escrow/sync";
import { escrowErrorResponse } from "@/lib/escrow/http";

// Pull-based reconciliation: the client calls this after any escrow tx
// (invest, releaseNextMilestone, claimRefund, markFailedIfExpired,
// cancelCampaign) or when it notices Postgres lagging behind the chain.
// Read-only against the chain, so it needs no auth.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const campaign = await syncCampaignFromChain(id);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaña no encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(campaign);
  } catch (error) {
    const response = escrowErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
