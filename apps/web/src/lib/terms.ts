import { headers } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { LEGAL } from "@/lib/legal";
import { TERMS_RECORD_KEEP_YEARS } from "@/lib/periods";

/**
 * Everyone with an account agrees to the current Terms of Service and Privacy
 * Policy (LEGAL.termsVersion / privacyVersion) by ticking a box on /agree
 * before using SureFrame, and again whenever either version changes. Each
 * agreement is a TermsAcceptance row: evidence of who agreed to which
 * versions, when and from where, if there's ever a dispute. The app only
 * ever adds rows; the daily job deletes those older than
 * TERMS_RECORD_KEEP_YEARS, and deleting an account leaves them.
 *
 * Until then pages send them to /agree (requirePageUser) and the API answers
 * 403 TERMS_REQUIRED (requireUser), except what they need to leave or keep
 * what they have: signing out, the data download, deleting the account, and
 * finishing an upload that had already started.
 */
export const TERMS_REQUIRED = `Please agree to the ${LEGAL.product} Terms of Service and Privacy Policy to keep using ${LEGAL.product}. Reload the page to see them.`;

/** Whether this login's latest agreement is to the current versions of both documents. */
export async function hasAgreed(userId: string) {
  const latest = await db.termsAcceptance.findFirst({
    where: { userId },
    orderBy: { acceptedAt: "desc" },
    select: { termsVersion: true, privacyVersion: true },
  });
  return latest?.termsVersion === LEGAL.termsVersion && latest.privacyVersion === LEGAL.privacyVersion;
}

/**
 * When agreements started being recorded: the migration that added the table
 * ran just before that release went live. Accounts made earlier agreed under
 * the sign-in page's old "By continuing you agree" wording, so their first
 * agreement here is to updated terms.
 */
const RECORDS_FALLBACK = new Date("2026-10-11T00:00:00Z");
let recordsStarted: Promise<Date> | undefined;
function recordsStartedAt() {
  recordsStarted ??= db.$queryRaw<{ finished_at: Date | null }[]>`
    SELECT finished_at FROM _prisma_migrations WHERE migration_name = '20261011060000_terms_acceptance' AND finished_at IS NOT NULL LIMIT 1`
    .then((rows) => rows[0]?.finished_at ?? RECORDS_FALLBACK)
    .catch(() => RECORDS_FALLBACK);
  return recordsStarted;
}

/**
 * "signup" when a new account agrees for the first time; "update" when an
 * account agreed to an older version, or existed before agreements were recorded.
 */
export async function agreementKind(user: Pick<User, "id" | "createdAt">): Promise<"signup" | "update"> {
  if (await db.termsAcceptance.count({ where: { userId: user.id } })) return "update";
  return user.createdAt < (await recordsStartedAt()) ? "update" : "signup";
}

/** The caller's IP address (the first one Vercel's edge saw) and browser, for the record. */
async function requestFacts() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
  return { ip: ip?.slice(0, 100) ?? null, userAgent: h.get("user-agent")?.slice(0, 500) || null };
}

/** Records that this login agreed to the current versions, now. Does nothing if its latest agreement already is to them. */
export async function recordAgreement(user: Pick<User, "id" | "email" | "createdAt">) {
  if (await hasAgreed(user.id)) return null;
  const method = await agreementKind(user);
  return db.termsAcceptance.create({
    data: {
      userId: user.id,
      email: user.email,
      termsVersion: LEGAL.termsVersion,
      privacyVersion: LEGAL.privacyVersion,
      // The deployed commit, so the exact wording shown can be found in the code history.
      appVersion: process.env.VERCEL_GIT_COMMIT_SHA || null,
      method,
      ...(await requestFacts()),
    },
  });
}

/** Deletes agreement records older than TERMS_RECORD_KEEP_YEARS; called from the daily purge job. */
export async function pruneTermsAcceptances(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - TERMS_RECORD_KEEP_YEARS);
  return (await db.termsAcceptance.deleteMany({ where: { acceptedAt: { lt: cutoff } } })).count;
}

/** This login's agreement records, for the data download. */
export function agreementsOf(userId: string) {
  return db.termsAcceptance.findMany({
    where: { userId },
    orderBy: { acceptedAt: "asc" },
    select: { acceptedAt: true, termsVersion: true, privacyVersion: true, method: true, email: true, ip: true, userAgent: true },
  });
}
