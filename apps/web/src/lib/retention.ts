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

/** Turning cloud backup on keeps everything; turning it off starts the clock again. */
export async function applyBackupSetting(workspaceId: string, cloudBackup: boolean) {
  await db.video.updateMany({
    where: { workspaceId, status: { not: "EXPIRED" } },
    data: { purgeAt: purgeDate(cloudBackup) },
  });
}
