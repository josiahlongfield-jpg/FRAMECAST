import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import Logo from "@/components/Logo";
import ManageBillingButton from "@/components/ManageBillingButton";
import { db } from "@/lib/db";
import { LEGAL } from "@/lib/legal";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account suspended", robots: { index: false } };

/**
 * Where members land while SureFrame support has suspended their workspace or
 * their login (lib/support/admin.ts). They can still ask for help, download
 * their data, move to another workspace they're on, manage the subscription
 * (owners) and sign out. Never shows support's internal reason.
 */
export default async function Suspended() {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!me.suspended) redirect("/library");
  const { user, workspace } = me;
  const loginSuspended = me.suspended === "user";
  // Another workspace they can use now (a suspended login can't use any).
  const others = loginSuspended
    ? []
    : user.memberships.filter((m) => m.workspaceId !== workspace.id && !m.pausedAt && !m.workspace.suspendedAt && !m.workspace.closedAt);

  async function switchTo(form: FormData) {
    "use server";
    const now = await currentUser();
    if (!now) redirect("/login");
    const id = String(form.get("workspaceId") ?? "");
    if (!now.user.suspendedAt && now.user.memberships.some((m) => m.workspaceId === id && !m.pausedAt && !m.workspace.suspendedAt && !m.workspace.closedAt)) {
      await db.user.update({ where: { id: now.user.id }, data: { activeWorkspaceId: id } });
    }
    redirect("/library");
  }

  const support = (
    <a href={`mailto:${LEGAL.email}`} className="font-medium text-brand-700 hover:underline">
      {LEGAL.email}
    </a>
  );

  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight text-slate-900">This account is suspended</h1>
      <p className="mt-3 text-slate-600" data-testid="suspended-message">
        {loginSuspended ? <>Your SureFrame login ({user.email}) has been suspended</> : <>{workspace.name} has been suspended</>}. Nothing has been deleted. Contact {support}.
      </p>
      {!loginSuspended && workspace.suspendedNote && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700" data-testid="suspended-note">
          {workspace.suspendedNote}
        </p>
      )}
      <p className="mt-3 text-sm text-slate-600">
        {loginSuspended ? "While it's suspended you can't use SureFrame with this login." : "While it's suspended, nobody on the team can use it and clients can't open their videos."}
        {!loginSuspended && !workspace.cloudBackup && " Recordings without cloud backup still follow the usual deletion schedule in our Terms."}
      </p>
      {others.length > 0 && (
        <div className="mt-6 grid gap-2">
          {others.map((m) => (
            <form key={m.workspaceId} action={switchTo}>
              <input type="hidden" name="workspaceId" value={m.workspaceId} />
              <button className="w-full rounded-xl border border-slate-300 px-4 py-3 text-left font-medium text-slate-800 hover:bg-slate-50">
                Go to {m.workspace.name}
              </button>
            </form>
          ))}
        </div>
      )}
      <ul className="mt-6 grid gap-2 text-sm">
        <li>
          <Link href="/help" className="font-medium text-brand-700 hover:underline">Get help</Link>
        </li>
        <li>
          <a href="/api/account/export" className="font-medium text-brand-700 hover:underline" data-testid="suspended-export">Download my data</a>
        </li>
      </ul>
      {me.role === "OWNER" && !user.closedAt && workspace.stripeCustomerId && (
        <div className="mt-6">
          <p className="mb-2 text-sm text-slate-600">You can still manage or cancel your subscription.</p>
          <ManageBillingButton />
        </div>
      )}
      <form
        className="mt-6"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700">Sign out</button>
      </form>
    </main>
  );
}
