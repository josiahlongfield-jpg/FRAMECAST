import { db } from "@/lib/db";
import { handle, HttpError, requireUser } from "@/lib/session";

/** The staff member hides a reminder they were sent. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { user } = await requireUser();
  const res = await db.staffNotice.updateMany({ where: { id, toUserId: user.id, dismissedAt: null }, data: { dismissedAt: new Date() } });
  if (res.count === 0) throw new HttpError(404, "Not found");
  return Response.json({ ok: true });
});
