import { runReminders } from "@/lib/reminders";
import { flushTeamNotifications } from "@/lib/teamNotify";
import { cronAuthorized } from "@/lib/secrets";

/** Run every few minutes (e.g. Vercel Cron) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const result = await runReminders();
  // Team emails held back by the 15-minute limit go out as a digest.
  const digests = await flushTeamNotifications();
  return Response.json({ ...result, digests });
}
