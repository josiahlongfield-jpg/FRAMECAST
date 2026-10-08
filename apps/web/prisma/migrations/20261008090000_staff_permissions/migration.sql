-- Per-staff permissions for members. Additive only: new columns with
-- defaults, no rows rewritten or removed. Owners and admins ignore them.
ALTER TABLE "Membership" ADD COLUMN "seeAllClients" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Membership" ADD COLUMN "addClients" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Membership" ADD COLUMN "deleteAnyVideo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Membership" ADD COLUMN "sendToMany" BOOLEAN NOT NULL DEFAULT true;

-- Throttle for "your client replied" emails (one per conversation per 15 minutes).
ALTER TABLE "Video" ADD COLUMN "replyNotifiedAt" TIMESTAMP(3);
