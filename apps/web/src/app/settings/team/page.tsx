import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import TeamManager from "@/components/TeamManager";
import { db } from "@/lib/db";
import { EXTRA_STAFF_PRICE, PLANS, TEAM_PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";
import { staffUsage } from "@/lib/team";
import { permsOf } from "@/lib/permissions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamSettings() {
  const { user, workspace, role } = await requirePageUser("/settings/team");
  const plan = PLANS[workspace.plan];
  const [members, invites, mine, seats] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: workspace.id }, include: { user: true }, orderBy: { id: "asc" } }),
    role === "MEMBER"
      ? []
      : db.invite.findMany({ where: { workspaceId: workspace.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" } }),
    db.membership.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { id: "asc" } }),
    staffUsage(workspace),
  ]);
  const isTeamPlan = TEAM_PLANS.includes(workspace.plan);

  return (
    <>
      <AppHeader email={user.email} plan={plan.name} />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          {role === "MEMBER"
            ? "You see the clients assigned to you and the videos you record. The owner or an admin chooses what else you can do."
            : "You choose who looks after each client. Members see only the clients assigned to them, unless you let them see all clients. Clients see the name of the person who sent their video, never their email."}
        </p>
        {!isTeamPlan && role === "OWNER" && (
          <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-5 text-sm text-brand-900">
            <p className="font-medium">Working with others?</p>
            <p className="mt-1">
              Studio includes 3 staff logins and Agency includes 10, with more at ${EXTRA_STAFF_PRICE}/month each. Everyone records, replies and keeps track of their own clients.
            </p>
            <Link href="/pricing" className="mt-3 inline-block font-medium underline">See plans</Link>
          </div>
        )}
        <TeamManager
          workspaceId={workspace.id}
          fingerprint={workspace.keyFingerprint}
          role={role}
          meId={user.id}
          initialSeats={seats}
          includedStaff={plan.staffSeats}
          extraStaff={workspace.extraStaffSeats}
          canBuyStaff={isTeamPlan && role === "OWNER" && !!workspace.stripeSubscriptionId}
          staffPrice={EXTRA_STAFF_PRICE}
          initialMembers={members.map((m) => ({ userId: m.userId, name: m.user.name ?? m.user.email.split("@")[0], email: m.user.email, role: m.role, perms: permsOf(m) }))}
          initialInvites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
          keyResetNeeded={role === "MEMBER" ? null : workspace.keyResetNeeded}
          workspaces={mine.map((m) => ({ id: m.workspaceId, name: m.workspace.name, active: m.workspaceId === workspace.id }))}
        />
      </main>
    </>
  );
}
