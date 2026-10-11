-- The email telling an existing account holder about new versions of the Terms of Service and Privacy Policy
-- (lib/terms.ts). The new versions take effect for them 30 days after it was sent; until then they carry on
-- without agreeing. Kept as evidence of the notice: no foreign keys, deleted by the daily job after 7 years.
CREATE TABLE IF NOT EXISTS "TermsNotice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TermsNotice_userId_termsVersion_privacyVersion_key" ON "TermsNotice"("userId", "termsVersion", "privacyVersion");
CREATE INDEX IF NOT EXISTS "TermsNotice_sentAt_idx" ON "TermsNotice"("sentAt");
