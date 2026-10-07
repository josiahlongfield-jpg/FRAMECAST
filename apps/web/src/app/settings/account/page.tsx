import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ShowRecoveryKey from "@/components/ShowRecoveryKey";
import { signOut } from "@/auth";
import { deleteAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountSettings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { user, workspace } = await requirePageUser("/settings/account");

  async function remove(form: FormData) {
    "use server";
    const { user } = await requirePageUser("/settings/account");
    const typed = String(form.get("confirm") ?? "").trim().toLowerCase();
    if (typed !== user.email.toLowerCase()) redirect("/settings/account?error=confirm");
    // An owner leaving would strand their staff in a workspace nobody pays for.
    const owned = await db.membership.findMany({ where: { userId: user.id, role: "OWNER" }, include: { workspace: { include: { _count: { select: { members: true } } } } } });
    if (owned.some((m) => m.workspace._count.members > 1)) redirect("/settings/account?error=team");
    await deleteAccount(user.id);
    await signOut({ redirectTo: "/?deleted=1" });
  }

  return (
    <>
      <AppHeader email={user.email} plan={PLANS[workspace.plan].name} />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}</p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Recovery key</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use this to unlock your videos on a phone or another computer. Keep it private: anyone signed in to your account with it can open your videos.
          </p>
          <ShowRecoveryKey workspaceId={workspace.id} fingerprint={workspace.keyFingerprint} />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Download your data</h2>
          <p className="mt-1 text-sm text-slate-600">
            A file with your account, clients, videos list, to-dos and notes. Encrypted content stays encrypted in the file.
            Download videos themselves from each video&apos;s page.
          </p>
          <a href="/api/account/export" className="mt-4 inline-block rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Download my data
          </a>
        </section>

        <section className="mt-6 rounded-2xl border border-red-200 bg-white p-6">
          <h2 className="font-semibold text-red-700">Delete account</h2>
          <p className="mt-1 text-sm text-slate-600">
            This permanently deletes your account, your recordings, your clients and their to-dos and notes, and cancels your
            subscription straight away. Your clients&apos; links stop working. This can&apos;t be undone.
          </p>
          <form action={remove} className="mt-4 space-y-3">
            <label className="block text-sm text-slate-700">
              Type <span className="font-semibold">{user.email}</span> to confirm
              <input name="confirm" type="email" autoComplete="off" required className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            {error === "confirm" && <p className="text-sm text-red-700">That doesn&apos;t match your email.</p>}
            {error === "team" && <p className="text-sm text-red-700">You own a team with other staff. Remove them on the Team page first.</p>}
            <button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete my account</button>
          </form>
        </section>
      </main>
    </>
  );
}
