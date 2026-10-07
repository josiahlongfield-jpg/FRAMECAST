import { db } from "@/lib/db";
import { applyRekey, RekeyBody } from "@/lib/rekey";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Remove someone from the team and reset every key they could have held.
 * The remover's browser made new team and client keys and re-sealed
 * everything (lib/e2e/rekey.ts); the person removed keeps nothing that opens
 * anything through us, and every client gets a new link.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const { userId } = await ctx.params;
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const { workspace } = me;
  await rateLimit(`rekey:${workspace.id}`, 20, 3600);
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: workspace.id } } });
  if (!m) throw new HttpError(404, "Not on this team");
  if (m.role === "OWNER") throw new HttpError(403, "The owner can't be changed or removed");
  if (userId === me.user.id) throw new HttpError(400, "Ask another admin or the owner to remove you");
  const body = RekeyBody.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid key reset");
  const result = await applyRekey(workspace, body.data, async (tx) => {
    await tx.client.updateMany({ where: { workspaceId: workspace.id, assignedToId: userId }, data: { assignedToId: null } });
    await tx.membership.delete({ where: { id: m.id } });
    await tx.user.updateMany({ where: { id: userId, activeWorkspaceId: workspace.id }, data: { activeWorkspaceId: null } });
  });
  return Response.json(result);
});
