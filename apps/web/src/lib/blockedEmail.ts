import crypto from "node:crypto";
import { db } from "@/lib/db";
import { mailbox } from "@/lib/emailAddress";

/** Shown when a blocked address tries to sign in or sign up (lib/support/admin.ts blockEmail). */
export const EMAIL_BLOCKED = "This email address can't be used with SureFrame. Contact support@sureframe.app.";

/**
 * What a block is stored as: a SHA-256 hash of the inbox (lower-cased, without
 * a +tag, and without dots for Gmail), so tagged or dotted versions of a
 * blocked address are blocked too, and the address itself isn't kept.
 */
export const blockedEmailHash = (email: string) => crypto.createHash("sha256").update(mailbox(email.trim().toLowerCase())).digest("hex");

/** Whether any of these addresses has been blocked from signing in. */
export async function isEmailBlocked(...emails: (string | null | undefined)[]) {
  const hashes = [...new Set(emails.filter((e): e is string => !!e && e.includes("@")).map(blockedEmailHash))];
  if (!hashes.length) return false;
  return (await db.blockedEmail.count({ where: { emailHash: { in: hashes } } })) > 0;
}
