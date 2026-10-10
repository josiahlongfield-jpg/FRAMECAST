import crypto from "node:crypto";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { accessOf, visibleVideo } from "@/lib/permissions";

export const newVideoId = customAlphabet("23456789abcdefghijkmnpqrstuvwxyz", 12);

export const ALLOWED_MIME = /^(video\/(webm|mp4|quicktime)|audio\/(webm|mp4|ogg))(;.*)?$/;

export function extensionFor(mimeType: string) {
  if (mimeType.startsWith("video/mp4")) return "mp4";
  if (mimeType.startsWith("audio/mp4")) return "m4a";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  if (mimeType.startsWith("video/quicktime")) return "mov";
  return "webm";
}

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function newUploadToken() {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

/**
 * Who may upload parts to a video: the team member recording it, or whoever
 * holds the one-time upload token issued when a reply was started (replies
 * always use one, a team member's too). Seeing a video isn't enough: a
 * colleague could otherwise overwrite or cut short someone else's recording.
 */
export async function uploadableVideo(req: Request, id: string) {
  const token = req.headers.get("x-upload-token");
  if (token) {
    const video = await db.video.findUnique({ where: { id } });
    const expected = video?.uploadTokenHash;
    const given = hashToken(token);
    if (!video || !expected || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      throw new HttpError(404, "Video not found");
    }
    return video;
  }
  const me = await requireUser();
  const video = await visibleVideo(accessOf(me), id);
  if (video.replyToId || video.ownerId !== me.user.id) throw new HttpError(403, "Only the person recording this can upload it");
  return video;
}

/** Public projection used by the watch page and API (BigInt is not JSON-safe). */
export function publicVideo(v: {
  id: string;
  title: string;
  status: string;
  mimeType: string;
  durationMs: number | null;
  sizeBytes: bigint;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  viewCount: number;
  createdAt: Date;
  encrypted: boolean;
  teamKeyWrap: string | null;
  clientKeyWrap: string | null;
  purgeAt: Date | null;
}) {
  return {
    id: v.id,
    title: v.title,
    status: v.status,
    mimeType: v.mimeType,
    durationMs: v.durationMs,
    sizeBytes: Number(v.sizeBytes),
    hlsUrl: v.playbackUrl,
    rawUrl: `/api/videos/${v.id}/stream`,
    thumbnailUrl: v.thumbnailUrl,
    viewCount: v.viewCount,
    createdAt: v.createdAt.toISOString(),
    encrypted: v.encrypted,
    teamKeyWrap: v.teamKeyWrap,
    clientKeyWrap: v.clientKeyWrap,
    purgeAt: v.purgeAt?.toISOString() ?? null,
  };
}

const GB = 1024 ** 3;
const REPLY_BUDGET = 0.7 * GB;

/**
 * Most bytes of video and voice replies one conversation may take in a day.
 * Plenty for a real back-and-forth, but a ceiling on storage someone with a
 * link could fill.
 */
export async function replyBytesToday(conversationId: string) {
  const since = new Date(Date.now() - 86_400_000);
  const [done, open] = await Promise.all([
    db.video.aggregate({ where: { replyToId: conversationId, createdAt: { gt: since }, status: { not: "RECORDING" } }, _sum: { sizeBytes: true } }),
    db.uploadPart.aggregate({ where: { video: { replyToId: conversationId, status: "RECORDING", createdAt: { gt: since } } }, _sum: { sizeBytes: true } }),
  ]);
  return Number(done._sum.sizeBytes ?? 0) + Number(open._sum.sizeBytes ?? 0);
}
export const REPLY_DAILY_BYTES = 3 * GB;

/**
 * Most bytes one upload may hold: generous for real recordings at the plan's
 * longest length and best quality, but a ceiling against filling storage.
 */
export async function uploadBudget(video: { replyToId: string | null; workspaceId: string }) {
  // Replies are capped at 15 minutes: about 560 MB at the reply recorder's 1080p rate.
  if (video.replyToId) return REPLY_BUDGET;
  const w = await db.workspace.findUnique({ where: { id: video.workspaceId }, select: { plan: true } });
  // Free records 5 minutes at 720p (about 100 MB), so 300 MB leaves plenty of room.
  return w?.plan === "FREE" ? 0.3 * GB : 40 * GB;
}

/** Refuse a part that would take the upload past its budget. Parts are recorded as they're accepted. */
export async function checkUploadBudget(video: { id: string; replyToId: string | null; workspaceId: string }, partNumber: number, size: number) {
  const others = await db.uploadPart.aggregate({ where: { videoId: video.id, partNumber: { not: partNumber } }, _sum: { sizeBytes: true } });
  if ((others._sum.sizeBytes ?? 0) + size > (await uploadBudget(video))) {
    throw new HttpError(413, "This recording is larger than your plan allows.");
  }
}
