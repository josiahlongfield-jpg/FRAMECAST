import crypto from "node:crypto";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";

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
 * Who may upload parts to a video: its workspace members, or a guest holding
 * the one-time upload token issued when they started a reply.
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
  const { workspace } = await requireUser();
  return ownedVideo(id, workspace.id);
}

/** Load a video the current user is allowed to modify. */
export async function ownedVideo(id: string, workspaceId: string) {
  const video = await db.video.findUnique({ where: { id } });
  if (!video || video.workspaceId !== workspaceId) throw new HttpError(404, "Video not found");
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

/**
 * Most bytes one upload may hold: generous for real recordings at the plan's
 * longest length and best quality, but a ceiling against filling storage.
 */
export async function uploadBudget(video: { replyToId: string | null; workspaceId: string }) {
  if (video.replyToId) return 2 * GB; // replies are capped at 15 minutes
  const w = await db.workspace.findUnique({ where: { id: video.workspaceId }, select: { plan: true } });
  return w?.plan === "FREE" ? 2 * GB : 40 * GB;
}

/** Refuse a part that would take the upload past its budget. Parts are recorded as they're accepted. */
export async function checkUploadBudget(video: { id: string; replyToId: string | null; workspaceId: string }, partNumber: number, size: number) {
  const others = await db.uploadPart.aggregate({ where: { videoId: video.id, partNumber: { not: partNumber } }, _sum: { sizeBytes: true } });
  if ((others._sum.sizeBytes ?? 0) + size > (await uploadBudget(video))) {
    throw new HttpError(413, "This recording is larger than your plan allows.");
  }
}
