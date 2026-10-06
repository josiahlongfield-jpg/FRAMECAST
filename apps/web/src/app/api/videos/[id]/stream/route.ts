import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { viewerFor } from "@/lib/access";

/** Serve the raw recording with HTTP Range support so players can seek. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const video = await db.video.findUnique({ where: { id } });
  if (!video || video.status === "RECORDING" || !(await viewerFor(video))) return new Response("Not found", { status: 404 });
  if (video.expiresAt && video.expiresAt < new Date()) return new Response("Link expired", { status: 410 });

  const driver = storage();
  const remote = await driver.playbackUrl(video.storageKey);
  if (remote) return Response.redirect(remote, 302);
  if (!driver.open) return new Response("Not found", { status: 404 });

  const headers = { "Content-Type": video.mimeType.split(";")[0], "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (!range) {
    const { stream, size } = await driver.open(video.storageKey);
    return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
  }
  const size = Number(video.sizeBytes);
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const { stream } = await driver.open(video.storageKey, { start, end });
  return new Response(stream, {
    status: 206,
    headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}
