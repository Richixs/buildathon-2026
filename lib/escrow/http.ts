import { NextResponse } from "next/server";
import { BaseError } from "viem";
import { EscrowVerificationError } from "@/lib/escrow/server";

/**
 * Maps chain-verification failures to HTTP responses for Route Handlers.
 * Returns null for anything else so the caller can rethrow it.
 */
export function escrowErrorResponse(error: unknown) {
  if (error instanceof EscrowVerificationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof BaseError) {
    return NextResponse.json(
      { error: `No se pudo leer HashKey Chain: ${error.shortMessage}` },
      { status: 502 },
    );
  }

  return null;
}
