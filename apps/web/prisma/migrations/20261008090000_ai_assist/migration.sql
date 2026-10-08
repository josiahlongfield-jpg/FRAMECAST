-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "aiAssist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiAssistComplimentary" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VideoInsight" (
    "videoId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoInsight_pkey" PRIMARY KEY ("videoId")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "workspaceId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "summaries" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("workspaceId","month")
);

-- AddForeignKey
ALTER TABLE "VideoInsight" ADD CONSTRAINT "VideoInsight_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

