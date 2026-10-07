/**
 * Sent to a client when their business resets its keys (someone left the
 * team). The link carries no key: the client's device upgrades the key it
 * already holds, and a new device needs the full link from the business.
 */
export function newLinkEmail(o: { business: string; clientName: string; link: string; logoUrl?: string | null; color?: string | null }) {
  const subject = `${o.business} sent you a new private link`;
  const lead = `Hi ${o.clientName}, ${o.business} has refreshed the security on your private SureFrame page, so your old link no longer works.`;
  const after = "Use this new link from now on. On a phone or computer you haven't used before, ask them for your full personal link.";
  const text = [lead, "", `Your new link: ${o.link}`, "", after].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const accent = o.color && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#3b55e6";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
${o.logoUrl ? `<p style="margin:0 0 20px"><img src="${esc(o.logoUrl)}" alt="${esc(o.business)}" style="max-height:40px;max-width:200px"></p>` : ""}
<p style="font-size:16px;margin:0 0 16px">${esc(lead)}</p>
<p style="margin:24px 0"><a href="${esc(o.link)}" style="background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;display:inline-block">Open your page</a></p>
<p style="font-size:12px;color:#64748b;margin:0">${esc(after)}</p>
<p style="font-size:11px;color:#94a3b8;margin:24px 0 0">Sent with SureFrame</p>
</div>`;
  return { subject, text, html };
}
