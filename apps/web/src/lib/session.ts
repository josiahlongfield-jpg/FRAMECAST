import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Membership, Role, User } from "@prisma/client";
import { db, type Workspace } from "@/lib/db";

/** Shown to staff the plan no longer covers (lib/seatLimits.ts). */
export const STAFF_PAUSED = "Your access to this team is paused because its plan changed. Ask the owner to restore it.";
/**
 * Refused while SureFrame support has suspended the workspace or this login
 * (lib/support/admin.ts). A 403, so unfinished uploads stay on the device and
 * carry on once it's lifted.
 */
export const ACCOUNT_SUSPENDED = "This account is suspended. Nothing has been deleted. Contact support@sureframe.app.";
/** A login whose account support closed (lib/support/admin.ts closeAccount). Unlike a self-closed account, it can't be kept. */
export const ACCOUNT_CLOSED_BY_SUPPORT = "SureFrame support closed this account. Contact support@sureframe.app.";

/** Suspended by support: this login everywhere ("user"), or the workspace it's working in. Closed counts as suspended. */
export const suspensionOf = (user: Pick<User, "suspendedAt">, workspace: Pick<Workspace, "suspendedAt" | "closedAt">) =>
  user.suspendedAt ? ("user" as const) : workspace.suspendedAt || workspace.closedAt ? ("workspace" as const) : null;

export class HttpError extends Error {
  /** `code` goes in the JSON too, for callers that act on the kind of error (e.g. ACCOUNT_SUSPENDED). */
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/**
 * The signed-in user and their active workspace. A personal workspace is
 * created on first use so every user can record immediately. Cached for the
 * request, so a page and its metadata don't each look it up (or create one).
 * A closed account waiting to be deleted counts as signed out, on every
 * device (see pendingDeletion). A suspended login or workspace still gets
 * here, flagged `suspended`, so the suspended page, help chat and data
 * download work; requireUser and requirePageUser keep it out of everything else.
 */
export const currentUser = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { workspace: true }, orderBy: { id: "asc" } } },
  });
  if (!user || user.deleteAt) return null;
  // The workspace they last joined or switched to, else their first one they can still use.
  const membership =
    user.memberships.find((m) => m.workspaceId === user.activeWorkspaceId) ??
    user.memberships.find((m) => !m.pausedAt && !m.workspace.suspendedAt && !m.workspace.closedAt) ??
    user.memberships.find((m) => !m.workspace.suspendedAt && !m.workspace.closedAt) ??
    user.memberships[0];
  if (membership) {
    const { workspace, ...m } = membership;
    // Staff over the plan's limits (lib/seatLimits.ts) can't use the team until restored.
    return { user, workspace, role: membership.role, membership: m as Membership, paused: !!membership.pausedAt, suspended: suspensionOf(user, workspace) };
  }
  // One at a time per user, so two tabs opening at once can't make two personal workspaces.
  const made = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"personal:" + user.id}))`;
    const existing = await tx.membership.findFirst({ where: { userId: user.id }, include: { workspace: true }, orderBy: { id: "asc" } });
    if (existing) return existing;
    const workspace = await tx.workspace.create({
      data: {
        name: `${user.name ?? user.email.split("@")[0]}'s workspace`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
      include: { members: true },
    });
    const { members, ...ws } = workspace;
    return { ...members[0], workspace: ws };
  });
  const { workspace, ...m } = made;
  return { user, workspace, role: m.role, membership: m as Membership, paused: !!m.pausedAt, suspended: suspensionOf(user, workspace) };
});

/** Throws unless the signed-in member has one of the given roles. */
export function requireRole(me: { role: Role }, ...roles: Role[]) {
  if (!roles.includes(me.role)) throw new HttpError(403, me.role === "MEMBER" ? "Ask an admin of this workspace to do this" : "Only the workspace owner can do this");
}

/**
 * The signed-in member, or a 401/403. `allowSuspendedWorkspace` lets the owner
 * of a suspended workspace reach what the suspended page offers (managing the
 * subscription); a suspended login never gets through.
 */
export async function requireUser({ allowSuspendedWorkspace = false } = {}) {
  const me = await currentUser();
  if (!me) throw new HttpError(401, "Sign in required");
  if (me.suspended && !(allowSuspendedWorkspace && me.suspended === "workspace")) throw new HttpError(403, ACCOUNT_SUSPENDED, "ACCOUNT_SUSPENDED");
  if (me.paused) throw new HttpError(403, STAFF_PAUSED);
  return me;
}

/**
 * The signed-in browser's account when it is closed and waiting to be deleted
 * (lib/accountDeletion.ts). Only a sign-in made after it was closed ("fresh")
 * may keep it, so a browser left signed in elsewhere can't.
 */
export const pendingDeletion = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, deleteAt: true, deletionRequestedAt: true, suspendedAt: true, closedAt: true },
  });
  if (!user?.deleteAt) return null;
  const fresh = !!user.deletionRequestedAt && (session.signedInAt ?? 0) > user.deletionRequestedAt.getTime();
  // Closed by SureFrame support (closedAt), or suspended since: only support can change that (lib/support/admin.ts).
  return { ...user, deleteAt: user.deleteAt, fresh };
});

export async function requirePageUser(next = "/library", { allowPaused = false, allowSuspended = false } = {}) {
  const me = await currentUser();
  if (!me) {
    // A closed account just signed in again: offer to keep it.
    if ((await pendingDeletion())?.fresh) redirect("/account/restore");
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  // Suspended by support (lib/support/admin.ts): only the suspended page, help and the support console.
  if (me.suspended && !allowSuspended) redirect("/suspended");
  // Paused staff can still reach their own account (to download their data or delete it).
  if (me.paused && !allowPaused) redirect("/paused");
  return me;
}

/** Wrap a route handler so thrown HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, { status: err.status });
      // A missing or malformed JSON body (req.json()) is the caller's mistake, not ours.
      if (err instanceof SyntaxError) return Response.json({ error: "Invalid request body" }, { status: 400 });
      // One line with the route, so it can be found and alerted on in the logs.
      const req = args[0] instanceof Request ? args[0] : null;
      const e = err as { name?: string; message?: string; stack?: string };
      console.error(JSON.stringify({ level: "error", route: req ? new URL(req.url).pathname : null, method: req?.method ?? null, name: e?.name, message: String(e?.message ?? err).slice(0, 1000), stack: e?.stack?.slice(0, 3000) }));
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

/**
 * Team email links carry ?ws=<workspace id>. Someone on more than one team
 * opens the team the email was about, not whichever one they had open last.
 */
export async function followTeamLink(ws: string | undefined, path: string) {
  if (!ws) return;
  const me = await currentUser();
  if (!me || me.workspace.id === ws) return;
  if (!me.user.memberships.some((m) => m.workspaceId === ws && !m.pausedAt)) return;
  await db.user.update({ where: { id: me.user.id }, data: { activeWorkspaceId: ws } });
  redirect(path);
}
