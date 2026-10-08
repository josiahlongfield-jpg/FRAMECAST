import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError, requireUser } from "@/lib/session";
import { publicVideo } from "@/lib/videos";
import { accessOf, canDeleteVideo, canSeeClient, visibleVideo } from "@/lib/permissions";
import { viewableVideo } from "@/lib/access";
import { KeyFingerprint, requireCurrentKey } from "@/lib/keys";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { video } = await viewableVideo(id);
  return Response.json({ video: publicVideo(video) });
});

const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  /** Send the video to a client (or null to make it members-only again). */
  clientId: z.string().nullable().optional(),
  /** The video key wrapped with that client's key, made on the sender's device. */
  clientKeyWrap: z.string().min(40).max(200).optional(),
  keyFingerprint: KeyFingerprint,
});

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  const { workspace } = me;
  const access = accessOf(me);
  const current = await visibleVideo(access, id);
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid update");
  if (body.data.clientKeyWrap) await requireCurrentKey(workspace, body.data.keyFingerprint);
  if (body.data.clientId) {
    const client = await db.client.findFirst({ where: { id: body.data.clientId, workspaceId: workspace.id, removedAt: null } });
    if (!client || !canSeeClient(access, client)) throw new HttpError(400, "Unknown client");
    if (current.encrypted && !body.data.clientKeyWrap) throw new HttpError(400, "Missing the client's key for this video");
  }
  // Copies sent to other clients keep the same title.
  if (body.data.title && !current.sourceId) await db.video.updateMany({ where: { sourceId: id }, data: { title: body.data.title } });
  const video = await db.video.update({
    where: { id },
    data: {
      title: body.data.title,
      clientId: body.data.clientId,
      ...(body.data.clientId !== undefined ? { clientKeyWrap: body.data.clientId ? body.data.clientKeyWrap : null } : {}),
    },
  });
  return Response.json({ video: publicVideo(video) });
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const access = accessOf(await requireUser());
  const video = await visibleVideo(access, id);
  if (!canDeleteVideo(access, video)) throw new HttpError(403, "You can only delete videos you recorded. Ask the owner or an admin.");
  // Deleting an original also deletes the copies sent to other clients.
  const copies = video.sourceId ? [] : await db.video.findMany({ where: { sourceId: id } });
  const conversations = [id, ...copies.map((c) => c.id)];
  // Remove each conversation's reply media along with the video itself.
  const media = await db.video.findMany({ where: { replyToId: { in: conversations } } });
  // A copy shares the original's file, so only the original's deletion removes it.
  for (const v of video.sourceId ? media : [video, ...media]) {
    if (v.status === "RECORDING") await storage().abort(v.storageKey, v.uploadId);
    else await storage().delete(v.storageKey);
  }
  await db.video.deleteMany({ where: { id: { in: [...conversations, ...media.map((m) => m.id)] } } });
  return new Response(null, { status: 204 });
});
