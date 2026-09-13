/** @jest-environment node */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaMock } from "@/lib/__mocks__/prisma";
import { GET, POST } from "@/app/api/investments/route";

const now = new Date();

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
  equityOffered: new Prisma.Decimal(10),
  tokenSymbol: "NXUS",
  status: "ACTIVE" as const,
  contractAddress: null,
  pitchVideoUrl: null,
  founderAddress: "0x222222222222222222222222222222222222222b",
  createdAt: now,
  updatedAt: now,
};

const validPayload = {
  walletAddress: investorProfile.address,
  campaignId: campaign.id,
  amount: 10,
  txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/investments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/investments", () => {
  it("returns 400 when the payload fails Zod validation", async () => {
    const response = await POST(postRequest({ ...validPayload, amount: -1 }));

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

  it("returns 409 when the campaign isn't ACTIVE", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue({
      ...campaign,
      status: "FUNDED",
    });

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(409);
    expect(prismaMock.investment.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the txHash was already recorded", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue(campaign);
    prismaMock.investment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Mock P2002", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(409);
  });

  it("returns 201 and creates the investment", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);
    prismaMock.campaign.findUnique.mockResolvedValue(campaign);
    prismaMock.investment.create.mockResolvedValue({
      id: "investment_1",
      amount: new Prisma.Decimal(validPayload.amount),
      txHash: validPayload.txHash,
      createdAt: now,
      investorAddress: investorProfile.address,
      campaignId: campaign.id,
    });

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.amount).toBe(validPayload.amount);
    expect(prismaMock.investment.create).toHaveBeenCalledWith({
      data: {
        amount: validPayload.amount,
        txHash: validPayload.txHash,
        investorAddress: investorProfile.address,
        campaignId: campaign.id,
      },
    });
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
    prismaMock.investment.findMany.mockResolvedValue([
      {
        id: "investment_1",
        amount: new Prisma.Decimal(10),
        txHash: validPayload.txHash,
        createdAt: now,
        investorAddress: investorProfile.address,
        campaignId: campaign.id,
        campaign: {
          id: campaign.id,
          title: campaign.title,
          tokenSymbol: campaign.tokenSymbol,
          status: campaign.status,
          milestones: [{ id: "milestone_1", title: "MVP", isCompleted: false }],
        },
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
    expect(body[0].campaign).toEqual({
      id: campaign.id,
      title: campaign.title,
      tokenSymbol: campaign.tokenSymbol,
      status: campaign.status,
      milestones: [{ id: "milestone_1", title: "MVP", isCompleted: false }],
    });
  });
});
