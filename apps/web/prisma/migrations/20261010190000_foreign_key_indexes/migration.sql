-- Indexes for lookups and cascades by these columns (additive only).
CREATE INDEX IF NOT EXISTS "Membership_workspaceId_idx" ON "Membership"("workspaceId");
CREATE INDEX IF NOT EXISTS "Video_clientId_idx" ON "Video"("clientId");
CREATE INDEX IF NOT EXISTS "Video_ownerId_idx" ON "Video"("ownerId");
CREATE INDEX IF NOT EXISTS "Reply_authorUserId_idx" ON "Reply"("authorUserId");
CREATE INDEX IF NOT EXISTS "Reaction_videoId_idx" ON "Reaction"("videoId");
CREATE INDEX IF NOT EXISTS "Client_assignedToId_idx" ON "Client"("assignedToId");
CREATE INDEX IF NOT EXISTS "Item_seriesId_idx" ON "Item"("seriesId");
CREATE INDEX IF NOT EXISTS "KeyRotation_clientId_idx" ON "KeyRotation"("clientId");
CREATE INDEX IF NOT EXISTS "TeamNotification_workspaceId_idx" ON "TeamNotification"("workspaceId");
