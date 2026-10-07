// Email-link sign-in. Run against a server started with AUTH_EMAIL_LINKS=true
// (no RESEND_API_KEY), which writes emails to .data/outbox.
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const outbox = ".data/outbox";
const ok = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
const email = `link${Date.now()}@example.com`;

await page.goto(BASE + "/login?next=/clients");
ok("password form hidden when email links are on", !(await page.isVisible('input[name="password"]')));
await page.fill('input[name="email"]', email);
await page.click("text=Email me a sign-in link");
await page.waitForURL("**/login/check**");
ok("check-your-email page shown", await page.isVisible("text=Check your email"));

const mail = readdirSync(outbox)
  .map((f) => JSON.parse(readFileSync(`${outbox}/${f}`, "utf8")))
  .find((m) => m.to === email);
ok("sign-in email sent", !!mail);
ok("email is branded", /SureFrame sign-in link/.test(mail?.subject ?? ""));
const link = mail.text.match(/https?:\/\/\S+/)[0];

await page.goto(link);
await page.waitForURL("**/clients");
ok("link signs in and returns to the page asked for", true);

const other = await (await browser.newContext()).newPage();
await other.goto(link);
await other.waitForURL("**/login**");
ok("a used link is refused with a clear message", await other.isVisible("text=expired or was already used"));
// Five links per address per hour: the sixth request is refused politely.
const spam = await (await browser.newContext()).newPage();
for (let i = 0; i < 5; i++) {
  await spam.goto(BASE + "/login");
  await spam.fill('input[name="email"]', email);
  await spam.click("text=Email me a sign-in link");
  await spam.waitForURL((u) => u.pathname === "/login/check" || u.searchParams.get("error") === "rate");
}
ok("sign-in emails to one address are limited", await spam.waitForSelector("text=Too many sign-in emails", { timeout: 5000 }).then(() => true, () => false));
await browser.close();
