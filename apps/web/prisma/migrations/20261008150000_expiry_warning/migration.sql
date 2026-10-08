-- 24-hour warning before a relay copy is deleted.
-- Additive only: one nullable column and an index. No existing row changes.
ALTER TABLE "Video" ADD COLUMN "expiryWarnedAt" TIMESTAMP(3);

CREATE INDEX "Video_purgeAt_idx" ON "Video"("purgeAt");
