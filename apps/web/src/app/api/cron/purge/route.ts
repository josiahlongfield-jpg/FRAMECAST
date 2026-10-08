import { abortStaleUploads, purgeExpired } from "@/lib/retention";
import { pruneRateLimits } from "@/lib/rateLimit";
import { cronAuthorized } from "@/lib/secrets";
import { pruneTeamNotifications } from "@/lib/teamNotify";
import { warnExpiring } from "@/lib/expiryWarning";

/** Run daily (e.g. Vercel Cron) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const purged = await purgeExpired();
  await pruneRateLimits();
  await abortStaleUploads();
  await pruneTeamNotifications();
  // Normally sent by the 5-minute reminders job; this catches anything it missed.
  const expiryWarnings = await warnExpiring();
  return Response.json({ purged, expiryWarnings });
}
