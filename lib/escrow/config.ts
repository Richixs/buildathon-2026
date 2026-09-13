import { formatEther, parseEther, type Address } from "viem";

// Shared by client components and Route Handlers — no server-only imports.

export const HASHKEY_TESTNET_ID = 133;
export const HASHKEY_MAINNET_ID = 177;

const DEFAULT_RPC_URLS: Record<number, string> = {
  [HASHKEY_TESTNET_ID]: "https://testnet.hsk.xyz",
  [HASHKEY_MAINNET_ID]: "https://mainnet.hsk.xyz",
};

const EXPLORER_URLS: Record<number, string> = {
  [HASHKEY_TESTNET_ID]: "https://testnet-explorer.hskchain.net",
  [HASHKEY_MAINNET_ID]: "https://explorer.hsk.xyz",
};

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Read at call time (not module scope) so tests can flip env vars without
// resetting the module registry — same pattern the old InvestForm used.

/** Chain the factory (and therefore every escrow) lives on. */
export function getEscrowChainId(): number {
  const raw = Number(process.env.NEXT_PUBLIC_ESCROW_CHAIN_ID);
  return Number.isInteger(raw) && raw > 0 ? raw : HASHKEY_TESTNET_ID;
}

/** EquityEscrowFactory address, or null when it isn't configured. */
export function getFactoryAddress(): Address | null {
  const raw = process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS?.trim();
  return raw && EVM_ADDRESS_REGEX.test(raw) ? (raw as Address) : null;
}

export function getRpcUrl(): string {
  return (
    process.env.ESCROW_RPC_URL?.trim() ||
    DEFAULT_RPC_URLS[getEscrowChainId()] ||
    DEFAULT_RPC_URLS[HASHKEY_TESTNET_ID]
  );
}

export function explorerUrl(kind: "tx" | "address", value: string) {
  const base = EXPLORER_URLS[getEscrowChainId()];
  return base ? `${base}/${kind}/${value}` : null;
}

// Order matches `enum Status` in contracts/contracts/EquityEscrow.sol.
export const ESCROW_STATUS = {
  Funding: 0,
  Active: 1,
  Completed: 2,
  Failed: 3,
} as const;

export type CampaignStatusValue =
  "DRAFT" | "ACTIVE" | "FUNDED" | "COMPLETED" | "FAILED";

const PRISMA_STATUS_BY_CHAIN: Record<number, CampaignStatusValue> = {
  [ESCROW_STATUS.Funding]: "ACTIVE",
  [ESCROW_STATUS.Active]: "FUNDED",
  [ESCROW_STATUS.Completed]: "COMPLETED",
  [ESCROW_STATUS.Failed]: "FAILED",
};

export function prismaStatusFromChain(status: number): CampaignStatusValue {
  const mapped = PRISMA_STATUS_BY_CHAIN[status];
  if (!mapped) throw new Error(`Estado on-chain desconocido: ${status}`);
  return mapped;
}

export const STATUS_LABELS: Record<CampaignStatusValue, string> = {
  DRAFT: "BORRADOR",
  ACTIVE: "EN RONDA",
  FUNDED: "FONDEADA",
  COMPLETED: "COMPLETADA",
  FAILED: "FALLIDA",
};

/** Prisma stores equity as a percentage (12.50); the escrow wants bps (1250). */
export function equityToBps(equityOffered: number): number {
  return Math.round(equityOffered * 100);
}

export const SECONDS_PER_DAY = 86_400;

/**
 * HSK amount (JS number or decimal string) → wei. `String(1e-7)` is
 * "1e-7", which parseEther rejects, so exponent notation goes through
 * toFixed(18) instead.
 */
export function hskToWei(value: number | string): bigint {
  const text = typeof value === "number" ? numberToDecimalString(value) : value;
  return parseEther(text);
}

function numberToDecimalString(value: number): string {
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toFixed(18).replace(/\.?0+$/, "");
}

/** wei → decimal HSK string, suitable for a Prisma Decimal column. */
export function weiToHsk(wei: bigint): string {
  return formatEther(wei);
}

/** Viem/wallet errors carry a readable `shortMessage`; prefer it. */
export function readableTxError(error: unknown): string {
  if (error && typeof error === "object") {
    const { shortMessage, message } = error as {
      shortMessage?: unknown;
      message?: unknown;
    };
    if (typeof shortMessage === "string" && shortMessage) return shortMessage;
    if (typeof message === "string" && message) return message;
  }
  return "Error desconocido.";
}
