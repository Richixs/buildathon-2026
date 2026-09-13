/** @jest-environment node */

import { Prisma } from "@prisma/client";
import { prismaMock } from "@/lib/__mocks__/prisma";
import { POST } from "@/app/api/campaigns/[id]/activate/route";
import {
  EscrowVerificationError,
  verifyCampaignDeployment,
} from "@/lib/escrow/server";

jest.mock("@/lib/escrow/server", () => ({
  ...jest.requireActual("@/lib/escrow/server"),
  verifyCampaignDeployment: jest.fn(),
}));

const now = new Date();
const TX_HASH = `0x${"AB".repeat(32)}`;
const ESCROW = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
const DEADLINE = new Date("2026-10-13T00:00:00Z");

const draftCampaign = {
  id: "campaign_1",
  title: "NEXUS_LABS",
  description: "Infraestructura de pagos cross-border.",
  goalAmount: new Prisma.Decimal("100000.5"),
  raisedAmount: new Prisma.Decimal(0),
  escrowBalance: new Prisma.Decimal(0),
  equityOffered: new Prisma.Decimal("12.5"),
  tokenSymbol: "NXUS",
  status: "DRAFT" as const,
  fundingDurationSeconds: 2_592_000,
  fundingDeadline: null,
  contractAddress: null,
  tokenAddress: null,
  deployTxHash: null,
  pitchVideoUrl: null,
  founderAddress: "0x222222222222222222222222222222222222222b",
  createdAt: now,
  updatedAt: now,
  milestones: [{ releasePercentage: 60 }, { releasePercentage: 40 }],
};

function request(body: unknown) {
  return new Request("http://localhost/api/campaigns/campaign_1/activate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "campaign_1" }) };

describe("POST /api/campaigns/[id]/activate", () => {
  it("returns 400 when txHash is invalid", async () => {
    const response = await POST(request({ txHash: "0x12" }), context);

    expect(response.status).toBe(400);
    expect(prismaMock.campaign.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign doesn't exist", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null);

    const response = await POST(request({ txHash: TX_HASH }), context);

    expect(response.status).toBe(404);
  });

  it("returns 409 when the campaign already has an escrow", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({
      ...draftCampaign,
      status: "ACTIVE",
      contractAddress: ESCROW,
    } as never);

    const response = await POST(request({ txHash: TX_HASH }), context);

    expect(response.status).toBe(409);
    expect(verifyCampaignDeployment).not.toHaveBeenCalled();
  });

  it("returns the verification error when the tx doesn't match the campaign", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(draftCampaign as never);
    jest
      .mocked(verifyCampaignDeployment)
      .mockRejectedValue(
        new EscrowVerificationError(
          "El escrow desplegado no coincide con la campaña (goalAmount).",
          422,
        ),
      );

    const response = await POST(request({ txHash: TX_HASH }), context);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/goalAmount/);
    expect(prismaMock.campaign.update).not.toHaveBeenCalled();
  });

  it("verifies the stored terms on-chain and activates the campaign", async () => {
    prismaMock.campaign.findUnique
      .mockResolvedValueOnce(draftCampaign as never)
      .mockResolvedValueOnce({
        ...draftCampaign,
        status: "ACTIVE",
        contractAddress: ESCROW,
        founder: { address: draftCampaign.founderAddress, username: "acme" },
        investments: [],
        milestones: [],
      } as never);
    jest.mocked(verifyCampaignDeployment).mockResolvedValue({
      escrowAddress: ESCROW,
      tokenAddress: TOKEN,
      fundingDeadline: DEADLINE,
    });

    const response = await POST(request({ txHash: TX_HASH }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ACTIVE");
    expect(verifyCampaignDeployment).toHaveBeenCalledWith(
      TX_HASH.toLowerCase(),
      {
        founderAddress: draftCampaign.founderAddress,
        goalAmount: "100000.5",
        equityOffered: 12.5,
        tokenSymbol: "NXUS",
        fundingDurationSeconds: 2_592_000,
        milestonePercentages: [60, 40],
      },
    );
    expect(prismaMock.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1", status: "DRAFT" },
      data: {
        status: "ACTIVE",
        contractAddress: ESCROW,
        tokenAddress: TOKEN,
        fundingDeadline: DEADLINE,
        deployTxHash: TX_HASH.toLowerCase(),
      },
    });
  });

  it.each(["P2002", "P2025"])(
    "returns 409 when the update loses a race (%s)",
    async (code) => {
      prismaMock.campaign.findUnique.mockResolvedValue(draftCampaign as never);
      jest.mocked(verifyCampaignDeployment).mockResolvedValue({
        escrowAddress: ESCROW,
        tokenAddress: TOKEN,
        fundingDeadline: DEADLINE,
      });
      prismaMock.campaign.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Mock", {
          code,
          clientVersion: "7.10.0",
        }),
      );

      const response = await POST(request({ txHash: TX_HASH }), context);

      expect(response.status).toBe(409);
    },
  );

  it("rethrows unexpected errors", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(draftCampaign as never);
    jest.mocked(verifyCampaignDeployment).mockRejectedValue(new Error("boom"));

    await expect(POST(request({ txHash: TX_HASH }), context)).rejects.toThrow(
      "boom",
    );
  });
});
