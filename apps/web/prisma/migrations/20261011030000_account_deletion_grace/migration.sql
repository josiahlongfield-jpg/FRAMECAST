-- Deleting your own account closes it at once and deletes it 30 days later, unless you sign in and keep it
-- (lib/accountDeletion.ts). Additive only: every column is nullable, so existing accounts read as active.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deleteAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deletionWarnedAt" TIMESTAMP(3);

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "deleteAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "renewalStoppedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_deleteAt_idx" ON "User"("deleteAt");
