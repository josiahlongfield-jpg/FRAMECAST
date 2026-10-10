import { db, type Workspace } from "@/lib/db";
import { storage } from "@/lib/storage";
import { stripe } from "@/lib/stripe";
import { isMissing } from "@/lib/subscription";
import { clientScopeWhere, permsOf, seesAllClients } from "@/lib/permissions";
import { enforceSeatLimits } from "@/lib/seatLimits";
import { brandOf } from "@/lib/branding";
import { appUrl } from "@/lib/stripe";
import { teamEmail } from "@/lib/teamEmail";
import { sendMail } from "@/lib/mail";
import { BRAND } from "@/lib/brand";
import { teamPath } from "@/lib/teamLink";

async function deleteVideoFiles(where: { workspaceId: string } | { ownerId: string; workspaceId: string }) {
  const videos = await db.video.findMany({ where, select: { storageKey: true, uploadId: true, status: true } });
  const driver = storage();
  // A few at a time, so a big account finishes well within the request.
  for (let i = 0; i < videos.length; i += 25) {
    await Promise.all(
      videos.slice(i, i + 25).map((v) =>
        v.status === "RECORDING" && v.uploadId
          ? driver.abort(v.storageKey, v.uploadId).catch(() => {})
          : v.status !== "EXPIRED"
            ? driver.delete(v.storageKey).catch(() => {})
            : null,
      ),
    );
  }
}

/**
 * Cancels a workspace's subscription before anything is deleted. If Stripe
 * can't be reached this throws, nothing is deleted, and they can try again:
 * a deleted account must never keep being charged.
 */
async function stopBilling(w: Workspace) {
  if (!process.env.STRIPE_SECRET_KEY) return;
  if (w.stripeSubscriptionId) {
    const sub = await stripe().subscriptions.retrieve(w.stripeSubscriptionId).catch((err) => (isMissing(err) ? null : Promise.reject(err)));
    if (sub && sub.status !== "canceled" && sub.status !== "incomplete_expired") await stripe().subscriptions.cancel(sub.id);
  }
  if (w.stripeCustomerId) {
    // Also removes saved cards. Billing has already stopped, so a failure here is only logged.
    await stripe().customers.del(w.stripeCustomerId).catch((err) => {
      if (!isMissing(err)) console.log("[account] stripe customer delete failed", JSON.stringify({ customer: w.stripeCustomerId, error: String(err?.message ?? err) }));
    });
  }
}

/**
 * Permanently delete a user. Workspaces they alone belong to go with them,
 * including clients, to-dos, videos and stored files, and any subscription
 * is cancelled. Recordings they made for a team (including teams they've
 * since left) stay with that team, under its owner.
 */
export async function deleteAccount(userId: string) {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { workspace: { include: { _count: { select: { members: true } } } } },
  });
  const own = memberships.filter((m) => m.workspace._count.members === 1).map((m) => m.workspace);
  const teams = memberships.filter((m) => m.workspace._count.members > 1).map((m) => m.workspace);
  for (const w of own) await stopBilling(w);

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const kept = await db.video.findMany({
    where: { ownerId: userId, workspaceId: { notIn: own.map((w) => w.id) } },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
  });
  for (const { workspaceId } of kept) {
    const owner = await db.membership.findFirst({ where: { workspaceId, role: "OWNER", userId: { not: userId } } });
    if (owner) await db.video.updateMany({ where: { workspaceId, ownerId: userId }, data: { ownerId: owner.userId } });
    else await deleteVideoFiles({ workspaceId, ownerId: userId });
  }
  const leaver = user?.name ?? user?.email ?? "A former team member";
  for (const w of teams) {
    // They leave holding the team's keys; ask an admin to reset them.
    await db.workspace.update({ where: { id: w.id }, data: { keyResetNeeded: leaver } });
    // Their replies stay the team's: without an author they'd count as the client's in the Team overview.
    const owner = await db.membership.findFirst({ where: { workspaceId: w.id, role: "OWNER", userId: { not: userId } } });
    if (owner) await db.reply.updateMany({ where: { authorUserId: userId, video: { workspaceId: w.id } }, data: { authorUserId: owner.userId } });
  }
  for (const w of own) {
    await deleteVideoFiles({ workspaceId: w.id });
    await db.workspace.delete({ where: { id: w.id } });
  }
  await db.user.delete({ where: { id: userId } });
  // An unused sign-in link would otherwise make a fresh account under the same email.
  if (user?.email) await db.verificationToken.deleteMany({ where: { identifier: user.email } });
  for (const w of teams) {
    // The login they freed can lift a colleague's pause.
    await enforceSeatLimits(w.id).catch((err) => console.error("[account] seat check after leaving", w.id, err));
    await tellManagersAboutLeaver(w, leaver).catch((err) => console.error("[account] leaver email", w.id, err));
  }
}

/** Owners and admins hear at once that someone left with the team's keys, not only when they next open Settings > Team. */
async function tellManagersAboutLeaver(w: Workspace, leaver: string) {
  const managers = await db.membership.findMany({ where: { workspaceId: w.id, role: { in: ["OWNER", "ADMIN"] }, pausedAt: null }, include: { user: { select: { email: true } } } });
  const brand = brandOf(w, appUrl(""));
  const mail = teamEmail({
    business: w.name,
    subject: `${leaver} deleted their account and left ${w.name}`,
    lead: `${leaver} deleted their ${BRAND.name} account, so they're no longer on your team.`,
    lines: [{ text: "Their recordings now belong to the owner. They held your team's encryption keys, so reset the keys on Settings > Team now. Every client gets a new personal link; those with an email are sent theirs automatically." }],
    button: { label: "Reset keys on Settings > Team", link: appUrl(teamPath("/settings/team", w.id)) },
    logoUrl: brand.logoUrl,
    color: brand.color,
  });
  for (const m of managers) await sendMail({ to: m.user.email, ...mail, fromName: w.name });
}

/**
 * Everything the server holds about a user, as JSON. To-dos, notes and
 * replies are end-to-end encrypted, so they are included as ciphertext;
 * videos are downloaded from each video's page.
 */
export async function exportAccount(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, createdAt: true, accounts: { select: { provider: true } } },
  });
  const memberships = await db.membership.findMany({ where: { userId } });
  const workspaces = await Promise.all(
    memberships.map(async (m) => {
      const w = await db.workspace.findUniqueOrThrow({ where: { id: m.workspaceId } });
      // A team that has paused them shares nothing more than its name.
      if (m.pausedAt) return { role: m.role, paused: true, workspace: { id: w.id, name: w.name } };
      // Staff export only what they can see in the app (lib/permissions.ts).
      const access = { userId, workspaceId: w.id, role: m.role, perms: permsOf(m) };
      const all = seesAllClients(access);
      const mineOnly = { OR: [{ ownerId: userId }, { client: { assignedToId: userId } }, { asReply: { video: { OR: [{ ownerId: userId }, { client: { assignedToId: userId } }] } } }] };
      const [clients, videos, items, notices] = await Promise.all([
        db.client.findMany({
          where: clientScopeWhere(access),
          select: { id: true, name: true, email: true, createdAt: true, removedAt: true, purgeAt: true, remindersOff: true },
        }),
        db.video.findMany({
          where: { workspaceId: w.id, ...(all ? {} : mineOnly) },
          select: {
            id: true, title: true, status: true, durationMs: true, sizeBytes: true, createdAt: true, clientId: true,
            encrypted: true, purgeAt: true, replyToId: true, viewCount: true,
            replies: { select: { kind: true, authorName: true, body: true, encrypted: true, timestampMs: true, createdAt: true } },
            insight: { select: { transcript: true, summary: true, createdAt: true } },
          },
        }),
        db.item.findMany({
          where: { workspaceId: w.id, ...(all ? {} : { OR: [{ clientId: null }, { client: { assignedToId: userId } }] }) },
          select: {
            kind: true, body: true, done: true, dueAt: true, shared: true, repeat: true, reminders: true,
            remindClient: true, remindTeam: true, authorName: true, createdAt: true, clientId: true,
          },
        }),
        // Staff reminders they sent or were sent on this team.
        db.staffNotice.findMany({
          where: { workspaceId: w.id, OR: [{ fromUserId: userId }, { toUserId: userId }] },
          select: { message: true, link: true, createdAt: true, dismissedAt: true, from: { select: { email: true } }, to: { select: { email: true } } },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return {
        role: m.role,
        // Your own settings on this team (staff): reminder defaults, client email message and reply-to, reply emails.
        mySettings: {
          reminderDefaults: m.myReminderDefaults, remindClientDefault: m.myRemindClientDefault, remindTeamDefault: m.myRemindTeamDefault,
          reminderMessage: m.myReminderMessage, reminderReplyTo: m.myReminderReplyTo, replyNotify: m.replyNotify,
        },
        workspace: {
          id: w.id, name: w.name, plan: w.plan, subscriptionStatus: w.subscriptionStatus, extraClientSeats: w.extraClientSeats,
          cloudBackup: w.cloudBackup, aiAssist: w.aiAssist, timezone: w.timezone, reminderMessage: w.reminderMessage, reminderReplyTo: w.reminderReplyTo,
          videosRecorded: w.videosRecorded, createdAt: w.createdAt,
        },
        clients,
        videos: videos.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })),
        items,
        staffNotices: notices.map(({ from, to, ...n }) => ({ ...n, from: from.email, to: to.email })),
      };
    }),
  );
  const supportConversations = await db.supportTicket.findMany({
    where: { userId },
    select: { status: true, summary: true, createdAt: true, messages: { select: { author: true, body: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    exportedAt: new Date().toISOString(),
    note: "To-dos, notes, replies and AI transcripts and summaries are end-to-end encrypted and appear here as ciphertext. Download videos from each video's page.",
    user,
    workspaces,
    supportConversations,
  };
}
