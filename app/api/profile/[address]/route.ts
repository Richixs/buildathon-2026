import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAddress } from "@/lib/address";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  const profile = await prisma.profile.findUnique({
    where: { address: normalizeAddress(address) },
  });

  if (!profile) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(profile);
}
