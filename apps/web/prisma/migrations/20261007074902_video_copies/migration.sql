-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "sourceId" TEXT;

-- CreateIndex
CREATE INDEX "Video_sourceId_idx" ON "Video"("sourceId");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
