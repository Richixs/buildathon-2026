/** @jest-environment node */

import { Prisma } from "@prisma/client";
import { prismaMock } from "@/lib/__mocks__/prisma";
import { GET } from "@/app/api/campaigns/[id]/route";

const now = new Date();

const campaign = {
  id: "campaign_1",
  title: "NEXUS_LABS",
  description: "Infraestructura de pagos cross-border.",
  goalAmount: new Prisma.Decimal(100_000),
  raisedAmount: new Prisma.Decimal(0),
  escrowBalance: new Prisma.Decimal(0),
  equityOffered: new Prisma.Decimal(10),
  tokenSymbol: "NXUS",
  status: "ACTIVE" as const,
  fundingDurationSeconds: 2_592_000,
  fundingDeadline: null,
  contractAddress: null,
  tokenAddress: null,
  deployTxHash: null,
  pitchVideoUrl: "https://youtu.be/dQw4w9WgXcQ",
  founderAddress: "0x222222222222222222222222222222222222222b",
  createdAt: now,
  updatedAt: now,
  founder: {
    address: "0x222222222222222222222222222222222222222b",
    username: "acme_founder",
  },
  investments: [
    {
      amount: new Prisma.Decimal(10),
      investorAddress: "0x111111111111111111111111111111111111111a",
    },
  ],
  milestones: [
    {
      id: "milestone_1",
      title: "MVP",
      targetDate: now,
      isCompleted: false,
      releasePercentage: 100,
      position: 0,
      createdAt: now,
      campaignId: "campaign_1",
    },
  ],
};

function getRequest() {
  return new Request("http://localhost/api/campaigns/campaign_1");
}

describe("GET /api/campaigns/[id]", () => {
  it("returns 404 when the campaign doesn't exist", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null);

    const response = await GET(getRequest(), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns the serialized campaign with milestones and computed totals", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(campaign as never);

    const response = await GET(getRequest(), {
      params: Promise.resolve({ id: "campaign_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("campaign_1");
    expect(body.raisedAmount).toBe(10);
    expect(body.backers).toBe(1);
    expect(body.milestones).toHaveLength(1);
    expect(body.founder).toEqual({
      address: campaign.founderAddress,
      alias: "acme_founder",
    });
    expect(body.pitchVideoUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
  });
});
