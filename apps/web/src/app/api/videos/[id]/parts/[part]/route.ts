import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError } from "@/lib/session";
import { checkUploadBudget, uploadableVideo } from "@/lib/videos";

const MAX_PART_BYTES = 64 * 1024 * 1024;

/**
 * Upload one part of a recording. Idempotent: the client may resend a part
 * after a crash or network failure and it simply replaces the earlier copy.
 */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string; part: string }> }) => {
  const { id, part } = await ctx.params;
  const partNumber = parsePart(part);

  const video = await uploadableVideo(req, id);
  if (video.status !== "RECORDING") throw new HttpError(409, "Upload already completed");

  // Refuse oversized parts before reading them into memory.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_PART_BYTES) throw new HttpError(413, "Part too large");
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length === 0) throw new HttpError(400, "Empty part");
  if (body.length > MAX_PART_BYTES) throw new HttpError(413, "Part too large");
  await checkUploadBudget(video, partNumber, body.length);

  const etag = await storage().putPart(video.storageKey, video.uploadId, partNumber, body);
  await db.uploadPart.upsert({
    where: { videoId_partNumber: { videoId: id, partNumber } },
    create: { videoId: id, partNumber, etag, sizeBytes: body.length },
    update: { etag, sizeBytes: body.length },
  });
  return Response.json({ partNumber, size: body.length });
});

const Presign = z.object({ size: z.number().int().min(1).max(MAX_PART_BYTES) });

/**
 * With object storage, the browser uploads each part straight to the bucket.
 * This returns a short-lived URL for one part of exactly `size` bytes. The
 * bucket is the record of which parts arrived; see the complete route.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string; part: string }> }) => {
  const { id, part } = await ctx.params;
  const partNumber = parsePart(part);
  const body = Presign.safeParse(await req.json().catch(() => null));
  if (!body.success) throw new HttpError(body.error.issues.some((i) => i.code === "too_big") ? 413 : 400, "Bad part size");

  const video = await uploadableVideo(req, id);
  if (video.status !== "RECORDING") throw new HttpError(409, "Upload already completed");
  const driver = storage();
  if (!driver.presignPart) return Response.json({ url: null });
  await checkUploadBudget(video, partNumber, body.data.size);
  // Record the planned size so the budget counts parts that go straight to the bucket.
  // Never lower a recorded size: an earlier link for a bigger part may still be used.
  const earlier = await db.uploadPart.findUnique({ where: { videoId_partNumber: { videoId: id, partNumber } }, select: { sizeBytes: true } });
  await db.uploadPart.upsert({
    where: { videoId_partNumber: { videoId: id, partNumber } },
    create: { videoId: id, partNumber, etag: null, sizeBytes: body.data.size },
    update: { sizeBytes: Math.max(earlier?.sizeBytes ?? 0, body.data.size) },
  });
  return Response.json({ url: await driver.presignPart(video.storageKey, video.uploadId, partNumber, body.data.size) });
});

function parsePart(part: string) {
  const n = Number(part);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new HttpError(400, "Bad part number");
  return n;
}
