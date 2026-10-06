-- CreateEnum
CREATE TYPE "ReminderTo" AS ENUM ('CLIENT', 'TEAM');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "remindersOff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "remindClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remindTeam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminders" JSONB,
ADD COLUMN     "repeat" JSONB,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "spawnedNext" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "remindClientDefault" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "remindTeamDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderDefaults" JSONB,
ADD COLUMN     "reminderMessage" TEXT,
ADD COLUMN     "reminderReplyTo" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "to" "ReminderTo" NOT NULL,
    "error" TEXT,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_sentAt_sendAt_idx" ON "Reminder"("sentAt", "sendAt");

-- CreateIndex
CREATE INDEX "Reminder_itemId_idx" ON "Reminder"("itemId");

-- CreateIndex
CREATE INDEX "Item_spawnedNext_dueAt_idx" ON "Item"("spawnedNext", "dueAt");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

