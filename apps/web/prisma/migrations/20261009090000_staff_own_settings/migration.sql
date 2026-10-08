-- Staff members' own reminder settings for their clients. Additive: all
-- nullable, null meaning "use the business's setting".
ALTER TABLE "Membership" ADD COLUMN "myReminderDefaults" JSONB;
ALTER TABLE "Membership" ADD COLUMN "myRemindClientDefault" BOOLEAN;
ALTER TABLE "Membership" ADD COLUMN "myRemindTeamDefault" BOOLEAN;
ALTER TABLE "Membership" ADD COLUMN "myReminderMessage" TEXT;
ALTER TABLE "Membership" ADD COLUMN "myReminderReplyTo" TEXT;
