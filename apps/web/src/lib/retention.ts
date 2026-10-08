import { db } from "@/lib/db";
import { storage } from "@/lib/storage";

/** How long the server keeps an encrypted relay copy when cloud backup is off. */
export const RETENTION_DAYS = Number(process.env.RELAY_RETENTION_DAYS ?? 30);

export function purgeDate(cloudBackup: boolean, from = new Date()) {
  return cloudBackup ? null : new Date(from.getTime() + RETENTION_DAYS * 86_400_000);
}

/** Delete relay copies whose window has passed. Originals stay on people's devices. */
export async function purgeExpired(now = new Date()) {
  const due = await db.video.findMany({
    where: { purgeAt: { lte: now }, status: { notIn: ["EXPIRED", "RECORDING"] } },
    take: 500,
  });
  for (const v of due) {
    await storage().delete(v.storageKey);
    await db.video.update({ where: { id: v.id }, data: { status: "EXPIRED", playbackUrl: null, thumbnailUrl: null } });
  }
  return due.length;
}

/**
 * Uploads that never finished (a recording abandoned for good) are aborted
 * after a week so their parts stop costing storage. Recovery after a crash
 * normally happens within minutes, the next time the app is opened.
 */
export async function abortStaleUploads(now = new Date()) {
  const stale = await db.video.findMany({
    where: { status: "RECORDING", updatedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
    take: 200,
  });
  for (const v of stale) {
    await storage().abort(v.storageKey, v.uploadId).catch(() => {});
    await db.uploadPart.deleteMany({ where: { videoId: v.id } });
    await db.video.update({ where: { id: v.id }, data: { status: "EXPIRED", uploadTokenHash: null } });
  }
  return stale.length;
}

/** Turning cloud backup on keeps everything; turning it off starts the clock again. */
export async function applyBackupSetting(workspaceId: string, cloudBackup: boolean) {
  await db.video.updateMany({
    where: { workspaceId, status: { not: "EXPIRED" } },
    // A new date means a new 24-hour warning when it comes round.
    data: { purgeAt: purgeDate(cloudBackup), expiryWarnedAt: null },
  });
}
