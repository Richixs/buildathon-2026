/** @jest-environment node */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaMock } from "@/lib/__mocks__/prisma";
import { GET, POST } from "@/app/api/campaigns/route";

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

const startupProfile = {
  ...investorProfile,
  address: "0x222222222222222222222222222222222222222b",
  username: "acme_founder",
  role: "startup" as const,
  legalName: "Acme Inc.",
};

const validPayload = {
  walletAddress: startupProfile.address,
  title: "NEXUS_LABS",
  description: "Infraestructura de pagos cross-border.",
  goalAmount: 100_000,
  equityOffered: 10,
  tokenSymbol: "nxus",
  fundingDurationDays: 30,
  milestones: [
    { title: "MVP", targetDate: "2027-03-01", releasePercentage: 60 },
    { title: "1K usuarios", targetDate: "2026-12-31", releasePercentage: 40 },
  ],
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const createdCampaign = {
  id: "campaign_1",
  title: validPayload.title,
  description: validPayload.description,
  goalAmount: new Prisma.Decimal(validPayload.goalAmount),
  raisedAmount: new Prisma.Decimal(0),
  escrowBalance: new Prisma.Decimal(0),
  equityOffered: new Prisma.Decimal(validPayload.equityOffered),
  tokenSymbol: "NXUS",
  status: "DRAFT" as const,
  fundingDurationSeconds: 30 * 86_400,
  fundingDeadline: null,
  contractAddress: null,
  tokenAddress: null,
  deployTxHash: null,
  pitchVideoUrl: null,
  founderAddress: startupProfile.address,
  createdAt: now,
  updatedAt: now,
};

const createdCampaignWithRelations = {
  ...createdCampaign,
  founder: { address: startupProfile.address, username: "acme_founder" },
  investments: [],
  milestones: [
    {
      id: "milestone_1",
      title: "MVP",
      targetDate: new Date("2027-03-01"),
      isCompleted: false,
      releasePercentage: 60,
      position: 0,
      createdAt: now,
      campaignId: "campaign_1",
    },
    {
      id: "milestone_2",
      title: "1K usuarios",
      targetDate: new Date("2026-12-31"),
      isCompleted: false,
      releasePercentage: 40,
      position: 1,
      createdAt: now,
      campaignId: "campaign_1",
    },
  ],
};

function mockSuccessfulCreate() {
  prismaMock.profile.findUnique.mockResolvedValue(startupProfile);
  prismaMock.campaign.create.mockResolvedValue(createdCampaign);
  prismaMock.milestone.createMany.mockResolvedValue({ count: 2 });
  prismaMock.campaign.findUnique.mockResolvedValue(
    createdCampaignWithRelations as never,
  );
}

describe("POST /api/campaigns", () => {
  it("returns 403 when the wallet's profile has the investor role", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(investorProfile);

    const response = await POST(
      postRequest({ ...validPayload, walletAddress: investorProfile.address }),
    );

    expect(response.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when the payload fails Zod validation (missing title)", async () => {
    const payloadWithoutTitle: Record<string, unknown> = { ...validPayload };
    delete payloadWithoutTitle.title;

    const response = await POST(postRequest(payloadWithoutTitle));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.fieldErrors.title).toBeDefined();
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when there are no milestones", async () => {
    const response = await POST(
      postRequest({ ...validPayload, milestones: [] }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the milestones' releasePercentage doesn't add up to 100", async () => {
    const response = await POST(
      postRequest({
        ...validPayload,
        milestones: [
          { title: "MVP", targetDate: "2026-12-31", releasePercentage: 60 },
          {
            title: "1K usuarios",
            targetDate: "2027-03-01",
            releasePercentage: 30,
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.fieldErrors.milestones).toContain(
      "La suma de los hitos debe ser 100%.",
    );
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it.each([0, 366, 1.5, undefined])(
    "returns 400 when fundingDurationDays is %p",
    async (fundingDurationDays) => {
      const response = await POST(
        postRequest({ ...validPayload, fundingDurationDays }),
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.fundingDurationDays).toBeDefined();
    },
  );

  it("returns 201 as DRAFT, stores the duration in seconds, keeps milestone order and uppercases tokenSymbol", async () => {
    mockSuccessfulCreate();

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe(createdCampaign.id);
    expect(body.goalAmount).toBe(validPayload.goalAmount);
    expect(body.equityOffered).toBe(validPayload.equityOffered);
    expect(body.fundingDurationSeconds).toBe(30 * 86_400);
    expect(
      body.milestones.map((m: { position: number }) => m.position),
    ).toEqual([0, 1]);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.campaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: validPayload.title,
        founderAddress: startupProfile.address,
        equityOffered: validPayload.equityOffered,
        tokenSymbol: "NXUS",
        fundingDurationSeconds: 30 * 86_400,
      }),
    });
    // Order is the form's (= on-chain release order), not targetDate's.
    expect(prismaMock.milestone.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          title: "MVP",
          releasePercentage: 60,
          position: 0,
          campaignId: createdCampaign.id,
        }),
        expect.objectContaining({
          title: "1K usuarios",
          releasePercentage: 40,
          position: 1,
          campaignId: createdCampaign.id,
        }),
      ],
    });
  });

  it("ignores a client-supplied contractAddress/status — activation is verified on-chain", async () => {
    mockSuccessfulCreate();

    await POST(
      postRequest({
        ...validPayload,
        contractAddress: "0x3333333333333333333333333333333333333333",
        status: "ACTIVE",
      }),
    );

    const [{ data }] = prismaMock.campaign.create.mock.calls[0];
    expect(data).not.toHaveProperty("contractAddress");
    expect(data).not.toHaveProperty("status");
  });

  it("returns 404 when no profile exists for the wallet", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(404);
  });

  it("returns 409 when Prisma rejects the insert", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(startupProfile);
    prismaMock.campaign.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Mock P2002", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(409);
  });

  it("returns 400 when pitchVideoUrl is not a valid YouTube link", async () => {
    const response = await POST(
      postRequest({
        ...validPayload,
        pitchVideoUrl: "https://vimeo.com/123456",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.fieldErrors.pitchVideoUrl).toContain(
      "Debe ser un link válido de YouTube.",
    );
  });

  it("stores a valid pitchVideoUrl and defaults it to null when omitted", async () => {
    mockSuccessfulCreate();

    await POST(
      postRequest({
        ...validPayload,
        pitchVideoUrl: "https://youtu.be/dQw4w9WgXcQ",
      }),
    );

    expect(prismaMock.campaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pitchVideoUrl: "https://youtu.be/dQw4w9WgXcQ",
      }),
    });

    await POST(postRequest(validPayload));

    expect(prismaMock.campaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ pitchVideoUrl: null }),
    });
  });
});

function getRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /api/campaigns", () => {
  it("returns active campaigns with the founder alias and the summed investments", async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      {
        ...createdCampaignWithRelations,
        status: "ACTIVE",
        investments: [
          {
            amount: new Prisma.Decimal(10),
            investorAddress: investorProfile.address,
          },
          {
            amount: new Prisma.Decimal(15.5),
            investorAddress: investorProfile.address,
          },
        ],
      },
    ] as never);

    const response = await GET(getRequest("http://localhost/api/campaigns"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].founder).toEqual({
      address: startupProfile.address,
      alias: "acme_founder",
    });
    expect(body[0].equityOffered).toBe(validPayload.equityOffered);
    expect(body[0].raisedAmount).toBe(25.5);
    expect(body[0].backers).toBe(1);
    expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE" } }),
    );
  });

  it("uses the chain-synced raisedAmount for escrow-backed campaigns", async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      {
        ...createdCampaignWithRelations,
        status: "ACTIVE",
        contractAddress: "0x3333333333333333333333333333333333333333",
        raisedAmount: new Prisma.Decimal(40),
        escrowBalance: new Prisma.Decimal(40),
        investments: [
          {
            amount: new Prisma.Decimal(25),
            investorAddress: investorProfile.address,
          },
        ],
      },
    ] as never);

    const response = await GET(getRequest("http://localhost/api/campaigns"));
    const body = await response.json();

    expect(body[0].raisedAmount).toBe(40);
    expect(body[0].escrowBalance).toBe(40);
  });

  it("returns a founder's own campaigns (any status) when ?founder= is set", async () => {
    prismaMock.campaign.findMany.mockResolvedValue([
      createdCampaignWithRelations,
    ] as never);

    const response = await GET(
      getRequest(
        `http://localhost/api/campaigns?founder=${startupProfile.address.toUpperCase()}`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(prismaMock.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { founderAddress: startupProfile.address },
      }),
    );
  });
});
