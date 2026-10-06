import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError, requireUser } from "@/lib/session";
import { startTranscode } from "@/lib/transcode";
import { ownedVideo, publicVideo } from "@/lib/videos";

const Body = z.object({ partCount: z.number().int().min(1), durationMs: z.number().int().min(0).optional() });

/** Finish the upload. Every part 1..partCount must be present. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { workspace } = await requireUser();
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid request");

  const video = await ownedVideo(id, workspace.id);
  if (video.status !== "RECORDING") return Response.json({ video: publicVideo(video) }); // already done, idempotent

  const parts = await db.uploadPart.findMany({ where: { videoId: id }, orderBy: { partNumber: "asc" } });
  const missing: number[] = [];
  for (let n = 1; n <= body.data.partCount; n++) if (!parts.some((p) => p.partNumber === n)) missing.push(n);
  if (missing.length) return Response.json({ error: "Missing parts", missing }, { status: 409 });

  const used = parts.filter((p) => p.partNumber <= body.data.partCount);
  await storage().complete(video.storageKey, video.uploadId, used);
  const updated = await db.video.update({
    where: { id },
    data: {
      status: "UPLOADED",
      durationMs: body.data.durationMs,
      sizeBytes: used.reduce((sum, p) => sum + BigInt(p.sizeBytes), BigInt(0)),
      uploadId: null,
    },
  });
  await db.uploadPart.deleteMany({ where: { videoId: id } });
  after(() => startTranscode(id).catch((e) => console.error("transcode", e)));
  return Response.json({ video: publicVideo(updated) });
});
