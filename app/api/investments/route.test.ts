/** @jest-environment node */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { BaseError } from "viem";
import { prismaMock } from "@/lib/__mocks__/prisma";
import { GET, POST } from "@/app/api/investments/route";
import {
  EscrowVerificationError,
  verifyInvestmentTx,
} from "@/lib/escrow/server";
import { syncCampaignFromChain } from "@/lib/escrow/sync";

jest.mock("@/lib/escrow/server", () => ({
  ...jest.requireActual("@/lib/escrow/server"),
  verifyInvestmentTx: jest.fn(),
}));
jest.mock("@/lib/escrow/sync", () => ({ syncCampaignFromChain: jest.fn() }));

const now = new Date();
const ESCROW = "0x3333333333333333333333333333333333333333";

const investorProfile = {
  address: "0x111111111111111111111111111111111111111a",
  username: "satoshi_dev",
  bio: "",
  link: null,
  role: "investor" as const,
  legalName: null,
  createdAt: now,
  updatedAt: now,
};

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
  fundingDeadline: now,
  contractAddress: ESCROW,
  tokenAddress: "0x4444444444444444444444444444444444444444",
  deployTxHash: `0x${"cd".repeat(32)}`,
  pitchVideoUrl: null,
  founderAddress: "0x222222222222222222222222222222222222222b",
  createdAt: now,
  updatedAt: now,
};

const TX_HASH = `0x${"AB".repeat(32)}`;

const validPayload = {
  walletAddress: investorProfile.address.toUpperCase().replace("0X", "0x"),
  campaignId: campaign.id,
  txHash: TX_HASH,
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/investments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function mockRecordedInvestment() {
  prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
  prismaMock.campaign.findUnique.mockResolvedValue(campaign);
  jest.mocked(verifyInvestmentTx).mockResolvedValue({
    amountWei: BigInt("2500000000000000000"),
  });
  prismaMock.investment.create.mockResolvedValue({
    id: "investment_1",
    amount: new Prisma.Decimal("2.5"),
    txHash: TX_HASH.toLowerCase(),
    refundedAt: null,
    createdAt: now,
    investorAddress: investorProfile.address,
    campaignId: campaign.id,
  });
}

describe("POST /api/investments", () => {
  beforeEach(() => {
    jest.mocked(syncCampaignFromChain).mockResolvedValue(null);
  });

  it("returns 400 when the payload fails Zod validation", async () => {
    const response = await POST(
      postRequest({ ...validPayload, txHash: "0x123" }),
    );

    expect(response.status).toBe(400);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when no profile exists for the wallet", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(404);
    expect(prismaMock.campaign.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign doesn't exist", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue(null);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(404);
  });

  it("returns 409 when the campaign has no escrow deployed", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue({
      ...campaign,
      status: "DRAFT",
      contractAddress: null,
    });

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(409);
    expect(verifyInvestmentTx).not.toHaveBeenCalled();
  });

  it("returns 403 when the founder tries to invest in their own campaign", async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      ...investorProfile,
      address: campaign.founderAddress,
    });
    prismaMock.campaign.findUnique.mockResolvedValue(campaign);

    const response = await POST(
      postRequest({ ...validPayload, walletAddress: campaign.founderAddress }),
    );

    expect(response.status).toBe(403);
    expect(verifyInvestmentTx).not.toHaveBeenCalled();
  });

  it("passes on-chain verification failures through with their status", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue(campaign);
    jest
      .mocked(verifyInvestmentTx)
      .mockRejectedValue(
        new EscrowVerificationError(
          "La transacción no fue enviada al escrow de esta campaña.",
          422,
        ),
      );

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/no fue enviada al escrow/);
    expect(prismaMock.investment.create).not.toHaveBeenCalled();
  });

  it("returns 502 when the RPC fails", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue(campaign);
    jest
      .mocked(verifyInvestmentTx)
      .mockRejectedValue(new BaseError("fetch failed"));

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(502);
  });

  it("rethrows unexpected errors", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue(campaign);
    jest.mocked(verifyInvestmentTx).mockRejectedValue(new Error("boom"));

    await expect(POST(postRequest(validPayload))).rejects.toThrow("boom");
  });

  it("returns 409 when the txHash was already recorded", async () => {
    mockRecordedInvestment();
    prismaMock.investment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Mock P2002", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(409);
  });

  it("returns 201, stores the on-chain amount (not the client's) and syncs the campaign", async () => {
    mockRecordedInvestment();

    const response = await POST(
      postRequest({ ...validPayload, amount: 999_999 }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.amount).toBe(2.5);
    expect(verifyInvestmentTx).toHaveBeenCalledWith(TX_HASH.toLowerCase(), {
      escrowAddress: ESCROW,
      investorAddress: investorProfile.address,
    });
    expect(prismaMock.investment.create).toHaveBeenCalledWith({
      data: {
        amount: "2.5",
        txHash: TX_HASH.toLowerCase(),
        investorAddress: investorProfile.address,
        campaignId: campaign.id,
      },
    });
    expect(syncCampaignFromChain).toHaveBeenCalledWith(campaign.id);
  });

  it("accepts an investment whose tx already flipped the campaign to FUNDED", async () => {
    mockRecordedInvestment();
    prismaMock.campaign.findUnique.mockResolvedValue({
      ...campaign,
      status: "FUNDED",
    });

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
  });

  it("still returns 201 when the post-investment sync fails", async () => {
    mockRecordedInvestment();
    jest.mocked(syncCampaignFromChain).mockRejectedValue(new Error("rpc down"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

function getRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/investments", () => {
  it("returns 400 when investor is missing", async () => {
    const response = await GET(getRequest("http://localhost/api/investments"));

    expect(response.status).toBe(400);
  });

  it("returns the investor's investments with the linked campaign", async () => {
    const linkedCampaign = {
      id: campaign.id,
      title: campaign.title,
      tokenSymbol: campaign.tokenSymbol,
      tokenAddress: campaign.tokenAddress,
      status: campaign.status,
      milestones: [{ id: "milestone_1", title: "MVP", isCompleted: false }],
    };
    prismaMock.investment.findMany.mockResolvedValue([
      {
        id: "investment_1",
        amount: new Prisma.Decimal(10),
        txHash: TX_HASH,
        refundedAt: null,
        createdAt: now,
        investorAddress: investorProfile.address,
        campaignId: campaign.id,
        campaign: linkedCampaign,
      },
    ] as never);

    const response = await GET(
      getRequest(
        `http://localhost/api/investments?investor=${investorProfile.address}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].amount).toBe(10);
    expect(body[0].refundedAt).toBeNull();
    expect(body[0].campaign).toEqual(linkedCampaign);
  });
});
