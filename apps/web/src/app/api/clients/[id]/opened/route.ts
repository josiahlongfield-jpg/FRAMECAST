import { db } from "@/lib/db";
import { clientFromCookie } from "@/lib/access";
import { handle } from "@/lib/session";

/**
 * The client has their key on a device (they opened their personal link), so
 * their business no longer needs reminding to send it. Called by the client's
 * own browser. Goes by the client's own sign-in (set by their personal link)
 * even when the same browser is also signed in to the team, as when a business
 * tries a client's link on its own computer; a team member alone changes nothing.
 */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const client = await db.client.findUnique({ where: { id }, select: { id: true, workspaceId: true, removedAt: true, linkOpenedAt: true } });
  if (!client || client.removedAt) return new Response(null, { status: 404 });
  const self = await clientFromCookie(client.workspaceId);
  if (self?.id === client.id && !client.linkOpenedAt) await db.client.update({ where: { id }, data: { linkOpenedAt: new Date() } });
  return new Response(null, { status: 204 });
});
