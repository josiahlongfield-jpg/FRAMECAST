import type { Metadata } from "next";
import Logo from "@/components/Logo";
import JoinTeam from "@/components/JoinTeam";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/team";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

/**
 * Where an invite link lands. Doesn't call currentUser(): someone who only
 * came to join a team shouldn't get a personal workspace made for them.
 */
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [session, invite] = await Promise.all([
    auth(),
    db.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { workspace: true, invitedBy: true } }),
  ]);
  const userId = session?.user?.id;
  const problem = !invite || invite.revokedAt
    ? "This invite was cancelled or doesn't exist."
    : invite.acceptedAt && invite.acceptedById !== userId
      ? "This invite has already been used."
      : !invite.acceptedAt && invite.expiresAt < new Date()
        ? "This invite has expired."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo />
        {problem || !invite ? (
          <>
            <h1 className="mt-6 text-xl font-semibold text-slate-900">{problem}</h1>
            <p className="mt-2 text-sm text-slate-600">Ask whoever invited you to send a new link.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold text-slate-900">Join {invite.workspace.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {invite.invitedBy.name ?? invite.invitedBy.email} invited you to record and reply to clients on SureFrame
              {invite.role === "ADMIN" ? " as an admin" : ""}.
            </p>
            <JoinTeam token={token} signedIn={!!userId} />
          </>
        )}
      </div>
    </main>
  );
}
