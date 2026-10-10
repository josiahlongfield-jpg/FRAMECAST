-- Founder support powers (lib/support/admin.ts): suspending a workspace or a login, closing an account,
-- legal hold, turning a client's link off, signing out everywhere, blocking an email from signing up again,
-- and a log of every support action. Additive only: new nullable columns and new tables, so every existing
-- workspace, login and client reads as active, not held and not blocked.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT,
ADD COLUMN IF NOT EXISTS "suspendedNote" TEXT,
ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "legalHoldAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "legalHoldReason" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT,
ADD COLUMN IF NOT EXISTS "sessionsValidAfter" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "linkDisabledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "linkDisabledReason" TEXT;

-- No foreign keys: the record of what support did outlives the account it's about.
CREATE TABLE IF NOT EXISTS "AdminAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "clientId" TEXT,
    "target" TEXT,
    "reason" TEXT,
    "details" JSONB,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- Only a SHA-256 hash of the address is kept.
CREATE TABLE IF NOT EXISTS "BlockedEmail" (
    "emailHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "BlockedEmail_pkey" PRIMARY KEY ("emailHash")
);

CREATE INDEX IF NOT EXISTS "AdminAction_workspaceId_createdAt_idx" ON "AdminAction"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAction_userId_createdAt_idx" ON "AdminAction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAction_createdAt_idx" ON "AdminAction"("createdAt");
