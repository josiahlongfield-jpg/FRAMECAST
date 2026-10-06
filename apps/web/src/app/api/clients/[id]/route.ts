import { db } from "@/lib/db";
import { handle, HttpError, requireUser } from "@/lib/session";

/** Remove a client: frees their seat and their link stops working immediately. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { workspace } = await requireUser();
  const res = await db.client.updateMany({ where: { id, workspaceId: workspace.id, removedAt: null }, data: { removedAt: new Date() } });
  if (res.count === 0) throw new HttpError(404, "Client not found");
  return new Response(null, { status: 204 });
});
