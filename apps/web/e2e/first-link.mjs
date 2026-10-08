// Sending a video to a client for the first time: a pop-up explains that the
// business sends the personal link itself (it holds the client's key). Once the
// link has been copied (or opened), later videos go with a plain Send button,
// which emails the client. Choosing a client alone emails nobody.
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const prisma = new PrismaClient();
let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass ? "" : ` ${detail}`}`);
  if (!pass) failed++;
};
mkdirSync(".data/outbox", { recursive: true });
const mailTo = (to) => readdirSync(".data/outbox").map((f) => JSON.parse(readFileSync(`.data/outbox/${f}`, "utf8"))).filter((m) => m.to === to && /sent you a video/.test(m.subject));
const waitFor = async (fn, ms = 20000) => {
  for (let t = 0; t < ms; t += 250) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  return fn();
};

const args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args });
const perms = { permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"] };
const stamp = Date.now();
const owner = await (await browser.newContext(perms)).newPage();
await owner.goto(`${BASE}/login?next=/record`);
await owner.fill('input[name="email"]', `fl-owner${stamp}@example.com`);
await owner.click("text=Continue");
await owner.waitForURL((u) => u.pathname === "/record");
await owner.click("text=I've saved it");

const zoeEmail = `zoe${stamp}@example.com`;
await owner.goto(BASE + "/clients");
await owner.fill('input[aria-label="Client name"]', "Zoe Park");
await owner.fill('input[aria-label="Client email"]', zoeEmail);
await owner.click("button:has-text('Add client')");
await owner.waitForSelector("a:has-text('Zoe Park')");
const zoe = await prisma.client.findFirst({ where: { email: zoeEmail } });

async function record() {
  await owner.goto(BASE + "/record");
  await owner.click("text=Camera only");
  await owner.click("text=Start recording");
  await owner.waitForSelector("text=/Recording · \\d/", { timeout: 15000 });
  await owner.waitForTimeout(2500);
  await owner.click("button:has-text('Stop')");
  await owner.waitForURL("**/v/**", { timeout: 30000 });
  await owner.waitForSelector("select:near(:text('Send to'))", { timeout: 20000 });
  return owner.url().split("/v/")[1].split("?")[0];
}

// First video: the pop-up explains and offers the link. Nothing is emailed until Send.
const first = await record();
await owner.selectOption("select:near(:text('Send to'))", zoe.id);
const dialog = await owner.waitForSelector("[data-testid=first-link-dialog]", { timeout: 5000 }).catch(() => null);
ok("first video: pop-up appears", !!dialog);
const text = dialog ? await dialog.textContent() : "";
ok("pop-up names the client", text.includes("Send Zoe their personal link"));
ok("pop-up explains why", /end-to-end encrypted/.test(text) && /can.t email it for you/.test(text));
ok("pop-up says later videos just need Send", /just press Send/.test(text));
await owner.click("[data-testid=first-link-dialog] >> text=Done");
ok("status says the link hasn't been sent", (await owner.textContent("[data-testid=send-status]")).includes("hasn't had their personal link yet"));
ok("before the link is sent: the button copies the link", (await owner.locator("[data-testid=send-button]").count()) === 0 && (await owner.isVisible("button:has-text(\"Copy Zoe's link\")")));
await owner.click("[data-testid=send-status] >> text=Why?");
ok("'Why?' reopens the pop-up", await owner.isVisible("[data-testid=first-link-dialog]"));
await owner.click("[data-testid=first-link-dialog] >> text=Copy Zoe's link");
const link = await owner.evaluate(() => navigator.clipboard.readText());
ok("copied link opens this video with Zoe's key", link.includes(`v=${first}`) && link.includes("#k="), link);
const sentAt = await waitFor(async () => (await prisma.client.findUnique({ where: { id: zoe.id } })).linkSentAt, 5000);
ok("copying the link is remembered", !!sentAt);
await owner.keyboard.press("Escape");
ok("Escape closes the pop-up", (await owner.locator("[data-testid=first-link-dialog]").count()) === 0);
ok("after copying: the button becomes Send", (await owner.textContent("[data-testid=send-button]").catch(() => "")) === "Send to Zoe");
ok("choosing the client alone emails nobody", mailTo(zoeEmail).length === 0);

// A later video, before Zoe has even opened her link: a plain Send, no pop-up.
const second = await record();
await owner.selectOption("select:near(:text('Send to'))", zoe.id);
await owner.waitForSelector("[data-testid=send-button]", { timeout: 5000 }).catch(() => {});
ok("second video: no pop-up", (await owner.locator("[data-testid=first-link-dialog]").count()) === 0);
ok("second video: Send button", (await owner.textContent("[data-testid=send-button]").catch(() => "")) === "Send to Zoe");
ok("status asks to press Send", (await owner.textContent("[data-testid=send-status]")).includes("Press Send"));
await owner.click("[data-testid=send-button]");
const status = await waitFor(async () => {
  const t = await owner.textContent("[data-testid=send-status]");
  return /emailed Zoe|email Zoe as soon/.test(t) ? t : null;
}, 10000);
ok("after Send: says Zoe is emailed", !!status, String(status));
ok("button shows Sent", (await owner.textContent("[data-testid=send-button]")) === "Sent");
ok("Zoe emailed about the second video", (await waitFor(() => mailTo(zoeEmail).some((m) => m.text.includes(second)))) === true);
ok("only one email so far", mailTo(zoeEmail).length === 1);

// Zoe opens her personal link: that's recorded too.
const zoePage = await (await browser.newContext(perms)).newPage();
await zoePage.goto(link);
await zoePage.waitForSelector("main video", { timeout: 30000 });
const opened = await waitFor(async () => (await prisma.client.findUnique({ where: { id: zoe.id } })).linkOpenedAt);
ok("opening the link is recorded", !!opened);

// A business trying a client's link in its own signed-in browser still records the client's visit.
const yanEmail = `yan${stamp}@example.com`;
await owner.goto(BASE + "/clients");
await owner.fill('input[aria-label="Client name"]', "Yan Li");
await owner.fill('input[aria-label="Client email"]', yanEmail);
await owner.click("button:has-text('Add client')");
await owner.waitForSelector("a:has-text('Yan Li')");
const yan = await prisma.client.findFirst({ where: { email: yanEmail } });
await owner.click("li:has-text('Yan Li') >> button:has-text('Copy personal link')");
ok("copying from the clients page is remembered", !!(await waitFor(async () => (await prisma.client.findUnique({ where: { id: yan.id } })).linkSentAt, 5000)));
await owner.goto(await owner.evaluate(() => navigator.clipboard.readText()));
await owner.waitForURL("**/inbox**", { timeout: 15000 }).catch(() => {});
ok("same browser as the team: Yan's visit recorded", !!(await waitFor(async () => (await prisma.client.findUnique({ where: { id: yan.id } })).linkOpenedAt, 8000)));
ok("emails carry no key", mailTo(zoeEmail).every((m) => !m.text.includes("#k=")));

await browser.close();
await prisma.$disconnect();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
