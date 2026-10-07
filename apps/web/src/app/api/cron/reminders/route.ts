import { runReminders } from "@/lib/reminders";
import { cronAuthorized } from "@/lib/secrets";

/** Run every few minutes (e.g. Vercel Cron) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runReminders());
}
