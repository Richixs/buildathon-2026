import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Shared between app/api/campaigns/route.ts (JSON API, consumed client-side)
// and Server Components (app/page.tsx, app/campaigns/[id]/page.tsx) that can
// query Postgres directly — avoids an internal fetch() round-trip to our own
// API from server-rendered code.
const CAMPAIGN_INCLUDE = {
  founder: { select: { address: true, username: true } },
  investments: { select: { amount: true, investorAddress: true } },
  milestones: { orderBy: { position: "asc" } },
} satisfies Prisma.CampaignInclude;

type CampaignWithRelations = Prisma.CampaignGetPayload<{
  include: typeof CAMPAIGN_INCLUDE;
}>;

export interface CampaignMilestoneDTO {
  id: string;
  title: string;
  targetDate: Date;
  isCompleted: boolean;
  releasePercentage: number;
  position: number;
}

export interface CampaignDTO {
  id: string;
  title: string;
  description: string;
  goalAmount: number;
  raisedAmount: number;
  escrowBalance: number;
  equityOffered: number;
  tokenSymbol: string;
  status: string;
  fundingDurationSeconds: number;
  fundingDeadline: Date | null;
  contractAddress: string | null;
  tokenAddress: string | null;
  deployTxHash: string | null;
  pitchVideoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  founderAddress: string;
  founder: { address: string; alias: string };
  milestones: CampaignMilestoneDTO[];
  backers: number;
}

function sumInvested(investments: { amount: Prisma.Decimal }[]) {
  return investments
    .reduce(
      (sum, investment) => sum.add(investment.amount),
      new Prisma.Decimal(0),
    )
    .toNumber();
}

function countBackers(investments: { investorAddress: string }[]) {
  return new Set(investments.map((investment) => investment.investorAddress))
    .size;
}

function serializeCampaign(campaign: CampaignWithRelations): CampaignDTO {
  const { investments, founder, milestones, ...rest } = campaign;

  return {
    ...rest,
    goalAmount: rest.goalAmount.toNumber(),
    equityOffered: rest.equityOffered.toNumber(),
    // Escrow-backed campaigns: `raisedAmount` is EquityEscrow.totalRaised,
    // synced from chain (lib/escrow/sync.ts), so an invest() whose
    // POST /api/investments never landed still counts. Pre-escrow rows
    // fall back to the off-chain bookkeeping.
    raisedAmount: rest.contractAddress
      ? rest.raisedAmount.toNumber()
      : sumInvested(investments),
    escrowBalance: rest.escrowBalance.toNumber(),
    backers: countBackers(investments),
    founder: { address: founder.address, alias: founder.username },
    milestones,
  };
}

export async function getActiveCampaigns(): Promise<CampaignDTO[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: CAMPAIGN_INCLUDE,
  });

  return campaigns.map(serializeCampaign);
}

export async function getCampaignsByFounder(
  founderAddress: string,
): Promise<CampaignDTO[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { founderAddress },
    orderBy: { createdAt: "desc" },
    include: CAMPAIGN_INCLUDE,
  });

  return campaigns.map(serializeCampaign);
}

export async function getCampaignById(id: string): Promise<CampaignDTO | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: CAMPAIGN_INCLUDE,
  });

  return campaign ? serializeCampaign(campaign) : null;
}

export interface PlatformStats {
  escrowBalanceHsk: number;
  campaignsCount: number;
  milestonesCompleted: number;
}

// Powers the home page's stats strip — real aggregates instead of the
// placeholder numbers that used to live there.
export async function getPlatformStats(): Promise<PlatformStats> {
  const [escrowTotal, campaignsCount, milestonesCompleted] = await Promise.all([
    prisma.campaign.aggregate({ _sum: { escrowBalance: true } }),
    prisma.campaign.count(),
    prisma.milestone.count({ where: { isCompleted: true } }),
  ]);

  return {
    escrowBalanceHsk: (
      escrowTotal._sum.escrowBalance ?? new Prisma.Decimal(0)
    ).toNumber(),
    campaignsCount,
    milestonesCompleted,
  };
}
