import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/session";
import { isSupportAgent } from "@/lib/support/tickets";

export const metadata: Metadata = { title: "Support inbox" };

const LABEL = { NEEDS_HUMAN: "Needs you", ANSWERED: "Answered", OPEN: "Assistant handling", CLOSED: "Closed" } as const;

/** The founder's support inbox: conversations the assistant handed over come first. */
export default async function SupportInbox({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { user } = await requirePageUser("/support");
  if (!isSupportAgent(user.email)) notFound();
  const { show } = await searchParams;
  const tickets = await db.supportTicket.findMany({
    where: show === "all" ? {} : { status: { in: ["NEEDS_HUMAN", "ANSWERED"] } },
    orderBy: [{ urgent: "desc" }, { updatedAt: "desc" }],
    take: 200,
    include: { user: { select: { email: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const order = { NEEDS_HUMAN: 0, ANSWERED: 1, OPEN: 2, CLOSED: 3 };
  tickets.sort((a, b) => order[a.status] - order[b.status]);
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Support inbox</h1>
        <Link href={show === "all" ? "/support" : "/support?show=all"} className="text-sm text-brand-700 hover:underline">
          {show === "all" ? "Only ones needing you" : "Show every conversation"}
        </Link>
      </div>
      {tickets.length === 0 && <p className="mt-8 text-slate-600">Nothing needs you right now. The assistant is handling everything else.</p>}
      <ul className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {tickets.map((t) => (
          <li key={t.id}>
            <Link href={`/support/${t.id}`} className="block p-4 hover:bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{t.user?.email ?? t.email ?? "Website visitor"}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${t.status === "NEEDS_HUMAN" ? (t.urgent ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900") : "bg-slate-100 text-slate-600"}`}>
                  {t.urgent && t.status === "NEEDS_HUMAN" ? "Urgent" : LABEL[t.status]}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{t.summary ?? t.messages[0]?.body}</p>
              <p className="mt-1 text-xs text-slate-400">{t.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
