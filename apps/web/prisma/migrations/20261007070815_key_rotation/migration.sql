-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "keyFingerprint" TEXT;

-- CreateTable
CREATE TABLE "KeyRotation" (
    "id" TEXT NOT NULL,
    "fromFingerprint" TEXT NOT NULL,
    "wrap" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,

    CONSTRAINT "KeyRotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeyRotation_workspaceId_clientId_idx" ON "KeyRotation"("workspaceId", "clientId");

-- AddForeignKey
ALTER TABLE "KeyRotation" ADD CONSTRAINT "KeyRotation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyRotation" ADD CONSTRAINT "KeyRotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
