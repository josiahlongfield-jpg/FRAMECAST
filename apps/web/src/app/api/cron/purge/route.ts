import { purgeExpired } from "@/lib/retention";
import { pruneRateLimits } from "@/lib/rateLimit";

/** Run daily (e.g. Vercel Cron) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const purged = await purgeExpired();
  await pruneRateLimits();
  return Response.json({ purged });
}
