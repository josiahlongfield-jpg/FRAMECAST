import { db } from "@/lib/db";
import { memberOrClient } from "@/lib/access";
import { handle, HttpError } from "@/lib/session";

/**
 * A team member copied this client's personal link to send it, so from now on
 * videos to them are sent with a plain Send instead of the link reminder.
 */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const who = await memberOrClient(id);
  if (who.kind !== "member") throw new HttpError(404, "Not found");
  await db.client.updateMany({ where: { id, linkSentAt: null }, data: { linkSentAt: new Date() } });
  return new Response(null, { status: 204 });
});
