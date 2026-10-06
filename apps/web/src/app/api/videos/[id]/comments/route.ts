import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, requireUser } from "@/lib/session";

const Body = z.object({ body: z.string().trim().min(1).max(2000), timestampMs: z.number().int().min(0).optional() });

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const comments = await db.comment.findMany({
    where: { videoId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, email: true, image: true } } },
  });
  return Response.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      timestampMs: c.timestampMs,
      createdAt: c.createdAt.toISOString(),
      author: c.author.name ?? c.author.email.split("@")[0],
    })),
  });
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { user } = await requireUser();
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Comment is empty or too long");
  if (!(await db.video.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "Video not found");
  const c = await db.comment.create({ data: { videoId: id, authorId: user.id, ...body.data } });
  return Response.json(
    { comment: { id: c.id, body: c.body, timestampMs: c.timestampMs, createdAt: c.createdAt.toISOString(), author: user.name ?? user.email.split("@")[0] } },
    { status: 201 },
  );
});
