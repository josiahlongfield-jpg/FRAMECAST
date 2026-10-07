import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import MemberPlanner from "@/components/MemberPlanner";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";
import { workspaceReminderDefaults } from "@/lib/reminders";

export const metadata: Metadata = { title: "Library" };

const fmt = (ms: number | null) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default async function Library({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { user, workspace } = await requirePageUser("/library");
  const plan = PLANS[workspace.plan];
  const team = (await db.membership.count({ where: { workspaceId: workspace.id } })) > 1;
  // On a team, "Mine" is what I recorded plus anything for the clients I look after.
  const mine = team && (await searchParams).show === "mine";
  const videos = await db.video.findMany({
    where: { workspaceId: workspace.id, replyToId: null, sourceId: null, ...(mine ? { OR: [{ ownerId: user.id }, { client: { assignedToId: user.id } }, { copies: { some: { client: { assignedToId: user.id } } } }] } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AppHeader email={user.email} plan={plan.name} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{team ? "Team videos" : "Your videos"}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {videos.length} {videos.length === 1 ? "video" : "videos"}
              {plan.maxVideos !== null && ` of ${plan.maxVideos} on the ${plan.name} plan`}
            </p>
          </div>
          {team && (
            <nav aria-label="Which videos" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              {[["", "All"], ["mine", "Mine"]].map(([k, label]) => (
                <Link key={k} href={k ? `/library?show=${k}` : "/library"} aria-current={(mine ? "mine" : "") === k ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 ${(mine ? "mine" : "") === k ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {videos.length === 0 ? (
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
