import { z } from "zod";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { storage } from "@/lib/storage";
import { handle, HttpError, requireUser } from "@/lib/session";
import { ALLOWED_MIME, extensionFor, newVideoId, publicVideo } from "@/lib/videos";
import { limitByIp } from "@/lib/rateLimit";
import { KeyFingerprint, requireCurrentKey } from "@/lib/keys";
import { accessOf, libraryWhere } from "@/lib/permissions";
import { ensureTimezone } from "@/lib/reminders";
import { videoLimitMessage, videosUsed } from "@/lib/videoAllowance";

const CreateBody = z.object({
  mimeType: z.string().max(120).regex(ALLOWED_MIME),
  title: z.string().trim().min(1).max(200).optional(),
  /** The recorder's time zone, adopted by a workspace that hasn't got one yet (dates in emails and pages). */
  timeZone: z.string().max(64).optional(),
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

  const tz = await ensureTimezone(workspace.id, body.data.timeZone);

  const id = newVideoId();
  const storageKey = `videos/${workspace.id}/${id}/source.${extensionFor(body.data.mimeType)}`;
  const limit = PLANS[workspace.plan].maxVideos;
  const video = await db.$transaction(async (tx) => {
    if (limit !== null) {
      // Counted under a lock so two recordings started at once can't both take the last place.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"videos:" + workspace.id}))`;
      const { used, uploading } = await videosUsed(workspace.id, tx);
      if (used >= limit) throw new HttpError(402, videoLimitMessage(PLANS[workspace.plan].name, limit, uploading));
    }
    const uploadId = await storage().begin(storageKey, body.data.mimeType);
    return tx.video.create({
      data: {
        id,
        title: body.data.title ?? `Recording ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz })}`,
        mimeType: body.data.mimeType,
        encrypted: true,
        teamKeyWrap: body.data.teamKeyWrap,
        storageKey,
        uploadId,
        ownerId: user.id,
        workspaceId: workspace.id,
      },
    });
  }, { timeout: 20_000 });
  return Response.json(
    { video: publicVideo(video), maxDurationMin: PLANS[workspace.plan].maxDurationMin, maxResolution: PLANS[workspace.plan].maxResolution },
    { status: 201 },
  );
});

export const GET = handle(async () => {
  const access = accessOf(await requireUser());
  const videos = await db.video.findMany({ where: libraryWhere(access), orderBy: { createdAt: "desc" } });
  return Response.json({ videos: videos.map(publicVideo) });
});
