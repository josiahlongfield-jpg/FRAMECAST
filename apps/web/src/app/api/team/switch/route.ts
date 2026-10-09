import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, handle, HttpError } from "@/lib/session";

const Body = z.object({ workspaceId: z.string().min(1).max(40) });

/** Switch between workspaces for people on more than one team. */
// Works while paused on the current team, so paused staff can move to another one.
export const POST = handle(async (req: Request) => {
  const me = await currentUser();
  if (!me) throw new HttpError(401, "Sign in required");
  const { user } = me;
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid workspace");
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: body.data.workspaceId } } });
  if (!m) throw new HttpError(404, "Not on that team");
  await db.user.update({ where: { id: user.id }, data: { activeWorkspaceId: m.workspaceId } });
  return Response.json({ ok: true });
});
