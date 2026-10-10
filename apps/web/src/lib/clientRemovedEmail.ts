/**
 * Sent to a client when their business removes them, if the business chose
 * to tell them. No button: the link no longer works. Says how long the
 * business can still restore their access.
 */
export function clientRemovedEmail(o: { business: string; clientName: string; until: string; logoUrl?: string | null; noReply?: boolean }) {
  const subject = `Your access to ${o.business} on SureFrame has ended`;
  const lead = `Hi ${o.clientName}, ${o.business} has ended your access to your private SureFrame page, so your link no longer opens your videos.`;
  const body = `If that's a mistake, contact ${o.business}. They can restore your access until ${o.until}. After that, your videos, messages and shared to-dos with them are deleted for good.`;
  const after = o.noReply ? `Please don't reply to this email; contact ${o.business} directly.` : "";
  const text = [lead, "", body, ...(after ? ["", after] : [])].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
${o.logoUrl ? `<p style="margin:0 0 20px"><img src="${esc(o.logoUrl)}" alt="${esc(o.business)}" style="max-height:40px;max-width:200px"></p>` : ""}
<p style="font-size:16px;margin:0 0 16px">${esc(lead)}</p>
<p style="font-size:15px;margin:0 0 16px;color:#334155">${esc(body)}</p>
${after ? `<p style="font-size:12px;color:#64748b;margin:0">${esc(after)}</p>` : ""}
<p style="font-size:11px;color:#94a3b8;margin:24px 0 0">Sent with SureFrame</p>
</div>`;
  return { subject, text, html };
}
