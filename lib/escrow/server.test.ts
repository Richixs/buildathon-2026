/** @jest-environment node */

import {
  encodeAbiParameters,
  encodeEventTopics,
  parseEther,
  TransactionReceiptNotFoundError,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { equityEscrowAbi, equityEscrowFactoryAbi } from "@/lib/abi";
import {
  EscrowVerificationError,
  getPublicClient,
  readEscrowState,
  verifyCampaignDeployment,
  verifyInvestmentTx,
  type CampaignTerms,
} from "@/lib/escrow/server";

const FACTORY = "0x00000000000000000000000000000000000000fa" as Address;
const FOUNDER = "0x000000000000000000000000000000000000000b" as Address;
const INVESTOR = "0x000000000000000000000000000000000000000c" as Address;
const OTHER = "0x000000000000000000000000000000000000000d" as Address;
const ESCROW = "0x00000000000000000000000000000000000000e5" as Address;
const TOKEN = "0x00000000000000000000000000000000000000e7" as Address;
const TX = `0x${"ab".repeat(32)}` as Hex;
const BLOCK_TS = 1_800_000_000;

const ORIGINAL_ENV = { ...process.env };

const terms: CampaignTerms = {
  founderAddress: FOUNDER,
  goalAmount: "100",
  equityOffered: 12.5,
  tokenSymbol: "NXUS",
  fundingDurationSeconds: 3600,
  milestonePercentages: [60, 40],
};

function log(address: Address, topics: unknown[], data: Hex) {
  return {
    address,
    topics: topics as [Hex, ...Hex[]],
    data,
    blockNumber: BigInt(10),
    blockHash: `0x${"00".repeat(32)}`,
    transactionHash: TX,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}

function campaignCreatedLog({
  address = FACTORY,
  startup = FOUNDER,
  goal = parseEther("100"),
  symbol = "NXUS",
}: {
  address?: Address;
  startup?: Address;
  goal?: bigint;
  symbol?: string;
} = {}) {
  return log(
    address,
    encodeEventTopics({
      abi: equityEscrowFactoryAbi,
      eventName: "CampaignCreated",
      args: { startup, escrow: ESCROW },
    }),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "string" }],
      [TOKEN, goal, symbol],
    ),
  );
}

function investedLog(investor: Address, amount: bigint, address = ESCROW) {
  return log(
    address,
    encodeEventTopics({
      abi: equityEscrowAbi,
      eventName: "Invested",
      args: { investor },
    }),
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [amount, amount],
    ),
  );
}

type ReadValues = Record<string, unknown | ((args: unknown[]) => unknown)>;

const DEPLOYED_READS: ReadValues = {
  equityOfferedBps: 1250,
  fundingDeadline: BigInt(BLOCK_TS + 3600),
  milestoneCount: BigInt(2),
  milestonePercentages: (args: unknown[]) => [60, 40][Number(args[0])],
};

function fakeClient({
  receipt,
  reads = DEPLOYED_READS,
}: {
  receipt?: unknown;
  reads?: ReadValues;
}) {
  return {
    getTransactionReceipt: jest.fn().mockResolvedValue(receipt),
    getBlock: jest.fn().mockResolvedValue({ timestamp: BigInt(BLOCK_TS) }),
    getBlockNumber: jest.fn().mockResolvedValue(BigInt(11)),
    readContract: jest.fn(
      async ({
        functionName,
        args,
      }: {
        functionName: string;
        args?: unknown[];
      }) => {
        const value = reads[functionName];
        return typeof value === "function" ? value(args ?? []) : value;
      },
    ),
  } as unknown as PublicClient;
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    status: "success",
    to: FACTORY,
    blockNumber: BigInt(10),
    transactionHash: TX,
    logs: [campaignCreatedLog()],
    ...overrides,
  };
}

async function expectVerificationError(
  promise: Promise<unknown>,
  status: number,
  message: RegExp,
) {
  const error = (await promise.catch(
    (e: unknown) => e,
  )) as EscrowVerificationError;
  expect(error).toBeInstanceOf(EscrowVerificationError);
  expect(error.status).toBe(status);
  expect(error.message).toMatch(message);
}

describe("verifyCampaignDeployment", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS = FACTORY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns the escrow, token and deadline when everything matches", async () => {
    const client = fakeClient({ receipt: receipt() });

    const result = await verifyCampaignDeployment(TX, terms, client);

    expect(result).toEqual({
      escrowAddress: ESCROW,
      tokenAddress: TOKEN,
      fundingDeadline: new Date((BLOCK_TS + 3600) * 1000),
    });
    // Reads are pinned to the deploy block.
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: BigInt(10) }),
    );
  });

  it("returns 503 when the factory isn't configured", async () => {
    delete process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS;

    await expectVerificationError(
      verifyCampaignDeployment(TX, terms, fakeClient({ receipt: receipt() })),
      503,
      /NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS/,
    );
  });

  it("returns 409 while the tx isn't mined yet", async () => {
    const client = fakeClient({});
    jest
      .mocked(client.getTransactionReceipt)
      .mockRejectedValue(new TransactionReceiptNotFoundError({ hash: TX }));

    await expectVerificationError(
      verifyCampaignDeployment(TX, terms, client),
      409,
      /aún no está confirmada/,
    );
  });

  it("rethrows other RPC errors", async () => {
    const client = fakeClient({});
    jest
      .mocked(client.getTransactionReceipt)
      .mockRejectedValue(new Error("socket hang up"));

    await expect(verifyCampaignDeployment(TX, terms, client)).rejects.toThrow(
      "socket hang up",
    );
  });

  it("returns 422 when the tx reverted", async () => {
    await expectVerificationError(
      verifyCampaignDeployment(
        TX,
        terms,
        fakeClient({ receipt: receipt({ status: "reverted" }) }),
      ),
      422,
      /revirtió/,
    );
  });

  it("returns 422 when CampaignCreated didn't come from the configured factory", async () => {
    const client = fakeClient({
      receipt: receipt({ logs: [campaignCreatedLog({ address: OTHER })] }),
    });

    await expectVerificationError(
      verifyCampaignDeployment(TX, terms, client),
      422,
      /factory configurada/,
    );
  });

  it.each([
    ["startup", { startup: OTHER }],
    ["goalAmount", { goal: parseEther("99") }],
    ["tokenSymbol", { symbol: "XXXX" }],
  ])("returns 422 on an event %s mismatch", async (field, event) => {
    const client = fakeClient({
      receipt: receipt({ logs: [campaignCreatedLog(event)] }),
    });

    await expectVerificationError(
      verifyCampaignDeployment(TX, terms, client),
      422,
      new RegExp(field),
    );
  });

  it.each([
    ["equity", { equityOfferedBps: 1000 }],
    ["hitos", { milestoneCount: BigInt(1), milestonePercentages: () => 100 }],
    ["duración", { fundingDeadline: BigInt(BLOCK_TS + 60) }],
  ])("returns 422 on an on-chain %s mismatch", async (field, reads) => {
    const client = fakeClient({
      receipt: receipt(),
      reads: { ...DEPLOYED_READS, ...reads },
    });

    await expectVerificationError(
      verifyCampaignDeployment(TX, terms, client),
      422,
      new RegExp(field),
    );
  });
});

describe("verifyInvestmentTx", () => {
  const target = { escrowAddress: ESCROW, investorAddress: INVESTOR };

  it("sums the Invested events of this investor on this escrow", async () => {
    const client = fakeClient({
      receipt: receipt({
        to: ESCROW,
        logs: [
          investedLog(INVESTOR, parseEther("2")),
          investedLog(OTHER, parseEther("9")),
          investedLog(INVESTOR, parseEther("7"), OTHER),
        ],
      }),
    });

    const { amountWei } = await verifyInvestmentTx(TX, target, client);

    expect(amountWei).toBe(parseEther("2"));
  });

  it("returns 422 when the tx wasn't sent to the escrow", async () => {
    const client = fakeClient({
      receipt: receipt({
        to: OTHER,
        logs: [investedLog(INVESTOR, parseEther("2"))],
      }),
    });

    await expectVerificationError(
      verifyInvestmentTx(TX, target, client),
      422,
      /no fue enviada al escrow/,
    );
  });

  it("returns 422 when there's no Invested event for this wallet", async () => {
    const client = fakeClient({
      receipt: receipt({
        to: ESCROW,
        logs: [investedLog(OTHER, parseEther("2"))],
      }),
    });

    await expectVerificationError(
      verifyInvestmentTx(TX, target, client),
      422,
      /no contiene una inversión/,
    );
  });
});

describe("readEscrowState", () => {
  it("reads every value at the same block and keys contributions by lowercase address", async () => {
    const mixedCase = "0x000000000000000000000000000000000000ABcD";
    const client = fakeClient({
      reads: {
        status: 1,
        totalRaised: parseEther("100"),
        escrowBalance: parseEther("40"),
        currentMilestoneIndex: BigInt(2),
        investments: (args: unknown[]) =>
          args[0] === mixedCase ? parseEther("100") : BigInt(0),
      },
    });

    const state = await readEscrowState(ESCROW, [mixedCase], client);

    expect(state).toEqual({
      status: 1,
      totalRaised: parseEther("100"),
      escrowBalance: parseEther("40"),
      currentMilestoneIndex: 2,
      contributions: new Map([[mixedCase.toLowerCase(), parseEther("100")]]),
    });
    // A cached block number would make a post-tx sync read stale state.
    expect(client.getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });
    for (const [call] of jest.mocked(client.readContract).mock.calls) {
      expect(call).toEqual(
        expect.objectContaining({ blockNumber: BigInt(11) }),
      );
    }
  });
});

describe("getPublicClient", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reuses the client until the RPC URL changes", () => {
    process.env.ESCROW_RPC_URL = "http://127.0.0.1:1";
    const first = getPublicClient();
    expect(getPublicClient()).toBe(first);

    process.env.ESCROW_RPC_URL = "http://127.0.0.1:2";
    expect(getPublicClient()).not.toBe(first);
  });
});
