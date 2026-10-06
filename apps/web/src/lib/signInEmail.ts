import { BRAND } from "@/lib/brand";

/** The magic-link email. Pure, so it can be tested and previewed. */
export function signInEmail(url: string, host: string) {
  const subject = `Your ${BRAND.name} sign-in link`;
  const text = [
    `Sign in to ${BRAND.name}:`,
    url,
    "",
    "This link works once and expires in 24 hours.",
    `If you didn't ask to sign in to ${host}, you can ignore this email.`,
  ].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
<p style="font-size:18px;font-weight:600;margin:0 0 16px">Sign in to ${esc(BRAND.name)}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#3b55e6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">Sign in</a></p>
<p style="font-size:13px;color:#475569;margin:0 0 8px">This link works once and expires in 24 hours.</p>
<p style="font-size:12px;color:#64748b;margin:0">If you didn't ask to sign in to ${esc(host)}, you can ignore this email.</p>
</div>`;
  return { subject, text, html };
}
