import { localParts } from "@/lib/schedule";

/**
 * The reminder email. Pure, so the settings page can show a live preview.
 * The to-do's text is end-to-end encrypted and never appears in the email;
 * the recipient opens their list to read it.
 */
export function reminderEmail(o: {
  business: string;
  message?: string | null;
  due: Date;
  now?: Date;
  tz: string;
  link: string;
  /** Client emails carry an unsubscribe link. */
  unsubscribe?: string;
  /** A reminder to the business itself, optionally about one client's list. */
  team?: boolean;
  clientName?: string;
  /** The business's logo (absolute URL) and accent colour, on paid plans. */
  logoUrl?: string | null;
  color?: string | null;
}) {
  const when = dueText(o.due, o.now ?? new Date(), o.tz);
  const subject = !o.team
    ? `Reminder from ${o.business}: a to-do is due ${when}`
    : o.clientName ? `${o.clientName}: a to-do is due ${when}` : `A to-do on your list is due ${when}`;
  const lead = !o.team
    ? `You have a to-do from ${o.business} due ${when}.`
    : o.clientName ? `A to-do on ${o.clientName}'s list is due ${when}.` : `A to-do on your list is due ${when}.`;
  const message = o.team ? "" : o.message?.trim();
  const text = [
    lead,
    message ? `\n${message}` : "",
    `\nOpen your list: ${o.link}`,
    "\nFor privacy, the details are only shown in the app.",
    o.unsubscribe ? `\nStop these reminders: ${o.unsubscribe}` : "",
    "\nSent with SureFrame",
  ].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const accent = o.color && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#3b55e6";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
${o.logoUrl ? `<p style="margin:0 0 20px"><img src="${esc(o.logoUrl)}" alt="${esc(o.business)}" style="max-height:40px;max-width:200px"></p>` : ""}
<p style="font-size:16px;margin:0 0 16px">${esc(lead)}</p>
${message ? `<p style="font-size:15px;white-space:pre-wrap;margin:0 0 16px;color:#334155">${esc(message)}</p>` : ""}
<p style="margin:24px 0"><a href="${esc(o.link)}" style="background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;display:inline-block">Open your list</a></p>
<p style="font-size:12px;color:#64748b;margin:0">For privacy, the details are only shown in the app.</p>
${o.unsubscribe ? `<p style="font-size:12px;color:#64748b;margin:8px 0 0"><a href="${esc(o.unsubscribe)}" style="color:#64748b">Stop these reminders</a></p>` : ""}
<p style="font-size:11px;color:#94a3b8;margin:24px 0 0">Sent with SureFrame</p>
</div>`;
  return { subject, text, html, when };
}

/** "today at 9am", "tomorrow at 6:30pm", "on Sun, Oct 12 at 9am". */
export function dueText(due: Date, now: Date, tz: string) {
  const d = localParts(due, tz);
  const n = localParts(now, tz);
  const days = Math.round((Date.UTC(d.y, d.m - 1, d.d) - Date.UTC(n.y, n.m - 1, n.d)) / 86_400_000);
  const time = due.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days > 1 && days < 7) return `on ${due.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" })} at ${time}`;
  return `on ${due.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}
