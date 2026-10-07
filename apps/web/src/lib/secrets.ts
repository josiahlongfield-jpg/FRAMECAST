import crypto from "node:crypto";

/** Constant-time string comparison (hashing first so lengths don't leak). */
export function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** The app's signing secret: the same one Auth.js uses. */
export function appSecret() {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
    return "dev";
  }
  return s;
}

/** Bearer-token check for cron routes. */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

/**
 * A redirect target from a query string, kept on this site. Rejects
 * protocol-relative and backslash tricks like "//evil.com" and "/\evil.com".
 */
export function safeNext(next: string | undefined | null, fallback = "/library") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\x00-\x1f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://x");
    return u.host === "x" ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
