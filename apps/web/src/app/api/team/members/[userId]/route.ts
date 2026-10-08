import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { permsOf } from "@/lib/permissions";

const Patch = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  /** What a member may do (owners and admins always have full access). */
  perms: z
    .object({ seeAllClients: z.boolean(), addClients: z.boolean(), deleteAnyVideo: z.boolean(), sendToMany: z.boolean() })
    .partial()
    .optional(),
});

/**
 * Make someone an admin (manages staff and clients) or a member (records and
 * replies), and choose what a member may do.
 */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const { userId } = await ctx.params;
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const body = Patch.safeParse(await req.json());
  if (!body.success || (!body.data.role && !body.data.perms)) throw new HttpError(400, "Invalid change");
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: me.workspace.id } } });
  if (!m) throw new HttpError(404, "Not on this team");
  if (m.role === "OWNER") throw new HttpError(403, "The owner can't be changed or removed");
  const updated = await db.membership.update({ where: { id: m.id }, data: { role: body.data.role, ...body.data.perms } });
  return Response.json({ ok: true, role: updated.role, perms: permsOf(updated) });
});
