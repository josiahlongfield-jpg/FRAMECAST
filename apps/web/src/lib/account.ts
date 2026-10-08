import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { stripe } from "@/lib/stripe";
import { clientScopeWhere, permsOf, seesAllClients } from "@/lib/permissions";

async function deleteVideoFiles(where: { workspaceId: string } | { ownerId: string }) {
  const videos = await db.video.findMany({ where, select: { storageKey: true, uploadId: true, status: true } });
  const driver = storage();
  for (const v of videos) {
    if (v.status === "RECORDING" && v.uploadId) await driver.abort(v.storageKey, v.uploadId).catch(() => {});
    else if (v.status !== "EXPIRED") await driver.delete(v.storageKey).catch(() => {});
  }
}

/**
 * Permanently delete a user. Workspaces they alone belong to go with them,
 * including clients, to-dos, videos and stored files, and any subscription
 * is cancelled. In shared workspaces only their own recordings are removed.
 */
export async function deleteAccount(userId: string) {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { workspace: { include: { _count: { select: { members: true } } } } },
  });
  for (const m of memberships) {
    const w = m.workspace;
    if (w._count.members > 1) {
      await deleteVideoFiles({ ownerId: userId });
      // They leave holding the team's keys; ask an admin to reset them.
      const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
      await db.workspace.update({ where: { id: w.id }, data: { keyResetNeeded: user?.name ?? user?.email ?? "A former team member" } });
      continue;
    }
    if (w.stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
      // Deleting the customer cancels its subscriptions immediately and removes saved cards.
      // Best effort: a Stripe hiccup mustn't leave someone unable to delete their account.
      await stripe().customers.del(w.stripeCustomerId).catch((err) => {
        if (err?.code !== "resource_missing") console.log("[account] stripe customer delete failed", JSON.stringify({ customer: w.stripeCustomerId, error: String(err?.message ?? err) }));
      });
    }
    await deleteVideoFiles({ workspaceId: w.id });
    await db.workspace.delete({ where: { id: w.id } });
  }
  await db.user.delete({ where: { id: userId } });
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
      // Staff export only what they can see in the app (lib/permissions.ts).
      const access = { userId, workspaceId: w.id, role: m.role, perms: permsOf(m) };
      const all = seesAllClients(access);
      const mineOnly = { OR: [{ ownerId: userId }, { client: { assignedToId: userId } }, { asReply: { video: { OR: [{ ownerId: userId }, { client: { assignedToId: userId } }] } } }] };
      const [clients, videos, items] = await Promise.all([
        db.client.findMany({
          where: clientScopeWhere(access),
          select: { id: true, name: true, email: true, createdAt: true, removedAt: true, remindersOff: true },
        }),
        db.video.findMany({
          where: { workspaceId: w.id, ...(all ? {} : mineOnly) },
          select: {
            id: true, title: true, status: true, durationMs: true, sizeBytes: true, createdAt: true, clientId: true,
            encrypted: true, purgeAt: true, replyToId: true, viewCount: true,
            replies: { select: { kind: true, authorName: true, body: true, encrypted: true, timestampMs: true, createdAt: true } },
          },
        }),
        db.item.findMany({
          where: { workspaceId: w.id, ...(all ? {} : { OR: [{ clientId: null }, { client: { assignedToId: userId } }] }) },
          select: {
            kind: true, body: true, done: true, dueAt: true, shared: true, repeat: true, reminders: true,
            remindClient: true, remindTeam: true, authorName: true, createdAt: true, clientId: true,
          },
        }),
      ]);
      return {
        role: m.role,
        workspace: {
          id: w.id, name: w.name, plan: w.plan, subscriptionStatus: w.subscriptionStatus, extraClientSeats: w.extraClientSeats,
          cloudBackup: w.cloudBackup, timezone: w.timezone, reminderMessage: w.reminderMessage, reminderReplyTo: w.reminderReplyTo,
          createdAt: w.createdAt,
        },
        clients,
        videos: videos.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })),
        items,
      };
    }),
  );
  return {
    exportedAt: new Date().toISOString(),
    note: "To-dos, notes and replies are end-to-end encrypted and appear here as ciphertext. Download videos from each video's page.",
    user,
    workspaces,
  };
}
