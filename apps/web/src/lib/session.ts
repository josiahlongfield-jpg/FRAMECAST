import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Membership, Role } from "@prisma/client";
import { db } from "@/lib/db";

/** Shown to staff the plan no longer covers (lib/seatLimits.ts). */
export const STAFF_PAUSED = "Your access to this team is paused because its plan changed. Ask the owner to restore it.";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The signed-in user and their active workspace. A personal workspace is
 * created on first use so every user can record immediately.
 */
export async function currentUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { workspace: true }, orderBy: { id: "asc" } } },
  });
  if (!user) return null;
  // The workspace they last joined or switched to, else their first one they can still use.
  const membership =
    user.memberships.find((m) => m.workspaceId === user.activeWorkspaceId) ?? user.memberships.find((m) => !m.pausedAt) ?? user.memberships[0];
  if (membership) {
    const { workspace, ...m } = membership;
    // Staff over the plan's limits (lib/seatLimits.ts) can't use the team until restored.
    return { user, workspace, role: membership.role, membership: m as Membership, paused: !!membership.pausedAt };
  }
  const workspace = await db.workspace.create({
    data: {
      name: `${user.name ?? user.email.split("@")[0]}'s workspace`,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    include: { members: true },
  });
  const { members, ...ws } = workspace;
  return { user, workspace: ws, role: "OWNER" as Role, membership: members[0], paused: false };
}

/** Throws unless the signed-in member has one of the given roles. */
export function requireRole(me: { role: Role }, ...roles: Role[]) {
  if (!roles.includes(me.role)) throw new HttpError(403, me.role === "MEMBER" ? "Ask an admin of this workspace to do this" : "Only the workspace owner can do this");
}

export async function requireUser() {
  const me = await currentUser();
  if (!me) throw new HttpError(401, "Sign in required");
  if (me.paused) throw new HttpError(403, STAFF_PAUSED);
  return me;
}

export async function requirePageUser(next = "/library") {
  const me = await currentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (me.paused) redirect("/paused");
  return me;
}

/** Wrap a route handler so thrown HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      // A missing or malformed JSON body (req.json()) is the caller's mistake, not ours.
      if (err instanceof SyntaxError) return Response.json({ error: "Invalid request body" }, { status: 400 });
      console.error(err);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
