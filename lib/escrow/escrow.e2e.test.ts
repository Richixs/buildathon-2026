/** @jest-environment node */

// Opt-in integration test: the real contracts on a real JSON-RPC node,
// verified through the same lib/escrow/server.ts the Route Handlers use.
// Skipped unless ESCROW_E2E_RPC_URL is set. Needs compiled artifacts and an
// unlocked dev node (4+ funded accounts via eth_accounts):
//
//   cd contracts && node ./node_modules/hardhat/internal/cli/cli.js compile
//   node ./node_modules/hardhat/internal/cli/cli.js node   # other terminal
//   ESCROW_E2E_RPC_URL=http://127.0.0.1:8545 pnpm test lib/escrow/escrow.e2e
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { hardhat } from "viem/chains";
import { equityEscrowAbi, equityEscrowFactoryAbi } from "@/lib/abi";
import {
  equityToBps,
  hskToWei,
  prismaStatusFromChain,
} from "@/lib/escrow/config";
import {
  EscrowVerificationError,
  readEscrowState,
  verifyCampaignDeployment,
  verifyInvestmentTx,
} from "@/lib/escrow/server";

const RPC_URL = process.env.ESCROW_E2E_RPC_URL;
const describeE2E = RPC_URL ? describe : describe.skip;

jest.setTimeout(60_000);

describeE2E("EquityEscrow ↔ lib/escrow on a live node", () => {
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(RPC_URL),
  });
  const walletOf = (account: Address) =>
    createWalletClient({ account, chain: hardhat, transport: http(RPC_URL) });

  const terms = {
    goalAmount: "10",
    equityOffered: 12.5,
    tokenSymbol: "ETOE",
    fundingDurationSeconds: 3600,
    milestonePercentages: [60, 40],
  };

  let admin: Address;
  let founder: Address;
  let investorA: Address;
  let investorB: Address;
  let deployHash: Hex;
  let escrow: Address;

  async function mined(hash: Hex) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    return receipt;
  }

  async function createCampaign(
    durationSeconds: number,
    percentages: number[],
  ) {
    const hash = await walletOf(founder).writeContract({
      address: process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS as Address,
      abi: equityEscrowFactoryAbi,
      functionName: "createCampaign",
      args: [
        hskToWei(terms.goalAmount),
        equityToBps(terms.equityOffered),
        BigInt(durationSeconds),
        "E2E Labs",
        terms.tokenSymbol,
        percentages,
      ],
    });
    await mined(hash);
    return hash;
  }

  const invest = async (from: Address, to: Address, hsk: string) =>
    mined(
      await walletOf(from).writeContract({
        address: to,
        abi: equityEscrowAbi,
        functionName: "invest",
        value: parseEther(hsk),
      }),
    );

  beforeAll(async () => {
    // jest.setup.ts mocks fetch; viem's http transport needs the real one.
    global.fetch = (globalThis as { realFetch?: typeof fetch }).realFetch!;
    process.env.ESCROW_RPC_URL = RPC_URL;
    [admin, founder, investorA, investorB] = (await publicClient.request({
      method: "eth_accounts",
    } as never)) as Address[];

    const artifact = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "contracts/artifacts/contracts/EquityEscrowFactory.sol/EquityEscrowFactory.json",
        ),
        "utf8",
      ),
    );
    const receipt = await mined(
      await walletOf(admin).deployContract({
        abi: equityEscrowFactoryAbi,
        bytecode: artifact.bytecode,
        args: [admin],
      }),
    );
    process.env.NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS = receipt.contractAddress!;
  });

  it("verifies a real factory deploy and rejects tampered terms", async () => {
    deployHash = await createCampaign(
      terms.fundingDurationSeconds,
      terms.milestonePercentages,
    );

    const deployment = await verifyCampaignDeployment(deployHash, {
      ...terms,
      founderAddress: founder,
    });
    escrow = deployment.escrowAddress as Address;

    expect(escrow).toMatch(/^0x[0-9a-f]{40}$/);
    expect(deployment.tokenAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(deployment.fundingDeadline.getTime()).toBeGreaterThan(Date.now());

    await expect(
      verifyCampaignDeployment(deployHash, {
        ...terms,
        founderAddress: investorA,
      }),
    ).rejects.toBeInstanceOf(EscrowVerificationError);
    await expect(
      verifyCampaignDeployment(deployHash, {
        ...terms,
        founderAddress: founder,
        milestonePercentages: [40, 60],
      }),
    ).rejects.toThrow(/hitos/);
    await expect(
      verifyCampaignDeployment(deployHash, {
        ...terms,
        founderAddress: founder,
        fundingDurationSeconds: 7200,
      }),
    ).rejects.toThrow(/duración/);
  });

  it("verifies invest() and rejects txs that aren't this wallet's investment", async () => {
    const receipt = await invest(investorA, escrow, "4");

    const { amountWei } = await verifyInvestmentTx(receipt.transactionHash, {
      escrowAddress: escrow,
      investorAddress: investorA,
    });
    expect(amountWei).toBe(parseEther("4"));

    await expect(
      verifyInvestmentTx(receipt.transactionHash, {
        escrowAddress: escrow,
        investorAddress: investorB,
      }),
    ).rejects.toThrow(/no contiene una inversión/);
    await expect(
      verifyInvestmentTx(deployHash, {
        escrowAddress: escrow,
        investorAddress: founder,
      }),
    ).rejects.toThrow(/no fue enviada al escrow/);
  });

  it("follows funding → milestone release → admin cancel → pro-rata refund", async () => {
    await invest(investorB, escrow, "6");

    let state = await readEscrowState(escrow, [investorA, investorB]);
    expect(prismaStatusFromChain(state.status)).toBe("FUNDED");
    expect(state.totalRaised).toBe(parseEther("10"));

    await mined(
      await walletOf(founder).writeContract({
        address: escrow,
        abi: equityEscrowAbi,
        functionName: "releaseNextMilestone",
      }),
    );
    state = await readEscrowState(escrow, [investorA, investorB]);
    expect(state.currentMilestoneIndex).toBe(1);
    expect(state.escrowBalance).toBe(parseEther("4"));

    await mined(
      await walletOf(admin).writeContract({
        address: escrow,
        abi: equityEscrowAbi,
        functionName: "cancelCampaign",
        args: ["e2e: founder went dark"],
      }),
    );
    await mined(
      await walletOf(investorA).writeContract({
        address: escrow,
        abi: equityEscrowAbi,
        functionName: "claimRefund",
      }),
    );

    state = await readEscrowState(escrow, [investorA, investorB]);
    expect(prismaStatusFromChain(state.status)).toBe("FAILED");
    expect(state.contributions.get(investorA.toLowerCase())).toBe(BigInt(0));
    expect(state.contributions.get(investorB.toLowerCase())).toBe(
      parseEther("6"),
    );
    // A refunded 4 * (10 - 6 released) / 10 = 1.6 of the 4 left.
    expect(state.escrowBalance).toBe(parseEther("2.4"));
  });

  it("lets anyone fail an expired, underfunded round", async () => {
    const hash = await createCampaign(60, [100]);
    const { escrowAddress } = await verifyCampaignDeployment(hash, {
      ...terms,
      fundingDurationSeconds: 60,
      milestonePercentages: [100],
      founderAddress: founder,
    });
    await invest(investorA, escrowAddress as Address, "1");

    await publicClient.request({
      method: "evm_increaseTime",
      params: [120],
    } as never);
    await publicClient.request({ method: "evm_mine" } as never);

    await mined(
      await walletOf(investorB).writeContract({
        address: escrowAddress as Address,
        abi: equityEscrowAbi,
        functionName: "markFailedIfExpired",
      }),
    );

    const state = await readEscrowState(escrowAddress, [investorA]);
    expect(prismaStatusFromChain(state.status)).toBe("FAILED");
    expect(state.contributions.get(investorA.toLowerCase())).toBe(
      parseEther("1"),
    );
  });
});
