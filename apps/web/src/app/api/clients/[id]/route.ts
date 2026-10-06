import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, requireUser } from "@/lib/session";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).optional(),
});

/** Update a client's name or the email their reminders go to. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { workspace } = await requireUser();
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Enter a valid email address");
  const res = await db.client.updateMany({
    where: { id, workspaceId: workspace.id, removedAt: null },
    data: { name: body.data.name, email: body.data.email === undefined ? undefined : body.data.email || null },
  });
  if (res.count === 0) throw new HttpError(404, "Client not found");
  return Response.json({ ok: true });
});

/** Remove a client: frees their seat and their link stops working immediately. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { workspace } = await requireUser();
  const res = await db.client.updateMany({ where: { id, workspaceId: workspace.id, removedAt: null }, data: { removedAt: new Date() } });
  if (res.count === 0) throw new HttpError(404, "Client not found");
  return new Response(null, { status: 204 });
});
