import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";

const Patch = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

/** Make someone an admin (manages staff and clients) or a member (records and replies). */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const { userId } = await ctx.params;
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid role");
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: me.workspace.id } } });
  if (!m) throw new HttpError(404, "Not on this team");
  if (m.role === "OWNER") throw new HttpError(403, "The owner can't be changed or removed");
  await db.membership.update({ where: { id: m.id }, data: { role: body.data.role } });
  return Response.json({ ok: true });
});
