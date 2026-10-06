-- AlterEnum
ALTER TYPE "VideoStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "teamKeyWrap" TEXT;

-- AlterTable
ALTER TABLE "Reply" ADD COLUMN     "encrypted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "clientKeyWrap" TEXT,
ADD COLUMN     "encrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentKeyWrap" TEXT,
ADD COLUMN     "purgeAt" TIMESTAMP(3),
ADD COLUMN     "teamKeyWrap" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "cloudBackup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keyFingerprint" TEXT;

