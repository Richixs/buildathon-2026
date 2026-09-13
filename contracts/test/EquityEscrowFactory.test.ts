import { expect } from "chai";
import { ethers } from "hardhat";

describe("EquityEscrowFactory", function () {
  async function deployFactory() {
    const [admin, startupA, startupB, investor] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EquityEscrowFactory");
    const factory = await Factory.deploy(admin.address);
    await factory.waitForDeployment();
    return { factory, admin, startupA, startupB, investor };
  }

  it("deploys a working EquityEscrow owned by the caller as startup", async function () {
    const { factory, admin, startupA, investor } = await deployFactory();

    const tx = await factory
      .connect(startupA)
      .createCampaign(
        ethers.parseEther("100"),
        1000,
        3600,
        "NEXUS_LABS Equity Token",
        "NXUS",
        [50, 50],
      );
    const receipt = await tx.wait();

    const event = receipt!.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "CampaignCreated");

    expect(event).to.not.be.undefined;
    const escrowAddress = event!.args.escrow as string;

    expect(await factory.totalCampaigns()).to.equal(1);
    expect(await factory.campaignCountFor(startupA.address)).to.equal(1);
    expect(await factory.allEscrows(0)).to.equal(escrowAddress);

    const escrow = await ethers.getContractAt("EquityEscrow", escrowAddress);
    expect(await escrow.startup()).to.equal(startupA.address);
    expect(await escrow.owner()).to.equal(admin.address);

    await escrow.connect(investor).invest({ value: ethers.parseEther("100") });
    expect(await escrow.status()).to.equal(1); // Active
  });

  it("tracks multiple campaigns per startup and across startups independently", async function () {
    const { factory, startupA, startupB } = await deployFactory();

    await factory
      .connect(startupA)
      .createCampaign(ethers.parseEther("10"), 500, 3600, "A1", "A1", [100]);
    await factory
      .connect(startupA)
      .createCampaign(ethers.parseEther("20"), 500, 3600, "A2", "A2", [100]);
    await factory
      .connect(startupB)
      .createCampaign(ethers.parseEther("30"), 500, 3600, "B1", "B1", [100]);

    expect(await factory.totalCampaigns()).to.equal(3);
    expect(await factory.campaignCountFor(startupA.address)).to.equal(2);
    expect(await factory.campaignCountFor(startupB.address)).to.equal(1);
  });
});
