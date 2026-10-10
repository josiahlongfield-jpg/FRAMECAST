import { after } from "next/server";
import { z } from "zod";
import type { Video } from "@prisma/client";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { handle, HttpError } from "@/lib/session";
import { purgeDate } from "@/lib/retention";
import { notifyClientReply } from "@/lib/teamNotify";
import { publicVideo, uploadableVideo, uploadBudget } from "@/lib/videos";
import { PLANS } from "@/lib/plans";
import { emailClientVideo } from "@/lib/emailClientVideo";

const Body = z.object({ partCount: z.number().int().min(1).max(10_000), durationMs: z.number().int().min(0) });

/** Finish the upload. Every part 1..partCount must be present. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid request");

  const video = await uploadableVideo(req, id);
  if (video.status !== "RECORDING") return Response.json({ video: publicVideo(video) }); // already done, idempotent

  // Parts uploaded straight to the bucket are only known to the bucket.
  const driver = storage();
  let parts: { partNumber: number; etag: string | null; sizeBytes: number | bigint }[];
  try {
    parts = driver.listParts
      ? (await driver.listParts(video.storageKey, video.uploadId)).sort((a, b) => a.partNumber - b.partNumber)
      : await db.uploadPart.findMany({ where: { videoId: id }, orderBy: { partNumber: "asc" } });
  } catch (err) {
    // An earlier try finished the upload in the bucket but its answer was lost: finish it here too.
    const size = (err as { name?: string })?.name === "NoSuchUpload" ? await driver.storedSize?.(video.storageKey) : null;
    if (size == null) throw err;
    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: video.workspaceId } });
    return Response.json({ video: publicVideo(await finish(video, workspace.cloudBackup, body.data.durationMs, BigInt(size))) });
  }
  const have = new Set(parts.map((p) => p.partNumber));
  const missing: number[] = [];
  for (let n = 1; n <= body.data.partCount; n++) if (!have.has(n)) missing.push(n);
  if (missing.length) return Response.json({ error: "Missing parts", missing }, { status: 409 });

  const used = parts.filter((p) => p.partNumber <= body.data.partCount);
  // The browser stops at the plan's limits; this holds for anything that doesn't.
  const total = used.reduce((sum, p) => sum + Number(p.sizeBytes), 0);
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: video.workspaceId } });
  const maxMinutes = video.replyToId ? 15 : PLANS[workspace.plan].maxDurationMin;
  const refusal =
    total > (await uploadBudget(video)) ? "This recording is larger than your plan allows."
    : body.data.durationMs > (maxMinutes * 60 + 30) * 1000 ? "This recording is longer than your plan allows."
    : null;
  if (refusal) {
    await driver.abort(video.storageKey, video.uploadId).catch(() => {});
    await db.video.update({ where: { id }, data: { status: "EXPIRED", uploadId: null, uploadTokenHash: null } });
    throw new HttpError(413, refusal);
  }
  await driver.complete(video.storageKey, video.uploadId, used);
  const updated = await finish(video, workspace.cloudBackup, body.data.durationMs, used.reduce((sum, p) => sum + BigInt(p.sizeBytes), BigInt(0)));
  return Response.json({ video: publicVideo(updated) });
});

/** Marks the upload done and tells whoever is waiting for it. */
async function finish(video: Video, cloudBackup: boolean, durationMs: number, sizeBytes: bigint) {
  const id = video.id;
  const updated = await db.video.update({
    where: { id },
    data: {
      status: "UPLOADED",
      durationMs,
      sizeBytes,
      uploadId: null,
      uploadTokenHash: null, // a guest's token is single-use
      purgeAt: purgeDate(cloudBackup),
      emailClientWhenReady: false,
    },
  });
  await db.uploadPart.deleteMany({ where: { videoId: id } });
  // It was sent to a client while still uploading: tell them now it's ready.
  if (video.emailClientWhenReady && updated.clientId) after(() => emailClientVideo(id));
  // A client's video or voice reply has arrived: tell the person looking after them.
  if (updated.replyToId) {
    const reply = await db.reply.findUnique({ where: { mediaId: id }, select: { authorUserId: true } });
    if (reply && !reply.authorUserId) after(() => notifyClientReply(updated.replyToId!));
  }
  return updated;
}
