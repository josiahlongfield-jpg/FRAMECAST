import { db } from "@/lib/db";
import { appUrl } from "@/lib/stripe";
import { sendMail } from "@/lib/mail";
import { brandOf } from "@/lib/branding";
import { teamEmail } from "@/lib/teamEmail";
import { BRAND } from "@/lib/brand";

/** How far ahead of the scheduled deletion the recorder is emailed. */
export const WARN_BEFORE_MS = 24 * 3_600_000;

const utc = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
const day = (d: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(d);

/**
 * Email each recorder once, about 24 hours before our encrypted copy of their
 * recording is deleted (no cloud backup). Runs from both cron jobs: the
 * reminders job (every 5 minutes) sends it close to 24 hours ahead; if only the
 * daily purge job runs, it still goes out at least a day before the purge that
 * actually deletes the file (the purge runs once a day, after purgeAt).
 *
 * Emails never include titles (encrypted content stays in the app); they list
 * the recorded date, who it was sent to and a link. Best effort: a failed send
 * is retried on the next run.
 */
export async function warnExpiring(now = new Date()) {
  const due = await db.video.findMany({
    where: {
      purgeAt: { gt: now, lte: new Date(now.getTime() + WARN_BEFORE_MS) },
      expiryWarnedAt: null,
      replyToId: null,
      status: { notIn: ["EXPIRED", "RECORDING"] },
      workspace: { cloudBackup: false },
    },
    select: { id: true, ownerId: true, workspaceId: true, sourceId: true, createdAt: true, purgeAt: true, client: { select: { name: true } } },
    orderBy: { purgeAt: "asc" },
    take: 500,
  });
  const groups = new Map<string, typeof due>();
  for (const v of due) {
    const key = `${v.ownerId}:${v.workspaceId}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  let sent = 0;
  for (const videos of groups.values()) {
    const { ownerId, workspaceId } = videos[0];
    // Claim with a stamp of our own so a concurrent run can't send the same ones.
    const stamp = new Date(now.getTime() + Math.floor(Math.random() * 1000));
    await db.video.updateMany({ where: { id: { in: videos.map((v) => v.id) }, expiryWarnedAt: null }, data: { expiryWarnedAt: stamp } });
    const claimed = new Set((await db.video.findMany({ where: { id: { in: videos.map((v) => v.id) }, expiryWarnedAt: stamp }, select: { id: true } })).map((v) => v.id));
    const mine = videos.filter((v) => claimed.has(v.id));
    if (!mine.length) continue;

    const [ws, user, membership] = await Promise.all([
      db.workspace.findUnique({ where: { id: workspaceId } }),
      db.user.findUnique({ where: { id: ownerId }, select: { email: true } }),
      db.membership.findFirst({ where: { userId: ownerId, workspaceId } }),
    ]);
    if (!ws || !user || !membership) continue; // left the team since; nobody to tell

    // A recording sent to several clients is one recording: list it once.
    const recordings = new Map<string, { link: string; recorded: Date; purgeAt: Date; clients: string[] }>();
    for (const v of mine) {
      const rootId = v.sourceId ?? v.id;
      const r = recordings.get(rootId) ?? { link: appUrl(`/v/${rootId}?team=1`), recorded: v.createdAt, purgeAt: v.purgeAt!, clients: [] };
      if (v.client?.name && !r.clients.includes(v.client.name)) r.clients.push(v.client.name);
      if (v.purgeAt! < r.purgeAt) r.purgeAt = v.purgeAt!;
      if (v.createdAt < r.recorded) r.recorded = v.createdAt;
      recordings.set(rootId, r);
    }
    for (const r of recordings.values()) r.clients.sort((a, b) => a.localeCompare(b));
    const list = [...recordings.values()].sort((a, b) => a.purgeAt.getTime() - b.purgeAt.getTime());
    const n = list.length;
    const brand = brandOf(ws, appUrl(""));
    const backup =
      ws.plan === "FREE"
        ? ""
        : membership.role === "OWNER"
          ? `\n\nTo keep recordings on our servers from now on, turn on cloud backup in Settings > Billing: ${appUrl("/settings/billing")}`
          : `\n\nThe team owner can turn on cloud backup (Settings > Billing) to keep recordings on our servers.`;
    const mail = teamEmail({
      business: ws.name,
      subject: n === 1 ? `A recording is deleted from ${BRAND.name} in 24 hours` : `${n} recordings are deleted from ${BRAND.name} in 24 hours`,
      lead:
        n === 1
          ? `Our encrypted copy of a recording you made is scheduled to be deleted from our servers in about 24 hours.`
          : `Our encrypted copies of ${n} recordings you made are scheduled to be deleted from our servers in about 24 hours.`,
      lines: list.map((r) => ({
        text: `Recorded ${day(r.recorded)}${r.clients.length ? `, sent to ${r.clients.join(", ")}` : ""}. Deleted after ${utc(r.purgeAt)}`,
        link: r.link,
      })),
      note:
        `If you or your clients still need ${n === 1 ? "it" : "them"}, open ${n === 1 ? "the recording" : "each recording"} and choose Save to device before then. ` +
        `After that, ${n === 1 ? "it" : "they"} can no longer be watched from the link.` +
        backup,
      button: n === 1 ? { label: "Open the recording", link: list[0].link } : { label: "See recordings deleting soon", link: appUrl("/library?filter=soon") },
      footer: `Times are in UTC. Your library shows them in your own time zone.`,
      logoUrl: brand.logoUrl,
      color: brand.color,
    });
    try {
      await sendMail({ to: user.email, ...mail, fromName: ws.name });
      sent++;
    } catch (err) {
      // Release them so the next run tries again.
      await db.video.updateMany({ where: { id: { in: mine.map((v) => v.id) }, expiryWarnedAt: stamp }, data: { expiryWarnedAt: null } });
      console.error("expiry warning failed", err);
    }
  }
  return sent;
}
