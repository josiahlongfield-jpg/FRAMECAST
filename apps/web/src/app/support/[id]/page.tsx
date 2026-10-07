import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";
import { isSupportAgent } from "@/lib/support/tickets";
import { reply, setStatus } from "../actions";

export const metadata: Metadata = { title: "Support conversation" };

const WHO = { CUSTOMER: "Customer", ASSISTANT: "Assistant", STAFF: "You" } as const;

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePageUser(`/support/${id}`);
  if (!isSupportAgent(user.email)) notFound();
  const ticket = await db.supportTicket.findUnique({ where: { id }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket) notFound();
  const workspace = ticket.workspaceId ? await db.workspace.findUnique({ where: { id: ticket.workspaceId } }) : null;
  const email = ticket.user?.email ?? ticket.email;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/support" className="text-sm text-brand-700 hover:underline">← Support inbox</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{email ?? "Website visitor"}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {workspace ? `${workspace.name} · ${PLANS[workspace.plan].name} plan${workspace.subscriptionStatus ? ` (${workspace.subscriptionStatus})` : ""}` : "Not signed in"}
        {email ? "" : " · no email given, so your reply only shows in their chat"}
      </p>
      {ticket.summary && (
        <div className={`mt-6 rounded-2xl p-4 text-sm ${ticket.urgent ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
          <p className="font-semibold">{ticket.urgent ? "Urgent. " : ""}Assistant&rsquo;s summary</p>
          <p className="mt-1 whitespace-pre-wrap">{ticket.summary}</p>
        </div>
      )}
      <ol className="mt-6 space-y-3">
        {ticket.messages.map((m) => (
          <li key={m.id} className={`rounded-2xl border p-4 text-sm ${m.author === "CUSTOMER" ? "border-slate-200 bg-white" : m.author === "STAFF" ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}>
            <p className="text-xs font-semibold text-slate-500">
              {WHO[m.author]} · {m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
            </p>
            <p className="mt-1 whitespace-pre-wrap text-slate-900">{m.body}</p>
          </li>
        ))}
      </ol>
      <form action={reply.bind(null, ticket.id)} className="mt-6 grid gap-3">
        <textarea name="body" required rows={6} aria-label="Your reply" placeholder="Write your reply…" className="rounded-xl border border-slate-300 p-3 text-sm" />
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{email ? "Send reply by email" : "Send reply"}</button>
          {ticket.status !== "CLOSED" ? (
            <button formAction={setStatus.bind(null, ticket.id, "CLOSED")} formNoValidate className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Close</button>
          ) : (
            <span className="text-sm text-slate-500">Closed. A new message from them reopens it with the assistant.</span>
          )}
        </div>
      </form>
    </main>
  );
}
