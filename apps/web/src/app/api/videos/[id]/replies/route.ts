import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { replyDTO, visibleReplies } from "@/lib/replies";
import { currentUser, handle, HttpError } from "@/lib/session";
import { ALLOWED_MIME, extensionFor, newUploadToken, newVideoId } from "@/lib/videos";

const MAX_REPLY_MINUTES = 15;

const Author = z.string().trim().min(1).max(80).optional();
const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TEXT"), body: z.string().trim().min(1).max(4000), timestampMs: z.number().int().min(0).optional(), authorName: Author }),
  z.object({ kind: z.enum(["VIDEO", "AUDIO"]), mimeType: z.string().regex(ALLOWED_MIME), authorName: Author }),
]);

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const root = await db.video.findUnique({ where: { id }, select: { ownerId: true } });
  if (!root) throw new HttpError(404, "Video not found");
  const replies = await db.reply.findMany({
    where: { videoId: id, ...visibleReplies },
    orderBy: { createdAt: "asc" },
    include: { media: true },
  });
  return Response.json({ replies: replies.map((r) => replyDTO(r, root.ownerId)) });
});

/**
 * Reply to a video with text, or start a video/voice reply. Anyone who can
 * watch the video can reply; signed-in users are attributed automatically,
 * guests give a name. Media replies return a one-time upload token and use
 * the same crash-safe part upload as normal recordings.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, "Invalid reply");
  const body = parsed.data;

  const root = await db.video.findUnique({ where: { id } });
  if (!root || root.replyToId) throw new HttpError(404, "Video not found");
  if (root.expiresAt && root.expiresAt < new Date()) throw new HttpError(410, "This link has expired");

  const me = await currentUser();
  const authorName = me ? (me.user.name ?? me.user.email.split("@")[0]) : body.authorName;
  if (!authorName) throw new HttpError(400, "Please add your name");

  if (body.kind === "TEXT") {
    const reply = await db.reply.create({
      data: { kind: "TEXT", body: body.body, timestampMs: body.timestampMs, authorName, videoId: id, authorUserId: me?.user.id },
      include: { media: true },
    });
    return Response.json({ reply: replyDTO(reply, root.ownerId) }, { status: 201 });
  }

  const mediaId = newVideoId();
  const storageKey = `videos/${root.workspaceId}/${root.id}/replies/${mediaId}.${extensionFor(body.mimeType)}`;
  const uploadId = await storage().begin(storageKey, body.mimeType);
  const upload = newUploadToken();
  const reply = await db.reply.create({
    data: {
      kind: body.kind,
      authorName,
      video: { connect: { id } },
      ...(me ? { authorUser: { connect: { id: me.user.id } } } : {}),
      media: {
        create: {
          id: mediaId,
          title: `Reply from ${authorName}`,
          mimeType: body.mimeType,
          storageKey,
          uploadId,
          uploadTokenHash: upload.hash,
          replyToId: id,
          ownerId: root.ownerId,
          workspaceId: root.workspaceId,
        },
      },
    },
    include: { media: true },
  });
  return Response.json(
    { reply: replyDTO(reply, root.ownerId), mediaId, uploadToken: upload.token, maxDurationMin: MAX_REPLY_MINUTES },
    { status: 201 },
  );
});
