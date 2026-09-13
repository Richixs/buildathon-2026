/** @jest-environment node */

import {
  equityToBps,
  explorerUrl,
  getEscrowChainId,
  getFactoryAddress,
  getRpcUrl,
  hskToWei,
  prismaStatusFromChain,
  readableTxError,
  weiToHsk,
} from "@/lib/escrow/config";

const ORIGINAL_ENV = { ...process.env };

// next/jest loads the developer's .env — start every test from a clean slate
// so a local ESCROW_RPC_URL or chain id can't leak into the assertions.
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ESCROW_CHAIN_ID;
  delete process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS;
  delete process.env.ESCROW_RPC_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("escrow env config", () => {
  it("defaults to HashKey testnet and its public RPC/explorer", () => {
    delete process.env.NEXT_PUBLIC_ESCROW_CHAIN_ID;
    delete process.env.ESCROW_RPC_URL;

    expect(getEscrowChainId()).toBe(133);
    expect(getRpcUrl()).toBe("https://testnet.hsk.xyz");
    expect(explorerUrl("tx", "0xabc")).toBe(
      "https://testnet-explorer.hskchain.net/tx/0xabc",
    );
  });

  it("switches to mainnet and honours an RPC override", () => {
    process.env.NEXT_PUBLIC_ESCROW_CHAIN_ID = "177";
    expect(getRpcUrl()).toBe("https://mainnet.hsk.xyz");
    expect(explorerUrl("address", "0xabc")).toBe(
      "https://explorer.hsk.xyz/address/0xabc",
    );

    process.env.ESCROW_RPC_URL = "http://127.0.0.1:8545";
    expect(getRpcUrl()).toBe("http://127.0.0.1:8545");
  });

  it("falls back to the testnet RPC and no explorer for unknown chains", () => {
    process.env.NEXT_PUBLIC_ESCROW_CHAIN_ID = "31337";
    delete process.env.ESCROW_RPC_URL;

    expect(getEscrowChainId()).toBe(31337);
    expect(getRpcUrl()).toBe("https://testnet.hsk.xyz");
    expect(explorerUrl("tx", "0xabc")).toBeNull();
  });

  it("ignores a garbage chain id", () => {
    process.env.NEXT_PUBLIC_ESCROW_CHAIN_ID = "hashkey";
    expect(getEscrowChainId()).toBe(133);
  });

  it("only returns a well-formed factory address", () => {
    delete process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS;
    expect(getFactoryAddress()).toBeNull();

    process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS = "0x123";
    expect(getFactoryAddress()).toBeNull();

    process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS =
      " 0x5FbDB2315678afecb367f032d93F642f64180aa3 ";
    expect(getFactoryAddress()).toBe(
      "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    );
  });
});

describe("prismaStatusFromChain", () => {
  it.each([
    [0, "ACTIVE"],
    [1, "FUNDED"],
    [2, "COMPLETED"],
    [3, "FAILED"],
  ])("maps EquityEscrow.Status %i to %s", (status, expected) => {
    expect(prismaStatusFromChain(status)).toBe(expected);
  });

  it("throws on an unknown status", () => {
    expect(() => prismaStatusFromChain(9)).toThrow(/desconocido/);
  });
});

describe("amount helpers", () => {
  it("converts equity % to bps", () => {
    expect(equityToBps(12.5)).toBe(1250);
    expect(equityToBps(0.1)).toBe(10);
    expect(equityToBps(33.33)).toBe(3333);
  });

  it("converts HSK numbers and strings to wei", () => {
    expect(hskToWei(0.1)).toBe(BigInt("100000000000000000"));
    expect(hskToWei("100000.5")).toBe(BigInt("100000500000000000000000"));
    // String(1e-7) is "1e-7", which parseEther can't read.
    expect(hskToWei(1e-7)).toBe(BigInt("100000000000"));
    expect(hskToWei(1e-19)).toBe(BigInt(0));
  });

  it("formats wei back to a decimal HSK string", () => {
    expect(weiToHsk(BigInt("2500000000000000000"))).toBe("2.5");
    expect(weiToHsk(BigInt(1))).toBe("0.000000000000000001");
  });
});

describe("readableTxError", () => {
  it("prefers viem's shortMessage, then message", () => {
    expect(
      readableTxError({ shortMessage: "User rejected.", message: "long" }),
    ).toBe("User rejected.");
    expect(readableTxError(new Error("boom"))).toBe("boom");
    expect(readableTxError("nope")).toBe("Error desconocido.");
    expect(readableTxError({})).toBe("Error desconocido.");
  });
});
