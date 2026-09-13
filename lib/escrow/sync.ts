import { prisma } from "@/lib/prisma";
import { getCampaignById, type CampaignDTO } from "@/lib/campaigns";
import { prismaStatusFromChain, weiToHsk } from "@/lib/escrow/config";
import { EscrowVerificationError, readEscrowState } from "@/lib/escrow/server";

/**
 * Reconciles one campaign's Postgres rows with its EquityEscrow: status,
 * totalRaised, escrowBalance, completed milestones and claimed refunds.
 * Only reads chain state, so it's safe to expose without auth — the worst
 * a caller can do is make Postgres more correct.
 *
 * Returns null when the campaign doesn't exist.
 */
export async function syncCampaignFromChain(
  campaignId: string,
): Promise<CampaignDTO | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      contractAddress: true,
      investments: {
        where: { refundedAt: null },
        select: { investorAddress: true },
      },
    },
  });

  if (!campaign) return null;

  if (!campaign.contractAddress) {
    throw new EscrowVerificationError(
      "Esta campaña todavía no tiene escrow desplegado.",
      409,
    );
  }

  const investors = [
    ...new Set(campaign.investments.map((i) => i.investorAddress)),
  ];
  const state = await readEscrowState(campaign.contractAddress, investors);
  const status = prismaStatusFromChain(state.status);

  // claimRefund zeroes investments(investor); it's only callable once the
  // escrow is Failed, so a zero there means the refund was claimed.
  const refundedInvestors =
    status === "FAILED"
      ? investors.filter(
          (investor) => state.contributions.get(investor) === BigInt(0),
        )
      : [];

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status,
        raisedAmount: weiToHsk(state.totalRaised),
        escrowBalance: weiToHsk(state.escrowBalance),
      },
    }),
    prisma.milestone.updateMany({
      where: {
        campaignId: campaign.id,
        position: { lt: state.currentMilestoneIndex },
        isCompleted: false,
      },
      data: { isCompleted: true },
    }),
    prisma.investment.updateMany({
      where: {
        campaignId: campaign.id,
        investorAddress: { in: refundedInvestors },
        refundedAt: null,
      },
      data: { refundedAt: new Date() },
    }),
  ]);

  return getCampaignById(campaign.id);
}
