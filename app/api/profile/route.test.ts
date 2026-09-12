/** @jest-environment node */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prismaMock } from "@/lib/__mocks__/prisma";
import { GET, POST, PATCH } from "@/app/api/profile/route";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`Mock ${code}`, {
    code,
    clientVersion: "7.10.0",
  });
}

const now = new Date();
const baseProfile = {
  address: "0xabc0000000000000000000000000000000dead",
  username: "satoshi_dev",
  bio: "",
  link: null,
  role: "investor" as const,
  legalName: null,
  createdAt: now,
  updatedAt: now,
};

describe("GET /api/profile", () => {
  it("returns 400 when the address query param is missing", async () => {
    const request = new NextRequest("http://localhost/api/profile");

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it("returns 200 with the profile when the wallet exists", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(baseProfile);

    const request = new NextRequest(
      "http://localhost/api/profile?address=0xABC0000000000000000000000000000000dEAD",
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.username).toBe("satoshi_dev");
    expect(prismaMock.profile.findUnique).toHaveBeenCalledWith({
      where: { address: "0xabc0000000000000000000000000000000dead" },
    });
  });

  it("returns 404 when the wallet doesn't have a profile", async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/profile?address=0xdead",
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
  });
});

describe("POST /api/profile", () => {
  function postRequest(body: unknown) {
    return new Request("http://localhost/api/profile", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("returns 400 when username is missing", async () => {
    const response = await POST(postRequest({ address: "0xabc" }));

    expect(response.status).toBe(400);
    expect(prismaMock.profile.create).not.toHaveBeenCalled();
  });

  it("creates a profile defaulting role to investor", async () => {
    prismaMock.profile.create.mockResolvedValue(baseProfile);

    const response = await POST(
      postRequest({ address: "0xABC", username: "satoshi_dev", bio: "hi" }),
    );

    expect(response.status).toBe(201);
    expect(prismaMock.profile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        address: "0xabc",
        username: "satoshi_dev",
        role: "investor",
        legalName: null,
      }),
    });
  });

  it("creates a profile with role startup and a legalName", async () => {
    prismaMock.profile.create.mockResolvedValue({
      ...baseProfile,
      role: "startup",
      legalName: "Acme Inc.",
    });

    const response = await POST(
      postRequest({
        address: "0xABC",
        username: "acme_founder",
        role: "startup",
        legalName: "Acme Inc.",
      }),
    );

    expect(response.status).toBe(201);
    expect(prismaMock.profile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: "startup",
        legalName: "Acme Inc.",
      }),
    });
  });

  it("returns 409 when a profile for that address already exists", async () => {
    prismaMock.profile.create.mockRejectedValue(prismaError("P2002"));

    const response = await POST(
      postRequest({ address: "0xabc", username: "satoshi_dev" }),
    );

    expect(response.status).toBe(409);
  });

  it("re-throws unexpected (non-Prisma) errors instead of swallowing them", async () => {
    prismaMock.profile.create.mockRejectedValue(new Error("connection lost"));

    await expect(
      POST(postRequest({ address: "0xabc", username: "satoshi_dev" })),
    ).rejects.toThrow("connection lost");
  });
});

describe("PATCH /api/profile", () => {
  function patchRequest(body: unknown) {
    return new Request("http://localhost/api/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  it("returns 400 when address is missing", async () => {
    const response = await PATCH(patchRequest({ role: "startup" }));

    expect(response.status).toBe(400);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid role", async () => {
    const response = await PATCH(
      patchRequest({ address: "0xabc", role: "admin" }),
    );

    expect(response.status).toBe(400);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it("updates the role to startup with the given legalName", async () => {
    prismaMock.profile.update.mockResolvedValue({
      ...baseProfile,
      role: "startup",
      legalName: "Acme Inc.",
    });

    const response = await PATCH(
      patchRequest({
        address: "0xABC",
        role: "startup",
        legalName: "Acme Inc.",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.role).toBe("startup");
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { address: "0xabc" },
      data: { role: "startup", legalName: "Acme Inc." },
    });
  });

  it("returns 404 when the profile to update doesn't exist", async () => {
    prismaMock.profile.update.mockRejectedValue(prismaError("P2025"));

    const response = await PATCH(
      patchRequest({ address: "0xdead", role: "startup", legalName: "X" }),
    );

    expect(response.status).toBe(404);
  });

  it("re-throws unexpected (non-Prisma) errors instead of swallowing them", async () => {
    prismaMock.profile.update.mockRejectedValue(new Error("connection lost"));

    await expect(
      PATCH(patchRequest({ address: "0xabc", role: "startup" })),
    ).rejects.toThrow("connection lost");
  });
});
