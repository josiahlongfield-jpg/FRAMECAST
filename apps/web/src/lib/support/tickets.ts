import { randomBytes } from "node:crypto";
import { rateLimit } from "@/lib/rateLimit";
import type { SupportMessage, SupportTicket } from "@prisma/client";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/stripe";

/** Where handed-over conversations are announced. Set SUPPORT_EMAIL in production. */
export const supportInbox = () => process.env.SUPPORT_EMAIL || null;

/** People who can read and answer tickets in /support (comma-separated emails). */
export function isSupportAgent(email: string | null | undefined) {
  if (!email) return false;
  const agents = (process.env.SUPPORT_AGENTS ?? process.env.SUPPORT_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return agents.includes(email.toLowerCase());
}

export const newAccessToken = () => randomBytes(24).toString("base64url");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const paragraphs = (s: string) => esc(s).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap">${p}</p>`).join("");

/**
 * Marks a ticket as needing a person and emails the support inbox. Without a
 * summary (the customer added to a handed-over conversation) the first one stays.
 */
export async function handToHuman(ticketId: string, summary: string | null, urgent: boolean) {
  const ticket = await db.supportTicket.update({
    where: { id: ticketId },
    data: { status: "NEEDS_HUMAN", urgent, ...(summary ? { summary } : {}) },
    include: { user: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  const to = supportInbox();
  if (!to) return;
  // Keep the inbox usable: one email per conversation per half hour for follow-up messages,
  // and a daily ceiling overall. Everything still shows at /support.
  const allowed = (key: string, limit: number, windowSec: number) => rateLimit(key, limit, windowSec).then(() => true, () => false);
  if (!summary && !(await allowed(`support-mail:${ticketId}`, 1, 1800))) return;
  if (!(await allowed("support-mail:all", Number(process.env.SUPPORT_MAIL_DAILY_CAP ?? 200), 86400))) return;
  const who = ticket.user?.email ?? ticket.email ?? "a website visitor (no email given)";
  const link = appUrl(`/support/${ticket.id}`);
  const transcript = ticket.messages.map((m) => `${m.author === "CUSTOMER" ? "Customer" : m.author === "ASSISTANT" ? "Assistant" : "You"}: ${m.body}`).join("\n\n");
  await sendMail({
    to,
    subject: `${urgent ? "[Urgent] " : ""}Support${summary ? "" : " (new message)"}: ${who}`,
    text: [`Summary: ${ticket.summary ?? ""}`, "", `Answer it here: ${link}`, "", "Conversation so far:", "", transcript].join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f172a">
<p style="margin:0 0 12px"><strong>${urgent ? "Urgent: " : ""}${esc(who)}</strong> needs a person.</p>
${paragraphs(ticket.summary ?? "")}
<p style="margin:16px 0"><a href="${esc(link)}">Open the conversation and reply</a></p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
${paragraphs(transcript)}
</div>`,
    replyTo: ticket.user?.email ?? ticket.email,
  }).catch((e) => console.error("support email failed", e));
}

/** A person's reply: stored on the ticket and emailed to the customer when we have an address. */
export async function staffReply(ticket: SupportTicket & { user: { email: string } | null }, body: string) {
  await db.supportMessage.create({ data: { ticketId: ticket.id, author: "STAFF", body } });
  await db.supportTicket.update({ where: { id: ticket.id }, data: { status: "ANSWERED" } });
  const to = ticket.user?.email ?? ticket.email;
  if (!to) return false;
  const link = appUrl(`/help#t=${ticket.accessToken}`);
  await sendMail({
    to,
    subject: "Reply from SureFrame support",
    text: [body, "", `See the whole conversation or reply: ${link}`].join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f172a">${paragraphs(body)}
<p style="margin:16px 0"><a href="${esc(link)}">See the conversation or reply</a></p>
<p style="font-size:11px;color:#94a3b8;margin:24px 0 0">SureFrame support</p></div>`,
    replyTo: supportInbox(),
  });
  return true;
}

/** What the customer's browser sees: never the assistant's hand-over summary. */
export function publicTicket(ticket: SupportTicket & { messages: SupportMessage[] }) {
  return {
    status: ticket.status,
    messages: ticket.messages.map((m) => ({ id: m.id, author: m.author, body: m.body, at: m.createdAt.toISOString() })),
  };
}
