import { runReminders } from "@/lib/reminders";
import { purgeExpired } from "@/lib/retention";
import { flushTeamNotifications } from "@/lib/teamNotify";
import { cronAuthorized } from "@/lib/secrets";
import { warnExpiring } from "@/lib/expiryWarning";

export const maxDuration = 300;

const JOBS = ["reminders", "digests", "expiryWarnings", "purged"] as const;

/** Run every few minutes (e.g. Vercel Cron) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  // Each job runs even if another fails, so one bad row can't hold up the rest.
  const results = await Promise.allSettled([
    runReminders(),
    // Team emails held back by the 15-minute limit go out as a digest.
    flushTeamNotifications(),
    // Recorders hear ~24 hours before a relay copy is deleted (lib/expiryWarning.ts).
    warnExpiring(),
    // Copies are deleted close to the time shown, not just once a day.
    purgeExpired(new Date(), 20_000),
  ]);
  const out: Record<string, unknown> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") out[JOBS[i]] = r.value;
    else {
      out[JOBS[i]] = "failed";
      console.error(JSON.stringify({ level: "error", message: `[cron/reminders] ${JOBS[i]} failed`, error: String(r.reason) }));
    }
  });
  const reminders = out.reminders;
  return Response.json({ ...(typeof reminders === "object" && reminders ? reminders : { reminders }), digests: out.digests, expiryWarnings: out.expiryWarnings, purged: out.purged });
}
