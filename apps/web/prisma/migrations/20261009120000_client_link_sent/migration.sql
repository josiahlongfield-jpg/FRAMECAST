-- When the business last copied the client's personal link to send it.
-- Additive and nullable. Clients who already opened their link need nothing.
ALTER TABLE "Client" ADD COLUMN "linkSentAt" TIMESTAMP(3);
