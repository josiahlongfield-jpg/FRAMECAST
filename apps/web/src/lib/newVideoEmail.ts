/**
 * Tells a client a video is waiting. The video's title isn't included (it
 * can be personal) and the link carries no key: the client's device already
 * holds it from their personal link. Names the person who recorded it when
 * they've set a name, as the app does ("Sam from Peak Fitness").
 */
export function newVideoEmail(o: { business: string; sender?: string | null; clientName: string; link: string; logoUrl?: string | null; color?: string | null; unsubscribe?: string; noReply?: boolean }) {
  const from = o.sender?.trim() ? `${o.sender.trim()} from ${o.business}` : o.business;
  const subject = `${from} sent you a video`;
  const lead = `Hi ${o.clientName}, ${from} sent you a new video on SureFrame.`;
  const after = "It's private to you. If it doesn't open on this device, use the personal link they gave you first." + (o.noReply ? ` Please don't reply to this email; contact ${o.business} directly.` : "");
  const stop = o.unsubscribe ? `Don't want emails from ${o.business}? Turn them off: ${o.unsubscribe}` : "";
  const text = [lead, "", `Watch it: ${o.link}`, "", after, ...(stop ? ["", stop] : [])].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const accent = o.color && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#3b55e6";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
${o.logoUrl ? `<p style="margin:0 0 20px"><img src="${esc(o.logoUrl)}" alt="${esc(o.business)}" style="max-height:40px;max-width:200px"></p>` : ""}
<p style="font-size:16px;margin:0 0 16px">${esc(lead)}</p>
<p style="margin:24px 0"><a href="${esc(o.link)}" style="background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;display:inline-block">Watch the video</a></p>
<p style="font-size:12px;color:#64748b;margin:0">${esc(after)}</p>
${o.unsubscribe ? `<p style="font-size:11px;color:#94a3b8;margin:16px 0 0">Don&#39;t want emails from ${esc(o.business)}? <a href="${esc(o.unsubscribe)}" style="color:#64748b">Turn them off</a></p>` : ""}
<p style="font-size:11px;color:#94a3b8;margin:24px 0 0">Sent with SureFrame</p>
</div>`;
  return { subject, text, html };
}
