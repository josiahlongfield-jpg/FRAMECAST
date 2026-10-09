import crypto from "node:crypto";
import { db } from "@/lib/db";
import { staffSeatLimit } from "@/lib/plans";

/** Invite links work for a week. */
export const INVITE_DAYS = 7;

export const newInviteToken = () => crypto.randomBytes(24).toString("base64url");
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Staff seats in use: people on the team plus invites still waiting to be accepted. */
export async function staffUsage(
  workspace: { id: string; plan: Parameters<typeof staffSeatLimit>[0]["plan"]; extraStaffSeats: number },
  client: Pick<typeof db, "membership" | "invite"> = db,
) {
  const [members, pending] = await Promise.all([
    client.membership.count({ where: { workspaceId: workspace.id } }),
    client.invite.count({ where: { workspaceId: workspace.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  return { members, pending, used: members + pending, limit: staffSeatLimit(workspace) };
}
