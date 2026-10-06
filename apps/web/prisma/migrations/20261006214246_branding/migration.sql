-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "brandLogo" BYTEA,
ADD COLUMN     "brandLogoType" TEXT,
ADD COLUMN     "brandVersion" INTEGER NOT NULL DEFAULT 0;
