-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'NEEDS_HUMAN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportAuthor" AS ENUM ('CUSTOMER', 'ASSISTANT', 'STAFF');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "email" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "author" "SupportAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_accessToken_key" ON "SupportTicket"("accessToken");

-- CreateIndex
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
