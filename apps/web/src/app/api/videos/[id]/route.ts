import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError, requireUser } from "@/lib/session";
import { ownedVideo, publicVideo } from "@/lib/videos";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video) throw new HttpError(404, "Video not found");
  return Response.json({ video: publicVideo(video) });
});

const Patch = z.object({ title: z.string().trim().min(1).max(200) });

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { workspace } = await requireUser();
  await ownedVideo(id, workspace.id);
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid title");
  const video = await db.video.update({ where: { id }, data: { title: body.data.title } });
  return Response.json({ video: publicVideo(video) });
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { workspace } = await requireUser();
  const video = await ownedVideo(id, workspace.id);
  if (video.status === "RECORDING") await storage().abort(video.storageKey, video.uploadId);
  else await storage().delete(video.storageKey);
  await db.video.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
