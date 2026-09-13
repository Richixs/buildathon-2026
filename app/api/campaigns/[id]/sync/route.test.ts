/** @jest-environment node */

import { Prisma } from "@prisma/client";
import { BaseError } from "viem";
import { prismaMock } from "@/lib/__mocks__/prisma";
import { POST } from "@/app/api/campaigns/[id]/sync/route";
import { readEscrowState } from "@/lib/escrow/server";

// Real lib/escrow/sync.ts against mocked Prisma + a mocked chain snapshot.
jest.mock("@/lib/escrow/server", () => ({
  ...jest.requireActual("@/lib/escrow/server"),
  readEscrowState: jest.fn(),
}));

const now = new Date();
const HSK = BigInt("1000000000000000000");
const ESCROW = "0x3333333333333333333333333333333333333333";
const INVESTOR_A = "0x111111111111111111111111111111111111111a";
const INVESTOR_B = "0x111111111111111111111111111111111111111b";

const context = { params: Promise.resolve({ id: "campaign_1" }) };
const request = () =>
  new Request("http://localhost/api/campaigns/campaign_1/sync", {
    method: "POST",
  });

const campaignRow = {
  id: "campaign_1",
  title: "NEXUS_LABS",
  description: "Infraestructura de pagos cross-border.",
  goalAmount: new Prisma.Decimal(100),
  raisedAmount: new Prisma.Decimal(100),
  escrowBalance: new Prisma.Decimal(60),
  equityOffered: new Prisma.Decimal(10),
  tokenSymbol: "NXUS",
  status: "FUNDED" as const,
  fundingDurationSeconds: 3600,
  fundingDeadline: now,
  contractAddress: ESCROW,
  tokenAddress: "0x4444444444444444444444444444444444444444",
  deployTxHash: null,
  pitchVideoUrl: null,
  founderAddress: "0x222222222222222222222222222222222222222b",
  createdAt: now,
  updatedAt: now,
  founder: {
    address: "0x222222222222222222222222222222222222222b",
    username: "acme",
  },
  investments: [],
  milestones: [],
};

function mockCampaignForSync(
  investments: { investorAddress: string }[],
  contractAddress: string | null = ESCROW,
) {
  prismaMock.campaign.findUnique
    .mockResolvedValueOnce({
      id: "campaign_1",
      contractAddress,
      investments,
    } as never)
    .mockResolvedValueOnce(campaignRow as never);
}

describe("POST /api/campaigns/[id]/sync", () => {
  it("returns 404 when the campaign doesn't exist", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null);

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
  });

  it("returns 409 when the campaign has no escrow yet", async () => {
    mockCampaignForSync([], null);

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(readEscrowState).not.toHaveBeenCalled();
  });

  it("writes status, totals and completed milestones from the chain", async () => {
    mockCampaignForSync([
      { investorAddress: INVESTOR_A },
      { investorAddress: INVESTOR_A },
    ]);
    jest.mocked(readEscrowState).mockResolvedValue({
      status: 1,
      totalRaised: BigInt(100) * HSK,
      escrowBalance: BigInt(60) * HSK,
      currentMilestoneIndex: 1,
      contributions: new Map([[INVESTOR_A, BigInt(100) * HSK]]),
    });

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("campaign_1");
    expect(readEscrowState).toHaveBeenCalledWith(ESCROW, [INVESTOR_A]);
    expect(prismaMock.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: { status: "FUNDED", raisedAmount: "100", escrowBalance: "60" },
    });
    expect(prismaMock.milestone.updateMany).toHaveBeenCalledWith({
      where: {
        campaignId: "campaign_1",
        position: { lt: 1 },
        isCompleted: false,
      },
      data: { isCompleted: true },
    });
    expect(prismaMock.investment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ investorAddress: { in: [] } }),
      }),
    );
  });

  it("marks investments refunded once claimRefund zeroed them on a FAILED escrow", async () => {
    mockCampaignForSync([
      { investorAddress: INVESTOR_A },
      { investorAddress: INVESTOR_B },
    ]);
    jest.mocked(readEscrowState).mockResolvedValue({
      status: 3,
      totalRaised: BigInt(40) * HSK,
      escrowBalance: BigInt(25) * HSK,
      currentMilestoneIndex: 0,
      contributions: new Map([
        [INVESTOR_A, BigInt(0)],
        [INVESTOR_B, BigInt(25) * HSK],
      ]),
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(prismaMock.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(prismaMock.investment.updateMany).toHaveBeenCalledWith({
      where: {
        campaignId: "campaign_1",
        investorAddress: { in: [INVESTOR_A] },
        refundedAt: null,
      },
      data: { refundedAt: expect.any(Date) },
    });
  });

  it("returns 502 when the chain can't be read", async () => {
    mockCampaignForSync([]);
    jest
      .mocked(readEscrowState)
      .mockRejectedValue(new BaseError("fetch failed"));

    const response = await POST(request(), context);

    expect(response.status).toBe(502);
  });

  it("rethrows unexpected errors", async () => {
    mockCampaignForSync([]);
    jest.mocked(readEscrowState).mockRejectedValue(new Error("boom"));

    await expect(POST(request(), context)).rejects.toThrow("boom");
  });
});
