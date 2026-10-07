import { db } from "@/lib/db";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";

/** Cancel an invite that hasn't been accepted yet. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const res = await db.invite.updateMany({ where: { id, workspaceId: me.workspace.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw new HttpError(404, "Invite not found");
  return new Response(null, { status: 204 });
});
