import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

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
    include: { memberships: { include: { workspace: true }, orderBy: { id: "asc" }, take: 1 } },
  });
  if (!user) return null;
  let workspace = user.memberships[0]?.workspace;
  if (!workspace) {
    workspace = await db.workspace.create({
      data: {
        name: `${user.name ?? user.email.split("@")[0]}'s workspace`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
  }
  return { user, workspace };
}

export async function requireUser() {
  const me = await currentUser();
  if (!me) throw new HttpError(401, "Sign in required");
  return me;
}

export async function requirePageUser(next = "/library") {
  const me = await currentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  return me;
}

/** Wrap a route handler so thrown HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      console.error(err);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
