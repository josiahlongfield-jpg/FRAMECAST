-- Clients and staff over a plan's limits after a subscription ends or lapses.
-- Additive and nullable: nobody is paused until a plan drops below its usage.
ALTER TABLE "Client" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "Membership" ADD COLUMN "pausedAt" TIMESTAMP(3);
