import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import AppHeader from "@/components/AppHeader";
import ShowRecoveryKey from "@/components/ShowRecoveryKey";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import MyEmailPrefs from "@/components/MyEmailPrefs";
import Link from "next/link";
import { signOut } from "@/auth";
import { deleteAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";

// Deleting an account deletes every recording file too.
export const maxDuration = 300;

export const metadata: Metadata = { title: "Account" };

export default async function AccountSettings({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const { user, workspace, role, membership, paused } = await requirePageUser("/settings/account", { allowPaused: true });
  const onTeam = role === "MEMBER" || (await db.membership.count({ where: { workspaceId: workspace.id } })) > 1;
  // What deleting the account does depends on whether they run a workspace of their own or work on someone else's team.
  const mine = await db.membership.findMany({ where: { userId: user.id }, include: { workspace: { select: { name: true, _count: { select: { members: true } } } } } });
  const ownsAlone = mine.some((m) => m.role === "OWNER" && m.workspace._count.members === 1);
  const teamNames = mine.filter((m) => m.role !== "OWNER" && m.workspace._count.members > 1).map((m) => m.workspace.name);

  async function rename(form: FormData) {
    "use server";
    const { user } = await requirePageUser("/settings/account", { allowPaused: true });
    const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) redirect("/settings/account?error=name#name");
    await db.user.update({ where: { id: user.id }, data: { name } });
    revalidatePath("/", "layout");
    redirect("/settings/account?saved=name#name");
  }

  async function remove(form: FormData) {
    "use server";
    const { user } = await requirePageUser("/settings/account", { allowPaused: true });
    const typed = String(form.get("confirm") ?? "").trim().toLowerCase();
    if (typed !== user.email.toLowerCase()) redirect("/settings/account?error=confirm");
    // An owner leaving would strand their staff in a workspace nobody pays for.
    const owned = await db.membership.findMany({ where: { userId: user.id, role: "OWNER" }, include: { workspace: { include: { _count: { select: { members: true } } } } } });
    if (owned.some((m) => m.workspace._count.members > 1)) redirect("/settings/account?error=team");
    try {
      await deleteAccount(user.id);
    } catch (err) {
      console.log("[account] delete failed", JSON.stringify({ user: user.id, error: String(err) }));
      redirect("/settings/account?error=failed");
    }
    await signOut({ redirectTo: "/login?deleted=1" });
  }

  return (
    <>
      {paused ? (
        <p className="mx-auto max-w-3xl px-4 pt-6 text-sm sm:px-6">
          <Link href="/paused" className="font-medium text-brand-700 hover:underline">&larr; Back</Link>
        </p>
      ) : (
        <AppHeader email={user.email} plan={PLANS[workspace.plan].name} />
      )}
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}</p>

        <section id="name" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Your name</h2>
          <p className="mt-1 text-sm text-slate-600">
            Clients see it on the videos you send, as &ldquo;{user.name || "Your name"} from {workspace.name}&rdquo;. Your team sees it too.
          </p>
          <form action={rename} className="mt-4 flex flex-wrap gap-2">
            <input name="name" defaultValue={user.name ?? ""} required maxLength={80} autoComplete="name" aria-label="Your name" placeholder="e.g. Sam Lee"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Save name</button>
          </form>
          {saved === "name" && <p role="status" className="mt-2 text-sm text-emerald-700">Saved.</p>}
          {error === "name" && <p className="mt-2 text-sm text-red-700">Enter your name.</p>}
        </section>

        {onTeam && !paused && <section id="emails" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Emails to you</h2>
          {role === "MEMBER" ? (
            <MyEmailPrefs initial={{ replyEmails: membership?.replyNotify !== "OFF" }} />
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Choose which client replies and staff activity you&apos;re emailed about on the{" "}
              <Link href="/team" className="font-medium text-brand-700 hover:underline">Team overview</Link>.
            </p>
          )}
        </section>}

        {!paused && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Recovery key</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use this to unlock your videos on a phone or another computer. Keep it private: anyone signed in to your account with it can open your videos.
          </p>
          <ShowRecoveryKey workspaceId={workspace.id} fingerprint={workspace.keyFingerprint} />
        </section>}

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
          <p className="mt-1 text-sm text-slate-600" data-testid="delete-explainer">
            This permanently deletes your account. This can&apos;t be undone.
            {ownsAlone && (
              <> Your workspace goes with it: its recordings, clients, to-dos and notes. Any subscription is cancelled straight away, and your clients&apos; links stop working.</>
            )}
            {teamNames.length > 0 && (
              <> Recordings you made for {teamNames.join(" and ")} stay with {teamNames.length === 1 ? "that team" : "those teams"}, and {teamNames.length === 1 ? "its" : "their"} clients aren&apos;t affected.</>
            )}
          </p>
          <form action={remove} className="mt-4 space-y-3">
            <label className="block text-sm text-slate-700">
              Type <span className="font-semibold">{user.email}</span> to confirm
              <input name="confirm" type="email" autoComplete="off" required className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            {error === "confirm" && <p role="alert" className="text-sm text-red-700">That doesn&apos;t match your email.</p>}
            {error === "failed" && <p role="alert" className="text-sm text-red-700">Your account couldn&apos;t be deleted just now (we must cancel any subscription first). Please try again in a few minutes, or ask in Help.</p>}
            {error === "team" && <p role="alert" className="text-sm text-red-700">You own a team with other staff. Remove them on the Team page first.</p>}
            <DeleteAccountButton />
          </form>
        </section>
      </main>
    </>
  );
}
