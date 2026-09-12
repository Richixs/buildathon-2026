/*
  Warnings:

  - Added the required column `equityOffered` to the `campaigns` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenSymbol` to the `campaigns` table without a default value. This is not possible if the table is not empty.
  - Added the required column `releasePercentage` to the `milestones` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "equityOffered" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "tokenSymbol" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "releasePercentage" INTEGER NOT NULL;
