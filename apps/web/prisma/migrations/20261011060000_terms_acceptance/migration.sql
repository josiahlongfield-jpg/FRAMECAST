-- A record of each time someone agreed to the Terms of Service and Privacy Policy (lib/terms.ts), kept as
-- evidence of the agreement. Append-only: the app only ever inserts rows, and the daily job deletes rows
-- older than 7 years. No foreign keys, so the record outlives the account it's about.
CREATE TABLE IF NOT EXISTS "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "appVersion" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "method" TEXT NOT NULL,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TermsAcceptance_userId_acceptedAt_idx" ON "TermsAcceptance"("userId", "acceptedAt");
CREATE INDEX IF NOT EXISTS "TermsAcceptance_acceptedAt_idx" ON "TermsAcceptance"("acceptedAt");
