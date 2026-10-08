import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import CopyClientLink from "@/components/CopyClientLink";
import MemberPlanner from "@/components/MemberPlanner";
import { db } from "@/lib/db";
import { clientLink } from "@/lib/clients";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";
import { reminderDefaultsFor } from "@/lib/reminders";
import ClientEmail from "@/components/ClientEmail";
import { accessOf, canSeeClient } from "@/lib/permissions";

export const metadata: Metadata = { title: "Client" };

/** One client's space: what was sent to them, plus their to-dos and notes. */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePageUser(`/clients/${id}`);
  const { user, workspace } = me;
  const client = await db.client.findUnique({
    where: { id },
    include: { videos: { where: { replyToId: null }, orderBy: { createdAt: "desc" } } },
  });
  // Staff only open the clients they can see (lib/permissions.ts); others look like they don't exist.
  if (!client || client.removedAt || !canSeeClient(accessOf(me), client)) notFound();

  return (
    <>
      <AppHeader email={user.email} plan={PLANS[workspace.plan].name} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link href="/clients" className="text-sm text-slate-500 hover:text-slate-800">← Clients</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{client.name}</h1>
            <ClientEmail clientId={client.id} firstName={client.name.split(" ")[0]} initial={client.email} optedOut={client.remindersOff} />
          </div>
          <CopyClientLink workspaceId={workspace.id} fingerprint={workspace.keyFingerprint} link={clientLink(client.token)} teamKeyWrap={client.teamKeyWrap} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Videos</h2>
            {client.videos.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Nothing sent yet. Record a video, then choose {client.name.split(" ")[0]} under &ldquo;Send to&rdquo;.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {client.videos.map((v) => (
                  <li key={v.id}>
                    <Link href={`/v/${v.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand-700">
                      <span className="truncate font-medium">{v.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {v.status === "EXPIRED" ? "Server copy expired · " : ""}
                        {v.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <MemberPlanner
            workspaceId={workspace.id}
            fingerprint={workspace.keyFingerprint}
            clientId={client.id}
            clientName={client.name}
            clientTeamKeyWrap={client.teamKeyWrap}
            client={{ email: client.email, remindersOff: client.remindersOff }}
            defaults={reminderDefaultsFor(workspace, me.membership)}
            title="To-dos & notes"
          />
        </div>
      </main>
    </>
  );
}
