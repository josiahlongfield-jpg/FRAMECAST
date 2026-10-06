import { db } from "@/lib/db";
import { viewableVideo } from "@/lib/access";
import { handle } from "@/lib/session";
import { limitByIp } from "@/lib/rateLimit";

/** Count a view, but not the creator's own plays. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await limitByIp("views", 120, 60);
  const { id } = await ctx.params;
  const { viewer } = await viewableVideo(id);
  if (viewer.kind === "client") await db.video.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  return Response.json({ ok: true });
});
