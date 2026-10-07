import { db } from "@/lib/db";
import { handle, requireUser } from "@/lib/session";
import { staffUsage } from "@/lib/team";

/** The team: who's in it, invites still waiting, and staff seats. */
export const GET = handle(async () => {
  const { user, workspace, role } = await requireUser();
  const [members, invites, mine] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: workspace.id }, include: { user: true }, orderBy: { id: "asc" } }),
    role === "MEMBER"
      ? []
      : db.invite.findMany({ where: { workspaceId: workspace.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" } }),
    db.membership.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { id: "asc" } }),
  ]);
  return Response.json({
    role,
    seats: await staffUsage(workspace),
    members: members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, you: m.userId === user.id })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
    workspaces: mine.map((m) => ({ id: m.workspaceId, name: m.workspace.name, role: m.role, active: m.workspaceId === workspace.id })),
  });
});
