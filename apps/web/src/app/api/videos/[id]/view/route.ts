import { db } from "@/lib/db";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await db.video.updateMany({ where: { id }, data: { viewCount: { increment: 1 } } });
  return Response.json({ ok: res.count > 0 });
}
