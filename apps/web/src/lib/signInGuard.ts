import { mailbox } from "@/lib/emailAddress";
import { clientIp, isLimited, rateLimit } from "@/lib/rateLimit";

const HOUR = 3600;

async function limits(email: string): Promise<[string, number][]> {
  return [
    [`signin-email:ip:${await clientIp()}`, 10],
    [`signin-email:to:${email}`, 5],
    // Tagged and dotted versions of one inbox share an allowance.
    [`signin-email:box:${mailbox(email)}`, 8],
  ];
}

/** Counts one sign-in email; throws when this address, inbox or network has had too many this hour. */
export async function countSignInEmail(email: string) {
  for (const [key, limit] of await limits(email)) await rateLimit(key, limit, HOUR);
}

/** Whether sending one more sign-in email would be refused, without counting it. */
export async function signInEmailLimited(email: string) {
  for (const [key, limit] of await limits(email)) if (await isLimited(key, limit, HOUR)) return true;
  return false;
}
