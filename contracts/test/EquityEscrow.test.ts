import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function deploy(
  fundingDurationSeconds = 3600,
  milestones: number[] = [30, 30, 40],
  goalAmountHsk = "100",
) {
  const [admin, startup, investorA, investorB] = await ethers.getSigners();
  const Escrow = await ethers.getContractFactory("EquityEscrow");
  const escrow = await Escrow.deploy(
    admin.address,
    startup.address,
    ethers.parseEther(goalAmountHsk),
    1000, // 10.00% equity
    fundingDurationSeconds,
    "NEXUS_LABS Equity Token",
    "NXUS",
    milestones,
  );
  await escrow.waitForDeployment();

  const tokenAddress = await escrow.equityToken();
  const token = await ethers.getContractAt("EquityToken", tokenAddress);

  return { escrow, token, admin, startup, investorA, investorB };
}

async function netReceived(
  signer: HardhatEthersSigner,
  action: () => Promise<{
    wait: () => Promise<{ gasUsed: bigint; gasPrice: bigint } | null>;
  }>,
) {
  const before = await ethers.provider.getBalance(signer.address);
  const tx = await action();
  const receipt = await tx.wait();
  const gasCost = receipt ? receipt.gasUsed * receipt.gasPrice : 0n;
  const after = await ethers.provider.getBalance(signer.address);
  return after - before + gasCost;
}

describe("EquityEscrow", function () {
  it("rejects a milestone schedule that doesn't sum to 100", async function () {
    const [admin, startup] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("EquityEscrow");

    await expect(
      Escrow.deploy(
        admin.address,
        startup.address,
        ethers.parseEther("100"),
        1000,
        3600,
        "Bad",
        "BAD",
        [30, 30, 30],
      ),
    ).to.be.revertedWithCustomError(Escrow, "InvalidMilestones");
  });

  it("mints equity tokens 1:1 on invest and flips to Active at goal", async function () {
    const { escrow, token, investorA, investorB } = await deploy();

    await escrow.connect(investorA).invest({ value: ethers.parseEther("60") });
    expect(await token.balanceOf(investorA.address)).to.equal(
      ethers.parseEther("60"),
    );
    expect(await escrow.status()).to.equal(0); // Funding

    await expect(
      escrow.connect(investorB).invest({ value: ethers.parseEther("50") }),
    ).to.be.revertedWithCustomError(escrow, "ExceedsGoal");

    await escrow.connect(investorB).invest({ value: ethers.parseEther("40") });
    expect(await token.balanceOf(investorB.address)).to.equal(
      ethers.parseEther("40"),
    );
    expect(await escrow.status()).to.equal(1); // Active
    expect(await escrow.totalRaised()).to.equal(ethers.parseEther("100"));
  });

  it("blocks investing once funding is closed", async function () {
    const { escrow, investorA } = await deploy();
    await escrow.connect(investorA).invest({ value: ethers.parseEther("100") });

    await expect(
      escrow.connect(investorA).invest({ value: ethers.parseEther("1") }),
    ).to.be.revertedWithCustomError(escrow, "FundingClosed");
  });

  it("releases milestones to the startup in order, sweeping dust on the last one", async function () {
    // 10 HSK split 33/33/34 — floor(10*33/100)=3.3 three times would drop a
    // fraction; this exercises that the last release sweeps the remainder.
    const { escrow, startup, investorA } = await deploy(
      3600,
      [33, 33, 34],
      "10",
    );
    await escrow.connect(investorA).invest({ value: ethers.parseEther("10") });
    expect(await escrow.status()).to.equal(1); // Active

    // The startup itself pays gas to call releaseNextMilestone, so we assert
    // the precise amounts via totalReleased/escrow balance instead of the
    // startup's raw wallet balance delta (which gas would muddy).
    await escrow.connect(startup).releaseNextMilestone();
    expect(await escrow.totalReleased()).to.equal(ethers.parseEther("3.3"));

    await escrow.connect(startup).releaseNextMilestone();
    expect(await escrow.totalReleased()).to.equal(ethers.parseEther("6.6"));

    await escrow.connect(startup).releaseNextMilestone();
    // Last release must sweep 100% of totalRaised, not just floor(10*34/100).
    expect(await escrow.totalReleased()).to.equal(ethers.parseEther("10"));
    expect(await escrow.status()).to.equal(2); // Completed
    expect(await ethers.provider.getBalance(escrow.target)).to.equal(0n);

    await expect(
      escrow.connect(startup).releaseNextMilestone(),
    ).to.be.revertedWithCustomError(escrow, "CampaignNotActive");
  });

  it("rejects releaseNextMilestone from a random address", async function () {
    const { escrow, investorA } = await deploy();
    await escrow.connect(investorA).invest({ value: ethers.parseEther("100") });

    await expect(
      escrow.connect(investorA).releaseNextMilestone(),
    ).to.be.revertedWithCustomError(escrow, "NotStartupOrAdmin");
  });

  it("lets the admin release milestones too (oracle role)", async function () {
    const { escrow, admin, investorA } = await deploy();
    await escrow.connect(investorA).invest({ value: ethers.parseEther("100") });

    await expect(escrow.connect(admin).releaseNextMilestone()).to.not.be
      .reverted;
  });

  it("refunds investors in full when funding fails before reaching the goal", async function () {
    const { escrow, token, investorA } = await deploy(10); // 10s deadline
    await escrow.connect(investorA).invest({ value: ethers.parseEther("40") });

    await time.increase(11);
    await escrow.markFailedIfExpired();
    expect(await escrow.status()).to.equal(3); // Failed

    const received = await netReceived(investorA, () =>
      escrow.connect(investorA).claimRefund(),
    );
    expect(received).to.equal(ethers.parseEther("40"));
    expect(await token.balanceOf(investorA.address)).to.equal(0);
    expect(await escrow.investments(investorA.address)).to.equal(0);

    // Double-claim must be a no-op revert, not a second payout.
    await expect(
      escrow.connect(investorA).claimRefund(),
    ).to.be.revertedWithCustomError(escrow, "NothingToRefund");
  });

  it("pro-rates refunds across investors after an admin cancels an Active campaign mid-milestones", async function () {
    const { escrow, admin, investorA, investorB } = await deploy(3600, [
      50, 50,
    ]);
    await escrow.connect(investorA).invest({ value: ethers.parseEther("60") }); // 60%
    await escrow.connect(investorB).invest({ value: ethers.parseEther("40") }); // 40%
    expect(await escrow.status()).to.equal(1); // Active

    await escrow.connect(admin).releaseNextMilestone(); // releases 50 HSK to startup
    expect(await escrow.totalReleased()).to.equal(ethers.parseEther("50"));

    await escrow.connect(admin).cancelCampaign("founder went dark");
    expect(await escrow.status()).to.equal(3); // Failed

    // Remaining pot = 100 - 50 = 50 HSK, split 60/40 -> 30 / 20.
    const receivedA = await netReceived(investorA, () =>
      escrow.connect(investorA).claimRefund(),
    );
    expect(receivedA).to.equal(ethers.parseEther("30"));

    const receivedB = await netReceived(investorB, () =>
      escrow.connect(investorB).claimRefund(),
    );
    expect(receivedB).to.equal(ethers.parseEther("20"));

    expect(await ethers.provider.getBalance(escrow.target)).to.equal(0n);
  });

  it("prevents the startup from cancelling its own campaign", async function () {
    const { escrow, startup, investorA } = await deploy();
    await escrow.connect(investorA).invest({ value: ethers.parseEther("100") });

    await expect(
      escrow.connect(startup).cancelCampaign("self-serve fraud attempt"),
    ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
  });

  it("rejects a bare HSK transfer that bypasses invest()", async function () {
    const { escrow, investorA } = await deploy();

    await expect(
      investorA.sendTransaction({
        to: escrow.target,
        value: ethers.parseEther("1"),
      }),
    ).to.be.reverted;
  });
});
