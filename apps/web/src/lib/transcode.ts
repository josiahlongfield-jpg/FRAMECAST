import { db } from "@/lib/db";
import { storage } from "@/lib/storage";

const MUX_API = "https://api.mux.com/video/v1";

function muxAuth() {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) return null;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/**
 * Hand the finished raw upload to Mux for adaptive HLS, thumbnails and captions.
 * The raw file stays playable meanwhile, so the share link works the moment
 * recording stops. Without Mux configured, the raw file is the final rendition.
 */
export async function startTranscode(videoId: string) {
  const authHeader = muxAuth();
  const video = await db.video.findUniqueOrThrow({ where: { id: videoId } });
  const input = await storage().playbackUrl(video.storageKey);
  if (!authHeader || !input) return;

  const res = await fetch(`${MUX_API}/assets`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: [{ url: input, generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }],
      playback_policy: ["public"],
      passthrough: videoId,
      video_quality: "plus",
    }),
  });
  if (!res.ok) {
    console.error("Mux asset create failed", res.status, await res.text());
    return;
  }
  await db.video.update({ where: { id: videoId }, data: { status: "PROCESSING" } });
}

type MuxEvent = {
  type: string;
  data: { passthrough?: string; duration?: number; playback_ids?: { id: string }[] };
};

export async function handleMuxEvent(event: MuxEvent) {
  const videoId = event.data.passthrough;
  if (!videoId) return;
  if (event.type === "video.asset.ready") {
    const pid = event.data.playback_ids?.[0]?.id;
    if (!pid) return;
    await db.video.update({
      where: { id: videoId },
      data: {
        status: "READY",
        playbackUrl: `https://stream.mux.com/${pid}.m3u8`,
        thumbnailUrl: `https://image.mux.com/${pid}/thumbnail.jpg?time=1`,
        durationMs: event.data.duration ? Math.round(event.data.duration * 1000) : undefined,
      },
    });
  } else if (event.type === "video.asset.errored") {
    // Keep serving the raw upload; just record that HLS failed.
    await db.video.update({ where: { id: videoId }, data: { status: "UPLOADED" } });
  }
}
