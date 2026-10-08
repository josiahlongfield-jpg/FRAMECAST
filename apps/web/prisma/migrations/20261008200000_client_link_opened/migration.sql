-- When a client first opened their personal link (so a business knows whether
-- the first video still needs that link sent), and a pending "email the client"
-- for a video sent while its upload was still finishing.
-- Additive: two new columns, plus filling in clients who have clearly opened
-- their link already (they watched a video or replied).
ALTER TABLE "Client" ADD COLUMN "linkOpenedAt" TIMESTAMP(3);
ALTER TABLE "Video" ADD COLUMN "emailClientWhenReady" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Client" c SET "linkOpenedAt" = c."createdAt"
WHERE EXISTS (SELECT 1 FROM "Video" v WHERE v."clientId" = c."id" AND v."viewCount" > 0)
   OR EXISTS (SELECT 1 FROM "Reply" r JOIN "Video" v ON v."id" = r."videoId" WHERE v."clientId" = c."id" AND r."authorUserId" IS NULL);
