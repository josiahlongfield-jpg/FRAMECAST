import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import MemberPlanner from "@/components/MemberPlanner";
import StorageStatus from "@/components/StorageStatus";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { followTeamLink, requirePageUser } from "@/lib/session";
import { reminderDefaultsFor } from "@/lib/reminders";
import { accessOf, isManager, libraryWhere, seesAllClients } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { zoned } from "@/lib/dates";

export const metadata: Metadata = { title: "Library" };

const fmt = (ms: number | null) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default async function Library({ searchParams }: { searchParams: Promise<{ show?: string; filter?: string; ws?: string }> }) {
  const { show, filter, ws } = await searchParams;
  await followTeamLink(ws, filter ? `/library?filter=${encodeURIComponent(filter)}` : "/library");
  const me = await requirePageUser("/library");
  const { user, workspace } = me;
  const access = accessOf(me);
  const plan = PLANS[workspace.plan];
  // Staff who only see their own clients have nothing else to switch to.
  const teamSize = await db.membership.count({ where: { workspaceId: workspace.id, pausedAt: null } });
  const team = seesAllClients(access) && teamSize > 1;
  // On a team, "Mine" is what I recorded plus anything for the clients I look after.
  // Staff start on "Mine"; owners and admins on everything.
  const mine = team && (show === "mine" || (!isManager(access) && show !== "all"));
  const scope: Prisma.VideoWhereInput = { ...libraryWhere(access), ...(mine ? { OR: [{ ownerId: user.id }, { client: { assignedToId: user.id } }, { copies: { some: { client: { assignedToId: user.id } } } }] } : {}) };
  // "Deleting soon": server copies deleted within a week (no cloud backup), soonest first.
  const soonWhere: Prisma.VideoWhereInput = { ...scope, AND: [{ purgeAt: { not: null, lte: new Date(Date.now() + 7 * 86_400_000) } }, { status: { notIn: ["EXPIRED", "RECORDING"] } }] };
  const soon = filter === "soon";
  const [videos, soonCount] = await Promise.all([
    // Copies sent to other clients count their views towards the original.
    db.video.findMany({ where: soon ? soonWhere : scope, orderBy: soon ? { purgeAt: "asc" } : { createdAt: "desc" }, include: { copies: { select: { viewCount: true } } } }),
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
  const dates = zoned(workspace.timezone);
  const views = (v: (typeof videos)[number]) => v.viewCount + v.copies.reduce((n, c) => n + c.viewCount, 0);
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
            {plan.showsPromo && (
              <p className="mt-2 text-sm text-slate-500" data-testid="promo-note">
                Your clients see a short SureFrame intro before each video. Paid plans remove it.{" "}
                <Link href="/pricing" className="font-medium text-brand-700 hover:underline">See plans</Link>
              </p>
            )}
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
              : "These recordings' encrypted copies are deleted from our servers within 7 days. After that they can't be watched from their links. Open one and choose Save to device to keep your own copy."}
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
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" role="img" aria-label="Encrypted"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </span>
                    ) : v.status !== "RECORDING" ? (
                      <video src={`/api/videos/${v.id}/stream#t=0.5`} preload="metadata" muted className="h-full w-full object-cover" />
                    ) : null}
                    {v.status === "EXPIRED" && (
                      <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">Deleted from our servers</span>
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
                    {dates.day(v.createdAt)} · {views(v)} {views(v) === 1 ? "view" : "views"}
                  </p>
                  <StorageStatus status={v.status} purgeAt={v.purgeAt?.toISOString() ?? null} cloudBackup={workspace.cloudBackup} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-12 max-w-2xl">
          {/* Items not about a client are one list for the whole team; say so when there is a team. */}
          <MemberPlanner
            workspaceId={workspace.id}
            fingerprint={workspace.keyFingerprint}
            defaults={{ ...reminderDefaultsFor(workspace, me.membership), remindTeam: true }}
            {...(teamSize > 1
              ? { title: "Team to-dos & notes", note: "Everyone on your team can see and change these. Keep client to-dos on each client's page.", teamWho: { label: "Email the team", tag: "the team" } }
              : { title: "My to-dos & notes" })}
          />
        </div>
      </main>
    </>
  );
}
