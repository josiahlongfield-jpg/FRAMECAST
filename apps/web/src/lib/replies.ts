import type { Reply, Video } from "@prisma/client";

export type ReplyDTO = {
  id: string;
  kind: "TEXT" | "VIDEO" | "AUDIO";
  body: string | null;
  timestampMs: number | null;
  authorName: string;
  /** Written by the person who sent the video (as opposed to the viewer replying). */
  fromOwner: boolean;
  createdAt: string;
  media: { id: string; url: string; mimeType: string; durationMs: number | null } | null;
};

export function replyDTO(r: Reply & { media: Video | null }, ownerId: string): ReplyDTO {
  return {
    id: r.id,
    kind: r.kind,
    body: r.body,
    timestampMs: r.timestampMs,
    authorName: r.authorName,
    fromOwner: !!r.authorUserId && r.authorUserId === ownerId,
    createdAt: r.createdAt.toISOString(),
    media: r.media
      ? { id: r.media.id, url: `/api/videos/${r.media.id}/stream`, mimeType: r.media.mimeType, durationMs: r.media.durationMs }
      : null,
  };
}

/** A media reply only appears in the conversation once its upload has finished. */
export const visibleReplies = {
  OR: [{ kind: "TEXT" as const }, { media: { status: { not: "RECORDING" as const } } }],
};
