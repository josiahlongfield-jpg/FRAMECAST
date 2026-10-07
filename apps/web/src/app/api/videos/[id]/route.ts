import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError, requireUser } from "@/lib/session";
import { ownedVideo, publicVideo } from "@/lib/videos";
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
  const { workspace } = await requireUser();
  const current = await ownedVideo(id, workspace.id);
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid update");
  if (body.data.clientKeyWrap) await requireCurrentKey(workspace, body.data.keyFingerprint);
  if (body.data.clientId) {
    const client = await db.client.findFirst({ where: { id: body.data.clientId, workspaceId: workspace.id, removedAt: null } });
    if (!client) throw new HttpError(400, "Unknown client");
    if (current.encrypted && !body.data.clientKeyWrap) throw new HttpError(400, "Missing the client's key for this video");
  }
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
  const { workspace } = await requireUser();
  const video = await ownedVideo(id, workspace.id);
  // Remove the conversation's reply media along with the video itself.
  const media = await db.video.findMany({ where: { replyToId: id } });
  for (const v of [video, ...media]) {
    if (v.status === "RECORDING") await storage().abort(v.storageKey, v.uploadId);
    else await storage().delete(v.storageKey);
  }
  await db.video.deleteMany({ where: { id: { in: [id, ...media.map((m) => m.id)] } } });
  return new Response(null, { status: 204 });
});
