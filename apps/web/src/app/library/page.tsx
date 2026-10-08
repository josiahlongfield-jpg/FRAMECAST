import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import MemberPlanner from "@/components/MemberPlanner";
import StorageStatus from "@/components/StorageStatus";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";
import { workspaceReminderDefaults } from "@/lib/reminders";
import { accessOf, isManager, libraryWhere, seesAllClients } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Library" };

const fmt = (ms: number | null) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default async function Library({ searchParams }: { searchParams: Promise<{ show?: string; filter?: string }> }) {
  const me = await requirePageUser("/library");
  const { user, workspace } = me;
  const access = accessOf(me);
  const plan = PLANS[workspace.plan];
  // Staff who only see their own clients have nothing else to switch to.
  const team = seesAllClients(access) && (await db.membership.count({ where: { workspaceId: workspace.id } })) > 1;
  // On a team, "Mine" is what I recorded plus anything for the clients I look after.
  // Staff start on "Mine"; owners and admins on everything.
  const { show, filter } = await searchParams;
  const mine = team && (show === "mine" || (!isManager(access) && show !== "all"));
  const scope: Prisma.VideoWhereInput = { ...libraryWhere(access), ...(mine ? { OR: [{ ownerId: user.id }, { client: { assignedToId: user.id } }, { copies: { some: { client: { assignedToId: user.id } } } }] } : {}) };
  // "Deleting soon": server copies deleted within a week (no cloud backup), soonest first.
  const soonWhere: Prisma.VideoWhereInput = { ...scope, AND: [{ purgeAt: { not: null, lte: new Date(Date.now() + 7 * 86_400_000) } }, { status: { notIn: ["EXPIRED", "RECORDING"] } }] };
  const soon = filter === "soon";
  const [videos, soonCount] = await Promise.all([
    db.video.findMany({ where: soon ? soonWhere : scope, orderBy: soon ? { purgeAt: "asc" } : { createdAt: "desc" } }),
    db.video.count({ where: soonWhere }),
  ]);
  const withParams = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
    return q ? `/library?${q}` : "/library";
  };
  const showParam = (m: boolean) => (isManager(access) ? (m ? "mine" : undefined) : m ? undefined : "all");
  const tabs = [
    { href: withParams({ show: showParam(false), filter: soon ? "soon" : undefined }), label: "All", active: !mine },
    { href: withParams({ show: showParam(true), filter: soon ? "soon" : undefined }), label: "Mine", active: mine },
  ];
  const filters = [
    { href: withParams({ show: team ? showParam(mine) : undefined }), label: "All videos", active: !soon },
    { href: withParams({ show: team ? showParam(mine) : undefined, filter: "soon" }), label: `Deleting soon${soonCount ? ` (${soonCount})` : ""}`, active: soon },
  ];
  const pill = (active: boolean) => `rounded-md px-3 py-1.5 ${active ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`;

  return (
    <>
      <AppHeader email={user.email} plan={plan.name} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{team ? "Team videos" : "Your videos"}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {soon ? `${videos.length} deleting from our servers within 7 days` : (
                <>
                  {videos.length} {videos.length === 1 ? "video" : "videos"}
                  {plan.maxVideos !== null && ` of ${plan.maxVideos} on the ${plan.name} plan`}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(!workspace.cloudBackup || soonCount > 0 || soon) && (
              <nav aria-label="Filter videos" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
                {filters.map(({ href, label, active }) => (
                  <Link key={href} href={href} aria-current={active ? "page" : undefined} className={pill(active)}>{label}</Link>
                ))}
              </nav>
            )}
            {team && (
              <nav aria-label="Which videos" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
                {tabs.map(({ href, label, active }) => (
                  <Link key={label} href={href} aria-current={active ? "page" : undefined} className={pill(active)}>{label}</Link>
                ))}
              </nav>
            )}
          </div>
        </div>
        {soon && (
          <p className="-mt-4 mb-6 max-w-2xl text-sm text-slate-600">
            {workspace.cloudBackup
              ? "Cloud backup is on, so nothing here is due to be deleted."
              : "These recordings' encrypted copies are deleted from our servers within 7 days. Open one and choose Save to device to keep a copy; the original also stays on the device it was recorded on unless it was cleared."}
          </p>
        )}
        {videos.length === 0 && soon ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-16 text-center">
            <h2 className="font-semibold text-slate-900">Nothing deleting soon</h2>
            <p className="mt-1 text-sm text-slate-500">No recordings are due to be deleted from our servers in the next 7 days.</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-16 text-center">
            <h2 className="font-semibold text-slate-900">No videos yet</h2>
            <p className="mt-1 text-sm text-slate-500">Record your first video and it will show up here.</p>
            <Link href="/record" className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Record a video</Link>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <li key={v.id}>
                <Link href={`/v/${v.id}`} className="group block">
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
                    {v.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : v.encrypted ? (
                      <span className="absolute inset-0 grid place-items-center text-slate-400">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Encrypted"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </span>
                    ) : v.status !== "RECORDING" ? (
                      <video src={`/api/videos/${v.id}/stream#t=0.5`} preload="metadata" muted className="h-full w-full object-cover" />
                    ) : null}
                    {v.status === "EXPIRED" && (
                      <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">Server copy expired</span>
                    )}
                    {v.status === "RECORDING" && (
                      <span className="absolute inset-0 grid place-items-center text-sm text-slate-300">Incomplete upload</span>
                    )}
                    {v.durationMs ? (
                      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{fmt(v.durationMs)}</span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 truncate font-medium text-slate-900 group-hover:text-brand-700">{v.title}</h3>
                  <p className="text-xs text-slate-500">
                    {v.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })} · {v.viewCount} {v.viewCount === 1 ? "view" : "views"}
                  </p>
                  <StorageStatus status={v.status} purgeAt={v.purgeAt?.toISOString() ?? null} cloudBackup={workspace.cloudBackup} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-12 max-w-2xl">
          <MemberPlanner workspaceId={workspace.id} fingerprint={workspace.keyFingerprint} defaults={{ ...workspaceReminderDefaults(workspace), remindTeam: true }} title="My to-dos & notes" />
        </div>
      </main>
    </>
  );
}
