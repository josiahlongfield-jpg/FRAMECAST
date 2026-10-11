import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import Logo from "@/components/Logo";
import { restoreAccount } from "@/lib/accountDeletion";
import { zoned } from "@/lib/dates";
import { db } from "@/lib/db";
import { LEGAL } from "@/lib/legal";
import { PLANS } from "@/lib/plans";
import { currentUser, HttpError, pendingDeletion } from "@/lib/session";

export const metadata: Metadata = { title: "Keep your account", robots: { index: false } };

/**
 * Where a closed account lands after signing in again (lib/accountDeletion.ts):
 * keep it, or carry on with the deletion. Only a sign-in made after the account
 * was closed can keep it, so a browser left signed in somewhere else can't.
 */
export default async function Restore() {
  const closed = await pendingDeletion();
  if (!closed) redirect((await currentUser()) ? "/library" : "/login?next=/account/restore");

  async function keep() {
    "use server";
    const me = await pendingDeletion();
    if (!me) redirect("/library");
    if (!me.fresh) redirect("/account/restore");
    let planEnded = false;
    try {
      ({ planEnded } = await restoreAccount(me.id));
    } catch (err) {
      // Its date passed while the page was open, or support closed or suspended it meanwhile.
      if (err instanceof HttpError && (err.status === 410 || err.status === 403)) redirect("/account/restore");
      throw err;
    }
    redirect(planEnded ? "/library?restored=ended" : "/library?restored=1");
  }

  async function leaveClosed() {
    "use server";
    await signOut({ redirectTo: "/login?closed=1" });
  }

  const now = new Date();
  const [ws, leftTeams] = await Promise.all([
    db.workspace.findFirst({ where: { deleteAt: { not: null }, members: { some: { userId: closed.id } } } }),
    // Teams they were staff on: closing the account took them off.
    db.invite.findMany({ where: { acceptedById: closed.id, workspace: { members: { none: { userId: closed.id } } } }, select: { workspace: { select: { name: true } } }, distinct: ["workspaceId"] }),
  ]);
  const dates = zoned(ws?.timezone);
  const teams = [...new Set(leftTeams.map((i) => i.workspace.name))];
  const signOutButton = (label: string, primary = false) => (
    <form action={leaveClosed}>
      <button className={primary ? "rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700" : "rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50"}>
        {label}
      </button>
    </form>
  );

  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Logo />
      {closed.closedAt || closed.suspendedAt ? (
        <>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight text-slate-900">{closed.closedAt ? "Your account has been closed" : "This account is suspended"}</h1>
          <p className="mt-3 text-slate-600" data-testid="restore-by-support">
            {closed.closedAt ? (
              <>SureFrame support closed this account on {dates.longDay(closed.closedAt)}, and it will be deleted for good on {dates.longDay(closed.deleteAt)}, unless the law requires us to keep it longer. It can&apos;t be kept from here.</>
            ) : (
              <>Your SureFrame login has been suspended, so this account can&apos;t be kept from here. It is scheduled for deletion on {dates.longDay(closed.deleteAt)}.</>
            )}{" "}
            If you think this is a mistake, email{" "}
            <a href={`mailto:${LEGAL.email}`} className="font-medium text-brand-700 hover:underline">{LEGAL.email}</a>
            {closed.closedAt ? ` within ${LEGAL.reviewDays} days of the closure to ask for a review.` : "."}
          </p>
          <div className="mt-6">{signOutButton("Sign out")}</div>
        </>
      ) : !closed.fresh ? (
        <>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight text-slate-900">Sign in again to keep your account</h1>
          <p className="mt-3 text-slate-600">
            Your account is closed and scheduled for deletion. To keep it, sign in again on this device first.
          </p>
          <Link href="/login?next=/account/restore" className="mt-6 inline-block rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700">
            Sign in
          </Link>
        </>
      ) : closed.deleteAt <= now ? (
        <>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight text-slate-900">Your account is being deleted</h1>
          <p className="mt-3 text-slate-600" data-testid="restore-too-late">
            It reached its deletion date, so it can no longer be kept. If you think this is a mistake, email{" "}
            <a href={`mailto:${LEGAL.email}`} className="font-medium text-brand-700 hover:underline">{LEGAL.email}</a> straight away.
          </p>
          <div className="mt-6">{signOutButton("Sign out")}</div>
        </>
      ) : (
        <>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight text-slate-900">Your account is scheduled for deletion on {dates.longDay(closed.deleteAt)}</h1>
          <p className="mt-3 text-slate-600" data-testid="restore-message">
            You closed it{closed.deletionRequestedAt ? ` on ${dates.longDay(closed.deletionRequestedAt)}` : ""}.
            {ws ? <> Keep it and {ws.name} carries on as it was, with its recordings, clients, to-dos and notes.</> : <> Keep it and you can carry on using it.</>}
          </p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {ws && <li>Your clients&apos; links work again, for the clients your plan covers.</li>}
            {ws?.renewalStoppedAt &&
              (ws.stripeSubscriptionId ? (
                <li>Your {PLANS[ws.plan].name} plan renews as normal again.</li>
              ) : (
                <li>Your subscription has ended. Choose a plan in Settings &gt; Billing to get your paid features back; until then, clients your plan doesn&apos;t cover stay paused.</li>
              ))}
            {ws && !ws.cloudBackup && <li>Recordings that expired from our servers while it was closed can&apos;t be brought back.</li>}
            {teams.length > 0 && (
              <li>Keeping it won&apos;t put you back on {teams.join(" and ")}; ask {teams.length === 1 ? "them" : "each team"} for a new invite.</li>
            )}
          </ul>
          <p className="mt-4 text-sm text-slate-600">Continue signs you out and leaves your account closed. It&apos;s deleted for good on {dates.longDay(closed.deleteAt)}.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <form action={keep}>
              <button className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700">Keep my account</button>
            </form>
            {signOutButton("Continue")}
          </div>
        </>
      )}
    </main>
  );
}
