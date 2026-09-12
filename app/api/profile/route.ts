import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/address";

function isValidRole(role: unknown): role is "investor" | "startup" {
  return role === "investor" || role === "startup";
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "El parámetro address es obligatorio." },
      { status: 400 },
    );
  }

  const profile = await prisma.profile.findUnique({
    where: { address: normalizeAddress(address) },
  });

  if (!profile) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(profile);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const address = body?.address;
  const username = body?.username;
  const bio = body?.bio;
  const link = body?.link;
  const role = body?.role;
  const legalName = body?.legalName;

  if (
    typeof address !== "string" ||
    typeof username !== "string" ||
    !username.trim()
  ) {
    return NextResponse.json(
      { error: "address y username son obligatorios." },
      { status: 400 },
    );
  }

  try {
    const profile = await prisma.profile.create({
      data: {
        address: normalizeAddress(address),
        username: username.trim(),
        bio: typeof bio === "string" ? bio.trim() : "",
        link: typeof link === "string" && link.trim() ? link.trim() : null,
        role: isValidRole(role) ? role : "investor",
        legalName:
          typeof legalName === "string" && legalName.trim()
            ? legalName.trim()
            : null,
      },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe un perfil para esta dirección." },
        { status: 409 },
      );
    }
    throw error;
  }
}

// Persists the investor -> startup upgrade (RegistrationForm/ProfileDashboard's
// "Actualizar Perfil" modal).
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const address = body?.address;
  const role = body?.role;
  const legalName = body?.legalName;

  if (typeof address !== "string") {
    return NextResponse.json(
      { error: "address es obligatorio." },
      { status: 400 },
    );
  }

  if (role !== undefined && !isValidRole(role)) {
    return NextResponse.json({ error: "role inválido." }, { status: 400 });
  }

  try {
    const profile = await prisma.profile.update({
      where: { address: normalizeAddress(address) },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(legalName !== undefined ? { legalName } : {}),
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "No existe un perfil para esta dirección." },
        { status: 404 },
      );
    }
    throw error;
  }
}
