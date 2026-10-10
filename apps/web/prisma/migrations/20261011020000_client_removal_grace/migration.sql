-- Removed clients are kept 30 days so the business can restore them, then deleted for good (lib/clientRemoval.ts).
-- Additive only. Clients removed before this change get their deletion date from the app, which also emails the
-- owner about it; nothing is dated or deleted here, and a removed client without a date is never deleted.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "purgeAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "purgeWarnedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "removedById" TEXT;

CREATE INDEX IF NOT EXISTS "Client_purgeAt_idx" ON "Client"("purgeAt");
