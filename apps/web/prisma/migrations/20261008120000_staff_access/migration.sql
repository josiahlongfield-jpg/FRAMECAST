-- Staff access, team notifications and staff reminders.
-- Additive only: new enums, new tables, and new Membership columns with
-- defaults. No existing row is rewritten or removed. Owners and admins
-- ignore the member permission columns (full access, as before).

-- CreateEnum
CREATE TYPE "NotifyScope" AS ENUM ('ALL', 'SELECTED', 'MINE', 'OFF');

-- CreateEnum
CREATE TYPE "TeamNotificationKind" AS ENUM ('CLIENT_REPLY', 'VIDEO_SENT');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "addClients" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deleteAnyVideo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replyNotify" "NotifyScope" NOT NULL DEFAULT 'MINE',
ADD COLUMN     "replyNotifyStaff" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seeAllClients" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendToMany" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sentNotify" "NotifyScope" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "sentNotifyStaff" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Staff who joined before this change keep seeing every client, as they did
-- before, until an owner or admin turns "See all clients" off. New staff
-- start with it off.
UPDATE "Membership" SET "seeAllClients" = true WHERE "role" = 'MEMBER';

-- CreateTable
CREATE TABLE "TeamNotification" (
    "id" TEXT NOT NULL,
    "kind" "TeamNotificationKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "actorUserId" TEXT,
    "clientId" TEXT,
    "videoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "TeamNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotifyThrottle" (
    "key" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotifyThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "StaffNotice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "linkLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "StaffNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamNotification_sentAt_createdAt_idx" ON "TeamNotification"("sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "TeamNotification_userId_groupKey_idx" ON "TeamNotification"("userId", "groupKey");

-- CreateIndex
CREATE INDEX "StaffNotice_toUserId_workspaceId_dismissedAt_idx" ON "StaffNotice"("toUserId", "workspaceId", "dismissedAt");

-- CreateIndex
CREATE INDEX "StaffNotice_workspaceId_createdAt_idx" ON "StaffNotice"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamNotification" ADD CONSTRAINT "TeamNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNotification" ADD CONSTRAINT "TeamNotification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNotice" ADD CONSTRAINT "StaffNotice_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

