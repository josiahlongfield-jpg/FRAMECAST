import { z } from "zod";
import { db } from "@/lib/db";
import { enforceSeatLimits } from "@/lib/seatLimits";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import { accessOf, clientScopeWhere } from "@/lib/permissions";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).optional(),
  /** Staff member who looks after this client; null puts them back in the shared list. */
  assignedToId: z.string().min(1).max(40).nullable().optional(),
});

/** Update a client's name or the email their reminders go to. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  const { workspace } = me;
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Enter a valid email address");
  if (body.data.assignedToId !== undefined) {
    requireRole(me, "OWNER", "ADMIN");
    if (body.data.assignedToId && !(await db.membership.findUnique({ where: { userId_workspaceId: { userId: body.data.assignedToId, workspaceId: workspace.id } } }))) {
      throw new HttpError(400, "That person isn't on your team");
    }
  }
  await rateLimit(`client-edit:${workspace.id}`, 30, 3600);
  const res = await db.client.updateMany({
    where: { ...clientScopeWhere(accessOf(me)), id, removedAt: null },
    data: { name: body.data.name, email: body.data.email === undefined ? undefined : body.data.email || null, assignedToId: body.data.assignedToId },
  });
  if (res.count === 0) throw new HttpError(404, "Client not found");
  return Response.json({ ok: true });
});

/** Remove a client: frees their seat and their link stops working immediately. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const { workspace } = me;
  const res = await db.client.updateMany({ where: { id, workspaceId: workspace.id, removedAt: null }, data: { removedAt: new Date() } });
  if (res.count === 0) throw new HttpError(404, "Client not found");
  // A freed seat restores a paused client.
  await enforceSeatLimits(workspace.id);
  return new Response(null, { status: 204 });
});
