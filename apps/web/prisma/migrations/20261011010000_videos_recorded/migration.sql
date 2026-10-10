-- Free plan: 25 videos in total for the life of the workspace (additive only).
-- A place is used when an original recording finishes uploading, on any plan, and is never given back.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "videosRecorded" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the originals that finished uploading (copies and replies don't count; uploads refused at
-- completion never got a duration, so they don't either). GREATEST only ever raises the count, so this can be
-- run again safely, e.g. once after the deploy goes live to catch videos the old code finished meanwhile.
UPDATE "Workspace" w SET "videosRecorded" = GREATEST(w."videosRecorded", c.n)
FROM (
  SELECT "workspaceId", count(*)::int AS n FROM "Video"
  WHERE "replyToId" IS NULL AND "sourceId" IS NULL AND status <> 'RECORDING' AND "durationMs" IS NOT NULL
  GROUP BY "workspaceId"
) c
WHERE c."workspaceId" = w.id;
