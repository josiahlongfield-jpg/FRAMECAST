import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError, requireUser } from "@/lib/session";
import { ownedVideo } from "@/lib/videos";

const MAX_PART_BYTES = 64 * 1024 * 1024;

/**
 * Upload one part of a recording. Idempotent: the client may resend a part
 * after a crash or network failure and it simply replaces the earlier copy.
 */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string; part: string }> }) => {
  const { id, part } = await ctx.params;
  const partNumber = Number(part);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new HttpError(400, "Bad part number");

  const { workspace } = await requireUser();
  const video = await ownedVideo(id, workspace.id);
  if (video.status !== "RECORDING") throw new HttpError(409, "Upload already completed");

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length === 0) throw new HttpError(400, "Empty part");
  if (body.length > MAX_PART_BYTES) throw new HttpError(413, "Part too large");

  const etag = await storage().putPart(video.storageKey, video.uploadId, partNumber, body);
  await db.uploadPart.upsert({
    where: { videoId_partNumber: { videoId: id, partNumber } },
    create: { videoId: id, partNumber, etag, sizeBytes: body.length },
    update: { etag, sizeBytes: body.length },
  });
  return Response.json({ partNumber, size: body.length });
});
