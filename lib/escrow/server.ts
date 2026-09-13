import {
  createPublicClient,
  http,
  parseEventLogs,
  TransactionReceiptNotFoundError,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { equityEscrowAbi, equityEscrowFactoryAbi } from "@/lib/abi";
import {
  equityToBps,
  getFactoryAddress,
  getRpcUrl,
  hskToWei,
} from "@/lib/escrow/config";

// Server-side view of the chain. Route Handlers never trust amounts,
// addresses or statuses sent by the client: they take a txHash (or a
// campaign id) and read the truth from HashKey Chain through this module.

export class EscrowVerificationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EscrowVerificationError";
  }
}

let cached: { url: string; client: PublicClient } | null = null;

export function getPublicClient(): PublicClient {
  const url = getRpcUrl();
  if (!cached || cached.url !== url) {
    cached = { url, client: createPublicClient({ transport: http(url) }) };
  }
  return cached.client;
}

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

async function getSuccessfulReceipt(client: PublicClient, hash: Hash) {
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      throw new EscrowVerificationError(
        "La transacción aún no está confirmada on-chain.",
        409,
      );
    }
    throw error;
  }

  if (receipt.status !== "success") {
    throw new EscrowVerificationError("La transacción revirtió on-chain.", 422);
  }

  return receipt;
}

async function readMilestonePercentages(
  client: PublicClient,
  escrow: Address,
  blockNumber: bigint,
) {
  const count = await client.readContract({
    address: escrow,
    abi: equityEscrowAbi,
    functionName: "milestoneCount",
    blockNumber,
  });

  return Promise.all(
    Array.from({ length: Number(count) }, (_, index) =>
      client.readContract({
        address: escrow,
        abi: equityEscrowAbi,
        functionName: "milestonePercentages",
        args: [BigInt(index)],
        blockNumber,
      }),
    ),
  );
}

export interface CampaignTerms {
  founderAddress: string;
  /** Decimal HSK string, e.g. Prisma's `goalAmount.toFixed()`. */
  goalAmount: string;
  equityOffered: number;
  tokenSymbol: string;
  fundingDurationSeconds: number;
  /** releasePercentage of each milestone, in `position` order. */
  milestonePercentages: number[];
}

export interface VerifiedDeployment {
  escrowAddress: string;
  tokenAddress: string;
  fundingDeadline: Date;
}

/**
 * Proves that `txHash` is an `EquityEscrowFactory.createCampaign` call on the
 * configured factory, sent by the campaign's founder, with exactly the terms
 * stored in Postgres.
 */
export async function verifyCampaignDeployment(
  txHash: Hash,
  terms: CampaignTerms,
  client: PublicClient = getPublicClient(),
): Promise<VerifiedDeployment> {
  const factory = getFactoryAddress();
  if (!factory) {
    throw new EscrowVerificationError(
      "NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS no está configurada.",
      503,
    );
  }

  const receipt = await getSuccessfulReceipt(client, txHash);
  const [created] = parseEventLogs({
    abi: equityEscrowFactoryAbi,
    eventName: "CampaignCreated",
    logs: receipt.logs,
  }).filter((log) => sameAddress(log.address, factory));

  if (!created) {
    throw new EscrowVerificationError(
      "La transacción no desplegó un escrow desde la factory configurada.",
      422,
    );
  }

  const { startup, escrow, equityToken, goalAmount, tokenSymbol } =
    created.args;
  const mismatch = (field: string) =>
    new EscrowVerificationError(
      `El escrow desplegado no coincide con la campaña (${field}).`,
      422,
    );

  if (!sameAddress(startup, terms.founderAddress)) throw mismatch("startup");
  if (goalAmount !== hskToWei(terms.goalAmount)) throw mismatch("goalAmount");
  if (tokenSymbol !== terms.tokenSymbol) throw mismatch("tokenSymbol");

  const blockNumber = receipt.blockNumber;
  const [bps, fundingDeadline, percentages, block] = await Promise.all([
    client.readContract({
      address: escrow,
      abi: equityEscrowAbi,
      functionName: "equityOfferedBps",
      blockNumber,
    }),
    client.readContract({
      address: escrow,
      abi: equityEscrowAbi,
      functionName: "fundingDeadline",
      blockNumber,
    }),
    readMilestonePercentages(client, escrow, blockNumber),
    client.getBlock({ blockNumber }),
  ]);

  if (bps !== equityToBps(terms.equityOffered)) throw mismatch("equity");
  if (percentages.join(",") !== terms.milestonePercentages.join(",")) {
    throw mismatch("hitos");
  }
  if (
    fundingDeadline - block.timestamp !==
    BigInt(terms.fundingDurationSeconds)
  ) {
    throw mismatch("duración de la ronda");
  }

  return {
    escrowAddress: escrow.toLowerCase(),
    tokenAddress: equityToken.toLowerCase(),
    fundingDeadline: new Date(Number(fundingDeadline) * 1000),
  };
}

/**
 * Proves that `txHash` called `invest()` on `escrowAddress` from
 * `investorAddress`, and returns the wei actually escrowed.
 */
export async function verifyInvestmentTx(
  txHash: Hash,
  {
    escrowAddress,
    investorAddress,
  }: { escrowAddress: string; investorAddress: string },
  client: PublicClient = getPublicClient(),
): Promise<{ amountWei: bigint }> {
  const receipt = await getSuccessfulReceipt(client, txHash);

  if (!sameAddress(receipt.to, escrowAddress)) {
    throw new EscrowVerificationError(
      "La transacción no fue enviada al escrow de esta campaña.",
      422,
    );
  }

  const invested = parseEventLogs({
    abi: equityEscrowAbi,
    eventName: "Invested",
    logs: receipt.logs,
  }).filter(
    (log) =>
      sameAddress(log.address, escrowAddress) &&
      sameAddress(log.args.investor, investorAddress),
  );

  if (invested.length === 0) {
    throw new EscrowVerificationError(
      "La transacción no contiene una inversión de esta wallet.",
      422,
    );
  }

  return {
    amountWei: invested.reduce((sum, log) => sum + log.args.amount, BigInt(0)),
  };
}

export interface EscrowState {
  status: number;
  totalRaised: bigint;
  escrowBalance: bigint;
  currentMilestoneIndex: number;
  /** EquityEscrow.investments(investor), keyed by lowercased address. */
  contributions: Map<string, bigint>;
}

/** Snapshot of an escrow, every value read at the same block. */
export async function readEscrowState(
  escrowAddress: string,
  investors: string[],
  client: PublicClient = getPublicClient(),
): Promise<EscrowState> {
  const address = escrowAddress as Address;
  // cacheTime 0: viem otherwise reuses the block number for ~4s, so a sync
  // right after a tx would read (and persist) the pre-tx state.
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const read = <
    T extends
      "status" | "totalRaised" | "escrowBalance" | "currentMilestoneIndex",
  >(
    functionName: T,
  ) =>
    client.readContract({
      address,
      abi: equityEscrowAbi,
      functionName,
      blockNumber,
    });

  const [status, totalRaised, escrowBalance, currentMilestoneIndex, amounts] =
    await Promise.all([
      read("status"),
      read("totalRaised"),
      read("escrowBalance"),
      read("currentMilestoneIndex"),
      Promise.all(
        investors.map((investor) =>
          client.readContract({
            address,
            abi: equityEscrowAbi,
            functionName: "investments",
            args: [investor as Address],
            blockNumber,
          }),
        ),
      ),
    ]);

  return {
    status: Number(status),
    totalRaised: BigInt(totalRaised),
    escrowBalance: BigInt(escrowBalance),
    currentMilestoneIndex: Number(currentMilestoneIndex),
    contributions: new Map(
      investors.map((investor, index) => [
        investor.toLowerCase(),
        amounts[index],
      ]),
    ),
  };
}
