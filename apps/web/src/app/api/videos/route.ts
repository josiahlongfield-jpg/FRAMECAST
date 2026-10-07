import { z } from "zod";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { storage } from "@/lib/storage";
import { handle, HttpError, requireUser } from "@/lib/session";
import { ALLOWED_MIME, extensionFor, newVideoId, publicVideo } from "@/lib/videos";
import { limitByIp } from "@/lib/rateLimit";
import { KeyFingerprint, requireCurrentKey } from "@/lib/keys";

const CreateBody = z.object({
  mimeType: z.string().regex(ALLOWED_MIME),
  title: z.string().trim().min(1).max(200).optional(),
  /** Recordings must be end-to-end encrypted; this is the video key wrapped with the team key. */
  teamKeyWrap: z.string().min(40).max(200),
  keyFingerprint: KeyFingerprint,
});

/** Start a recording: creates the video row and opens a multipart upload. */
export const POST = handle(async (req: Request) => {
  const { user, workspace } = await requireUser();
  const body = CreateBody.safeParse(await req.json());
  await limitByIp("videos", 60, 3600);
  if (!body.success) throw new HttpError(400, "Invalid request");
  if (!workspace.keyFingerprint) throw new HttpError(409, "Set up your encryption key before recording");
  await requireCurrentKey(workspace, body.data.keyFingerprint);

  const limit = PLANS[workspace.plan].maxVideos;
  if (limit !== null) {
    const count = await db.video.count({ where: { workspaceId: workspace.id, replyToId: null, sourceId: null } });
    if (count >= limit) throw new HttpError(402, `The ${PLANS[workspace.plan].name} plan allows ${limit} videos. Upgrade to record more.`);
  }

  const id = newVideoId();
  const storageKey = `videos/${workspace.id}/${id}/source.${extensionFor(body.data.mimeType)}`;
  const uploadId = await storage().begin(storageKey, body.data.mimeType);
  const video = await db.video.create({
    data: {
      id,
      title: body.data.title ?? `Recording ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`,
      mimeType: body.data.mimeType,
      encrypted: true,
      teamKeyWrap: body.data.teamKeyWrap,
      storageKey,
      uploadId,
      ownerId: user.id,
      workspaceId: workspace.id,
    },
  });
  return Response.json(
    { video: publicVideo(video), maxDurationMin: PLANS[workspace.plan].maxDurationMin, maxResolution: PLANS[workspace.plan].maxResolution },
    { status: 201 },
  );
});

export const GET = handle(async () => {
  const { workspace } = await requireUser();
  const videos = await db.video.findMany({ where: { workspaceId: workspace.id, replyToId: null, sourceId: null }, orderBy: { createdAt: "desc" } });
  return Response.json({ videos: videos.map(publicVideo) });
});
