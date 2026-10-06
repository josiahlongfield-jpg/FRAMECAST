import { customAlphabet } from "nanoid";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";

export const newVideoId = customAlphabet("23456789abcdefghijkmnpqrstuvwxyz", 12);

export const ALLOWED_MIME = /^video\/(webm|mp4|quicktime)(;.*)?$/;

export function extensionFor(mimeType: string) {
  if (mimeType.startsWith("video/mp4")) return "mp4";
  if (mimeType.startsWith("video/quicktime")) return "mov";
  return "webm";
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
  };
}
