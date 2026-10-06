import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/session";
import { REACTIONS } from "@/lib/reactions";
import { viewableVideo } from "@/lib/access";

const Body = z.object({ emoji: z.enum(REACTIONS), timestampMs: z.number().int().min(0).optional() });

/** Anyone allowed to view the video (members and its client) can react. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Unsupported reaction");
  await viewableVideo(id);
  await db.reaction.create({ data: { videoId: id, ...body.data } });
  return Response.json({ ok: true }, { status: 201 });
});
