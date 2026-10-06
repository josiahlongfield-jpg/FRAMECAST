import { headers } from "next/headers";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";

/**
 * Count one hit against `key` in a fixed window and refuse once it passes
 * `limit`. Counters live in Postgres so every server instance shares them.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  if (process.env.RATE_LIMITS === "off") return;
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;
  if ((rows[0]?.count ?? 0) > limit) throw new HttpError(429, "Too many requests. Please wait a moment and try again.");
}

/** The caller's IP as seen by Vercel's edge (falls back to "local" in development). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Rate-limit by caller IP. */
export async function limitByIp(name: string, limit: number, windowSec: number) {
  await rateLimit(`${name}:ip:${await clientIp()}`, limit, windowSec);
}

/** Drop finished windows; called from the daily purge job. */
export async function pruneRateLimits(now = new Date()) {
  await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } });
}
