/**
 * Short emails to the team (client replies, videos sent by staff, staff
 * reminders). Encrypted content (replies, to-dos, video titles) never
 * appears; links open the app, where it's decrypted on the device.
 */
export function teamEmail(o: {
  business: string;
  subject: string;
  lead: string;
  /** Optional extra lines, each optionally linked. */
  lines?: { text: string; link?: string }[];
  /** A plain-text note from a person (staff reminders), shown as written. */
  note?: string;
  button: { label: string; link: string };
  footer?: string;
  logoUrl?: string | null;
  color?: string | null;
}) {
  const lines = o.lines ?? [];
  const text = [
    o.lead,
    o.note ? `\n${o.note}` : "",
    ...lines.map((l) => `- ${l.text}${l.link ? `: ${l.link}` : ""}`),
    `\n${o.button.label}: ${o.button.link}`,
    o.footer ? `\n${o.footer}` : "",
  ].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const accent = o.color && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#3b55e6";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
${o.logoUrl ? `<p style="margin:0 0 20px"><img src="${esc(o.logoUrl)}" alt="${esc(o.business)}" style="max-height:40px;max-width:200px"></p>` : ""}
<p style="font-size:16px;margin:0 0 16px">${esc(o.lead)}</p>
${o.note ? `<p style="font-size:15px;white-space:pre-wrap;margin:0 0 16px;color:#334155">${esc(o.note)}</p>` : ""}
${lines.length ? `<ul style="font-size:14px;margin:0 0 16px;padding-left:20px;color:#334155">${lines.map((l) => `<li>${l.link ? `<a href="${esc(l.link)}" style="color:${accent}">${esc(l.text)}</a>` : esc(l.text)}</li>`).join("")}</ul>` : ""}
<p style="margin:24px 0"><a href="${esc(o.button.link)}" style="background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;display:inline-block">${esc(o.button.label)}</a></p>
${o.footer ? `<p style="font-size:12px;color:#64748b;margin:0">${esc(o.footer)}</p>` : ""}
<p style="font-size:11px;color:#94a3b8;margin:24px 0 0">Sent with SureFrame</p>
</div>`;
  return { subject: o.subject, text, html };
}
