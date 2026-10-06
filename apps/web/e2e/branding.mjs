// Custom branding on paid plans. Run against a server using the fake Stripe
// (same env as billing.mjs).
import { chromium } from "@playwright/test";
import { deflateSync } from "node:zlib";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { start, state, createSubscription } from "./fake-stripe.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${cond ? "" : ` ${extra}`}`);
  if (!cond) process.exitCode = 1;
};
const prisma = new PrismaClient();
await prisma.rateLimit.deleteMany();
const server = await start();
const sig = new Stripe("sk_test_fake");

// A 40x20 solid-colour PNG as the "logo".
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(h).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
await page.goto(BASE + "/login?next=/settings/branding");
await page.fill('input[name="email"]', `brand${Date.now()}@example.com`);
await page.click("text=Continue");
await page.waitForURL((u) => u.pathname === "/settings/branding");
ok("Free plan sees an upgrade prompt", await page.isVisible("text=Custom branding is part of Pro and Business"));
const denied = await page.request.post(BASE + "/api/workspace/branding", { multipart: { color: "#0f766e" } });
ok("Free plan can't save branding", denied.status() === 402);

// Upgrade to Pro through the fake Stripe.
const { url } = await (await page.request.post(BASE + "/api/billing/checkout", { data: { plan: "PRO" } })).json();
const session = state.sessions.at(-1).params;
const sub = createSubscription(session.customer, session.subscription_data.metadata.workspaceId, "sureframe_pro_monthly");
const payload = JSON.stringify({ id: "evt_b", object: "event", type: "customer.subscription.created", data: { object: sub } });
await page.request.post(BASE + "/api/webhooks/stripe", { headers: { "stripe-signature": sig.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" }), "content-type": "application/json" }, data: payload });
ok("upgraded", !!url);

await page.goto(BASE + "/settings/branding");
await page.fill('input[aria-label="Colour code"]', "#f1f5f9");
ok("too-light colour explained", await page.isVisible("text=too light for white button text"));
ok("and can't be saved", await page.isDisabled("text=Save branding"));
await page.click('button[aria-label="Use #0f766e"]');
await page.setInputFiles('input[type="file"]', { name: "logo.png", mimeType: "image/png", buffer: png(40, 20, [15, 118, 110]) });
await page.click("text=Save branding");
await page.waitForSelector("text=Saved. Your clients see this now.");
ok("branding saved", true);
const big = await page.request.post(BASE + "/api/workspace/branding", { multipart: { logo: { name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(400 * 1024) } } });
ok("oversized logo refused", big.status() === 413);
const svg = await page.request.post(BASE + "/api/workspace/branding", { multipart: { logo: { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") } } });
ok("SVG refused (can carry scripts)", svg.status() === 400);

// A client's view wears the branding.
const res = await page.request.post(BASE + "/api/clients", { data: { name: "Riley", teamKeyWrap: "x".repeat(44) } });
const { client } = await res.json();
const cpage = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await cpage.goto(client.link);
await cpage.waitForURL("**/inbox**");
const style = await cpage.getAttribute("div.min-h-screen", "style");
ok("client page uses the brand colour", /--color-brand-600:\s*#0f766e/.test(style ?? ""), style);
const logoSrc = await cpage.getAttribute("header img", "src");
ok("client page shows the logo", !!logoSrc);
const logo = await cpage.request.get(BASE + logoSrc);
ok("logo served as an image, cached", logo.headers()["content-type"] === "image/png" && /immutable/.test(logo.headers()["cache-control"] ?? ""));
ok("business name shown", /workspace/.test(await cpage.textContent("header")));
await cpage.screenshot({ path: `${process.argv[2] ?? "/tmp"}/branded-inbox.png` });

// Downgrading hides it again without losing it.
sub.status = "canceled";
const p2 = JSON.stringify({ id: "evt_c", object: "event", type: "customer.subscription.deleted", data: { object: sub } });
await page.request.post(BASE + "/api/webhooks/stripe", { headers: { "stripe-signature": sig.webhooks.generateTestHeaderString({ payload: p2, secret: "whsec_test" }), "content-type": "application/json" }, data: p2 });
await cpage.reload();
ok("on Free, clients see plain SureFrame again", !(await cpage.getAttribute("div.min-h-screen", "style"))?.includes("#0f766e") && !(await cpage.isVisible("header img")));

await browser.close();
server.close();
await prisma.$disconnect();
