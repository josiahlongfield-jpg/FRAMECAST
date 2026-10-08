import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";

const Scope = z.enum(["ALL", "SELECTED", "MINE", "OFF"]);
const Body = z.object({
  replyNotify: Scope.optional(),
  replyNotifyStaff: z.array(z.string().min(1).max(40)).max(200).optional(),
  sentNotify: Scope.optional(),
  sentNotifyStaff: z.array(z.string().min(1).max(40)).max(200).optional(),
});

/** An owner's or admin's own team email preferences. */
export const PATCH = handle(async (req: Request) => {
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid preferences");
  const team = new Set((await db.membership.findMany({ where: { workspaceId: me.workspace.id }, select: { userId: true } })).map((m) => m.userId));
  const onlyTeam = (ids?: string[]) => (ids ? [...new Set(ids)].filter((id) => team.has(id)) : undefined);
  const m = await db.membership.update({
    where: { userId_workspaceId: { userId: me.user.id, workspaceId: me.workspace.id } },
    data: { ...body.data, replyNotifyStaff: onlyTeam(body.data.replyNotifyStaff), sentNotifyStaff: onlyTeam(body.data.sentNotifyStaff) },
  });
  return Response.json({ replyNotify: m.replyNotify, replyNotifyStaff: m.replyNotifyStaff, sentNotify: m.sentNotify, sentNotifyStaff: m.sentNotifyStaff });
});
