import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND } from "@/lib/brand";

export type Mail = { to: string; subject: string; text: string; html: string; fromName?: string; replyTo?: string | null };

/**
 * Sends email through Resend when RESEND_API_KEY is set. Without it (local
 * dev, tests) messages are written to .data/outbox so they can be inspected.
 */
export async function sendMail(mail: Mail) {
  const from = `${(mail.fromName ?? BRAND.name).replace(/[<>"]/g, "")} <${process.env.MAIL_FROM ?? "reminders@example.com"}>`;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const dir = join(process.cwd(), ".data", "outbox");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`), JSON.stringify({ from, ...mail }, null, 2));
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, reply_to: mail.replyTo ?? undefined }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
