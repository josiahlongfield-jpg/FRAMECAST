import { abortStaleUploads, pruneLeftovers, purgeExpired } from "@/lib/retention";
import { pruneRateLimits } from "@/lib/rateLimit";
import { cronAuthorized } from "@/lib/secrets";
import { pruneTeamNotifications } from "@/lib/teamNotify";
import { warnExpiring } from "@/lib/expiryWarning";

export const maxDuration = 300;

/** Run daily (e.g. Vercel Cron) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  // Each job runs even if another fails, so one storage hiccup doesn't skip the rest.
  const [purged, , , , , expiryWarnings] = await Promise.allSettled([
    // Mostly done by the 5-minute job by now; this works through any backlog.
    purgeExpired(new Date(), 120_000),
    pruneRateLimits(),
    abortStaleUploads(),
    pruneTeamNotifications(),
    pruneLeftovers(),
    // Normally sent by the 5-minute reminders job; this catches anything it missed.
    warnExpiring(),
  ]).then((results) =>
    results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.error(JSON.stringify({ level: "error", message: `[cron/purge] job ${i} failed`, error: String(r.reason) }));
      return "failed";
    }),
  );
  return Response.json({ purged, expiryWarnings });
}
