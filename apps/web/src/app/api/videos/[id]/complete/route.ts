import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError } from "@/lib/session";
import { startTranscode } from "@/lib/transcode";
import { purgeDate } from "@/lib/retention";
import { notifyClientReply } from "@/lib/teamNotify";
import { publicVideo, uploadableVideo } from "@/lib/videos";
import { emailClientVideo } from "@/lib/emailClientVideo";

const Body = z.object({ partCount: z.number().int().min(1).max(10_000), durationMs: z.number().int().min(0).optional() });

/** Finish the upload. Every part 1..partCount must be present. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid request");

  const video = await uploadableVideo(req, id);
  if (video.status !== "RECORDING") return Response.json({ video: publicVideo(video) }); // already done, idempotent

  // Parts uploaded straight to the bucket are only known to the bucket.
  const driver = storage();
  const parts = driver.listParts
    ? (await driver.listParts(video.storageKey, video.uploadId)).sort((a, b) => a.partNumber - b.partNumber)
    : await db.uploadPart.findMany({ where: { videoId: id }, orderBy: { partNumber: "asc" } });
  const have = new Set(parts.map((p) => p.partNumber));
  const missing: number[] = [];
  for (let n = 1; n <= body.data.partCount; n++) if (!have.has(n)) missing.push(n);
  if (missing.length) return Response.json({ error: "Missing parts", missing }, { status: 409 });

  const used = parts.filter((p) => p.partNumber <= body.data.partCount);
  await driver.complete(video.storageKey, video.uploadId, used);
  const updated = await db.video.update({
    where: { id },
    data: {
      status: "UPLOADED",
      durationMs: body.data.durationMs,
      sizeBytes: used.reduce((sum, p) => sum + BigInt(p.sizeBytes), BigInt(0)),
      uploadId: null,
      uploadTokenHash: null, // a guest's token is single-use
      purgeAt: purgeDate((await db.workspace.findUniqueOrThrow({ where: { id: video.workspaceId } })).cloudBackup),
      emailClientWhenReady: false,
    },
  });
  await db.uploadPart.deleteMany({ where: { videoId: id } });
  // Encrypted recordings can't be read by the server, so they aren't transcoded.
  if (!updated.encrypted) after(() => startTranscode(id).catch((e) => console.error("transcode", e)));
  // It was sent to a client while still uploading: tell them now it's ready.
  if (video.emailClientWhenReady && updated.clientId) after(() => emailClientVideo(id));
  // A client's video or voice reply has arrived: tell the person looking after them.
  if (updated.replyToId) {
    const reply = await db.reply.findUnique({ where: { mediaId: id }, select: { authorUserId: true } });
    if (reply && !reply.authorUserId) after(() => notifyClientReply(updated.replyToId!));
  }
  return Response.json({ video: publicVideo(updated) });
});
