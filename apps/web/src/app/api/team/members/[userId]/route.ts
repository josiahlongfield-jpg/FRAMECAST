import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";

const Patch = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

async function target(userId: string, workspaceId: string) {
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!m) throw new HttpError(404, "Not on this team");
  if (m.role === "OWNER") throw new HttpError(403, "The owner can't be changed or removed");
  return m;
}

/** Make someone an admin (manages staff and clients) or a member (records and replies). */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const { userId } = await ctx.params;
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid role");
  const m = await target(userId, me.workspace.id);
  await db.membership.update({ where: { id: m.id }, data: { role: body.data.role } });
  return Response.json({ ok: true });
});

/**
 * Remove someone from the team, or leave it yourself. Their clients go back
 * to the shared list.
 */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const { userId } = await ctx.params;
  const me = await requireUser();
  if (userId !== me.user.id) requireRole(me, "OWNER", "ADMIN");
  const m = await target(userId, me.workspace.id);
  await db.$transaction([
    db.client.updateMany({ where: { workspaceId: me.workspace.id, assignedToId: userId }, data: { assignedToId: null } }),
    db.membership.delete({ where: { id: m.id } }),
    db.user.updateMany({ where: { id: userId, activeWorkspaceId: me.workspace.id }, data: { activeWorkspaceId: null } }),
  ]);
  return new Response(null, { status: 204 });
});
