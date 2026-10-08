import { db } from "@/lib/db";
import { memberOrClient } from "@/lib/access";
import { handle } from "@/lib/session";

/**
 * The client has their key on a device (they opened their personal link), so
 * their business no longer needs reminding to send it. Called by the client's
 * own browser; a team member viewing changes nothing.
 */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const who = await memberOrClient(id);
  if (who.kind === "client" && !who.client.linkOpenedAt) await db.client.update({ where: { id }, data: { linkOpenedAt: new Date() } });
  return new Response(null, { status: 204 });
});
