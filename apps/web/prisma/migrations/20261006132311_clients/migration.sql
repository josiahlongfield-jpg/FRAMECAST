-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "extraClientSeats" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_token_key" ON "Client"("token");

-- CreateIndex
CREATE INDEX "Client_workspaceId_removedAt_idx" ON "Client"("workspaceId", "removedAt");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

