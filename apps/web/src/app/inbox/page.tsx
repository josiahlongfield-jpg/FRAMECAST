import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import ClientHeader from "@/components/ClientHeader";
import MadeWith from "@/components/MadeWith";
import AiNotice from "@/components/AiNotice";
import { aiAssistActive } from "@/lib/plans";
import { brandOf, brandStyle } from "@/lib/branding";
import ClientKeyCapture from "@/components/ClientKeyCapture";
import ClientPlanner from "@/components/ClientPlanner";
import { db } from "@/lib/db";
import { unsubscribeUrl } from "@/lib/reminders";

export const metadata: Metadata = { title: "Your videos" };

/** A client's view: every video their coach (or coaches) sent them. */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ invalid?: string; c?: string }> }) {
  const { invalid, c: arrivedAs } = await searchParams;
  const tokens = (await cookies())
    .getAll()
    .filter((c) => c.name.startsWith("fc_client_"))
    .map((c) => c.value);
  const clients = tokens.length
    ? await db.client.findMany({
        where: { token: { in: tokens }, removedAt: null },
        include: {
          workspace: { select: { id: true, name: true, plan: true, brandColor: true, brandLogoType: true, brandVersion: true, aiAssist: true } },
          videos: { where: { replyToId: null, status: { not: "RECORDING" } }, orderBy: { createdAt: "desc" }, include: { owner: { select: { name: true } } } },
        },
      })
    : [];

  // With one business, the whole page wears its branding.
  const brand = clients.length === 1 ? brandOf(clients[0].workspace) : null;

  return (
    <div className="min-h-screen bg-slate-50" style={brandStyle(brand?.color ?? null)}>
      {arrivedAs && clients.some((c) => c.id === arrivedAs) && <ClientKeyCapture clientId={arrivedAs} />}
      <ClientHeader brand={brand} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your videos</h1>
        {invalid && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            That link is no longer active. Ask the person who sent it for a new one.
          </p>
        )}
        {clients.length === 0 ? (
          <p className="mt-6 text-slate-600">Open the personal link you were sent to see your videos here.</p>
        ) : (
          clients.map((c) => (
            <section key={c.id} className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">From {c.workspace.name}</h2>
              {aiAssistActive(c.workspace) && <AiNotice className="mt-2" />}
              {c.videos.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Nothing yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                  {c.videos.map((v) => (
                    <li key={v.id}>
                      <Link href={`/v/${v.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{v.title}</span>
                          {/* Who sent it, never their email: "Sam from Business". */}
                          {v.owner.name && <span className="block text-xs text-slate-500">{v.owner.name} from {c.workspace.name}</span>}
                        </span>
                        <span className="shrink-0 pl-3 text-sm text-slate-500">{v.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <ClientPlanner clientId={c.id} title="Your to-dos & notes" />
              </div>
              {c.email && (
                <p className="mt-2 text-xs text-slate-500">
                  Reminder emails to {c.email} are {c.remindersOff ? "off" : "on"}.{" "}
                  <a href={unsubscribeUrl(c.id)} className="font-medium text-brand-700 hover:underline">
                    {c.remindersOff ? "Turn on" : "Turn off"}
                  </a>
                </p>
              )}
            </section>
          ))
        )}
      </main>
      <MadeWith />
    </div>
  );
}
