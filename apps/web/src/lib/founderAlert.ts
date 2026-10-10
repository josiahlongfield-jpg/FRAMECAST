import { sendMail } from "@/lib/mail";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Emails the support inbox about something only a person can sort out, such as
 * a refund or dispute in Stripe. Never throws: the caller's work carries on.
 */
export async function alertFounder(subject: string, lines: string[]) {
  console.log("[alert]", subject, JSON.stringify(lines));
  const to = process.env.SUPPORT_EMAIL;
  if (!to) return;
  await sendMail({
    to,
    subject: `[Action needed] ${subject}`,
    text: lines.join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f172a">${lines.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("")}</div>`,
  }).catch((err) => console.log("[alert] email failed", String(err)));
}
