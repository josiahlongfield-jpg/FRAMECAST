-- CreateEnum
CREATE TYPE "ReplyKind" AS ENUM ('TEXT', 'VIDEO', 'AUDIO');

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_videoId_fkey";

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "uploadTokenHash" TEXT;

-- DropTable
DROP TABLE "Comment";

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "kind" "ReplyKind" NOT NULL,
    "body" TEXT,
    "timestampMs" INTEGER,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "videoId" TEXT NOT NULL,
    "mediaId" TEXT,
    "authorUserId" TEXT,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reply_mediaId_key" ON "Reply"("mediaId");

-- CreateIndex
CREATE INDEX "Reply_videoId_createdAt_idx" ON "Reply"("videoId", "createdAt");

-- CreateIndex
CREATE INDEX "Video_replyToId_idx" ON "Video"("replyToId");

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

