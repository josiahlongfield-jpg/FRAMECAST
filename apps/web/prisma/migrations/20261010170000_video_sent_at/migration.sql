-- When a video was sent to its client (a copy for another client is sent when it's made).
ALTER TABLE "Video" ADD COLUMN "sentAt" TIMESTAMP(3);
UPDATE "Video" SET "sentAt" = "createdAt" WHERE "clientId" IS NOT NULL;
