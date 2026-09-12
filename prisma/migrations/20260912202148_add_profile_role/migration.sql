-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'investor';
