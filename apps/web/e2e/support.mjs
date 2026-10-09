// The support assistant. A visitor asks a question and the assistant answers;
// a refund request is handed to a person, who is emailed and answers from the
// /support inbox; the reply appears in the visitor's chat and by email. A
// signed-in customer's plan question uses their account. A failing assistant
// still hands over. Needs the app running with SUPPORT_EMAIL=owner@test.dev,
// ANTHROPIC_API_KEY=test and ANTHROPIC_BASE_URL=http://localhost:12112.
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { requests, startFakeAnthropic } from "./fake-anthropic.mjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const AGENT = "owner@test.dev";
const shots = process.argv[2] ?? "/tmp";
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? ` (${extra})` : ""}`);
  if (!cond) process.exitCode = 1;
};
const outbox = () => {
  try {
    return readdirSync(".data/outbox").sort().map((f) => JSON.parse(readFileSync(`.data/outbox/${f}`, "utf8")));
  } catch {
    return [];
  }
};
rmSync(".data/outbox", { recursive: true, force: true });
const fake = await startFakeAnthropic();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });

async function ask(page, text) {
  const before = await page.locator("[aria-live=polite] .whitespace-pre-wrap").count();
  await page.fill('textarea[aria-label="Your message"]', text);
  await page.keyboard.press("Enter");
  await page.waitForFunction((n) => document.querySelectorAll("[aria-live=polite] .whitespace-pre-wrap").length >= n + 2, before, { timeout: 30000 });
  return (await page.locator("[aria-live=polite] .whitespace-pre-wrap").last().textContent()).trim();
}

// 1. A visitor on the home page opens Help and asks a question
const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await visitor.goto(BASE + "/");
await visitor.click("button:has-text('Help')");
ok("help panel opens", await visitor.isVisible("role=dialog[name='SureFrame help']"));
await visitor.fill('input[aria-label="Your email"]', "visitor@example.com");
const a1 = await ask(visitor, "How do I add a client?");
ok("assistant answers", a1.includes("Clients page"), a1);
const call = requests.at(-1);
ok("uses the Claude API with the guide cached", call.body.model === "claude-opus-5-5" && call.body.system.includes("help guide") && call.body.cache_control?.type === "ephemeral");
ok("tells the assistant the visitor isn't signed in", call.body.messages.some((m) => m.role === "system" && m.content.includes("not signed in")));

// 2. A refund is handed to a person
const a2 = await ask(visitor, "I was charged twice, I want a refund");
ok("refund handed over", a2.includes("passed this to the team"), a2);
await visitor.waitForSelector("[data-testid=with-person]");
const mail = outbox().find((m) => m.to === AGENT);
ok("support inbox emailed", !!mail && mail.subject.startsWith("[Urgent]") && mail.text.includes("double charge") && mail.replyTo === "visitor@example.com", mail?.subject);
const link = mail.text.match(/https?:\/\/\S+\/support\/\S+/)?.[0];
ok("email links to the conversation", !!link, link);
await visitor.screenshot({ path: `${shots}/support-visitor.png` });

// 3. Before a person replies, the assistant keeps helping, and the team hears about it
const mailsBefore = outbox().length;
const a3b = await ask(visitor, "Also, how do I add a client?");
ok("assistant still answers while waiting for a person", a3b.includes("Clients page"), a3b);
ok("system note says it's already with the team", requests.at(-1).body.messages.some((m) => m.role === "system" && m.content.includes("already been passed to the team")));
ok("inbox told about the new message", outbox().slice(mailsBefore).some((m) => m.to === AGENT && m.subject.includes("(new message)")));

// 4. Not an agent: the inbox is hidden
const other = await (await browser.newContext()).newPage();
await other.goto(BASE + "/support");
await other.fill('input[name="email"]', `someone${Date.now()}@peak.com`);
await other.click("text=Continue");
await other.waitForURL("**/support");
await other.waitForSelector("text=Page not found");
ok("inbox hidden from customers", !(await other.textContent("body")).includes("visitor@example.com"));

// 5. The agent answers from the inbox
const agentCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const agent = await agentCtx.newPage();
await agent.goto(BASE + "/support");
await agent.fill('input[name="email"]', AGENT);
await agent.click("text=Continue");
await agent.waitForURL("**/support");
ok("inbox lists the ticket as urgent", (await agent.textContent("main")).includes("visitor@example.com") && (await agent.textContent("main")).toLowerCase().includes("urgent"));
await agent.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
ok("agent sees the summary", (await agent.textContent("main")).includes("Customer wants a refund"));
await agent.screenshot({ path: `${shots}/support-agent.png`, fullPage: true });
await agent.fill('textarea[aria-label="Your reply"]', "Sorry about that. I've refunded the second charge.");
await agent.click("text=Send reply by email");
await agent.waitForLoadState("networkidle");
const sent = outbox().find((m) => m.to === "visitor@example.com");
ok("customer emailed the reply", !!sent && sent.text.includes("refunded the second charge") && sent.text.includes("/help#t="));

// 6. The visitor sees it from the email link
const fromEmail = await (await browser.newContext()).newPage();
await fromEmail.goto(sent.text.match(/https?:\/\/\S+\/help#t=\S+/)[0].replace(/^https?:\/\/[^/]+/, BASE));
await fromEmail.waitForSelector("text=SureFrame team");
ok("reply shows in the chat", (await fromEmail.textContent("main")).includes("refunded the second charge"));
ok("summary never reaches the customer", !(await fromEmail.content()).includes("Customer wants a refund"));
ok("token removed from the address bar", !fromEmail.url().includes("#t="));
const callsBeforeFollowUp = requests.length;
const ack = await ask(fromEmail, "Thanks! Will it show on my statement?");
ok("after a person replies, follow-ups go to them", ack.includes("added that to your conversation") && requests.length === callsBeforeFollowUp, ack);
await fromEmail.screenshot({ path: `${shots}/support-help-page.png` });

// 7. A signed-in customer asks about their plan
const owner = await (await browser.newContext()).newPage();
await owner.goto(BASE + "/settings/billing");
await owner.fill('input[name="email"]', `plan${Date.now()}@peak.com`);
await owner.click("text=Continue");
await owner.waitForURL("**/settings/billing");
await owner.click("button:has-text('Help')");
ok("no email box when signed in", !(await owner.isVisible('input[aria-label="Your email"]')));
const a3 = await ask(owner, "What's my plan?");
ok("assistant reads the account", a3.includes("Free plan"), a3);

// 8. The assistant failing still reaches a person
const a4 = await ask(owner, "explode");
ok("failure hands over", a4.includes("passed your message to the team"), a4);

// 9. Validation
const bad = await fetch(BASE + "/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "" }) });
ok("empty message refused", bad.status === 400);
const missing = await fetch(BASE + "/api/support", { headers: { "x-support-token": "x".repeat(32) } });
ok("unknown conversation is 404", missing.status === 404);

// 10. Daily allowance: a visitor who isn't signed in gets 25 help-chat messages a day.
const prisma = new PrismaClient();
const day = 86_400_000;
await prisma.rateLimit.upsert({
  where: { key_windowStart: { key: "support-day:ip:127.0.0.1", windowStart: new Date(Math.floor(Date.now() / day) * day) } },
  create: { key: "support-day:ip:127.0.0.1", windowStart: new Date(Math.floor(Date.now() / day) * day), count: 25 },
  update: { count: 25 },
});
const over = await fetch(BASE + "/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "one more" }) });
ok("over the daily allowance: refused", over.status === 429, String(over.status));
ok("says to email instead", ((await over.json()).error ?? "").includes("today's limit"));
await prisma.rateLimit.deleteMany({ where: { key: "support-day:ip:127.0.0.1" } });
await prisma.$disconnect();

await browser.close();
fake.close();
