-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "deployTxHash" TEXT,
ADD COLUMN     "escrowBalance" DECIMAL(36,18) NOT NULL DEFAULT 0,
ADD COLUMN     "fundingDeadline" TIMESTAMP(3),
ADD COLUMN     "fundingDurationSeconds" INTEGER NOT NULL DEFAULT 2592000,
ADD COLUMN     "tokenAddress" TEXT,
ALTER COLUMN "goalAmount" SET DATA TYPE DECIMAL(36,18),
ALTER COLUMN "raisedAmount" SET DATA TYPE DECIMAL(36,18);

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing milestones get their release order from targetDate
-- (the order the UI already displayed them in) before the unique index.
UPDATE "milestones" AS m
SET "position" = ranked.rn - 1
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "campaignId"
           ORDER BY "targetDate", "createdAt", "id"
         ) AS rn
  FROM "milestones"
) AS ranked
WHERE m."id" = ranked."id";

-- AlterTable
ALTER TABLE "investments" ADD COLUMN     "refundedAt" TIMESTAMP(3),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(36,18);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_contractAddress_key" ON "campaigns"("contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_deployTxHash_key" ON "campaigns"("deployTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_campaignId_position_key" ON "milestones"("campaignId", "position");
