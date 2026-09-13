import { ethers } from "hardhat";

/**
 * Deploys a single EquityEscrowFactory. Run once per network — every
 * campaign afterwards calls `factory.createCampaign(...)` itself (e.g. from
 * the founder's wallet via wagmi) instead of this repo deploying a fresh
 * EquityEscrow per campaign.
 *
 * Usage:
 *   cp .env.example .env   # fill in PRIVATE_KEY (funded with testnet HSK)
 *   pnpm deploy:testnet
 *
 * After it runs, put the printed factory address into the frontend's
 * NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS env var.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address;

  console.log("Deploying EquityEscrowFactory...");
  console.log("  deployer:", deployer.address);
  console.log("  admin/oracle (owner):", adminAddress);

  const Factory = await ethers.getContractFactory("EquityEscrowFactory");
  const factory = await Factory.deploy(adminAddress);
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log("\nEquityEscrowFactory deployed to:", address);
  console.log(
    "Set NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS to this address in the Next.js app's .env",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
