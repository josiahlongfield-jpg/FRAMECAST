// Billing and account controls against a fake Stripe (e2e/fake-stripe.mjs).
// Start the app with:
//   STRIPE_SECRET_KEY=sk_test_fake STRIPE_API_BASE=http://localhost:12111 STRIPE_WEBHOOK_SECRET=whsec_test
import { chromium } from "@playwright/test";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { start, state, createSubscription } from "./fake-stripe.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ok = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
};
// Earlier runs share this machine's IP; start with fresh rate-limit windows.
const prisma = new PrismaClient();
await prisma.rateLimit.deleteMany();
await prisma.$disconnect();
const server = await start();
const sig = new Stripe("sk_test_fake");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
const email = `bill${Date.now()}@example.com`;
await page.goto(BASE + "/login?next=/settings/billing");
await page.fill('input[name="email"]', email);
await page.click("text=Continue");
await page.waitForURL((u) => u.pathname === "/settings/billing");

const api = (path, data) => page.request.post(BASE + path, { data });
async function webhook(type, sub, secret = "whsec_test") {
  const payload = JSON.stringify({ id: `evt_${Date.now()}`, object: "event", type, data: { object: sub } });
  const header = sig.webhooks.generateTestHeaderString({ payload, secret });
  return page.request.post(BASE + "/api/webhooks/stripe", { headers: { "stripe-signature": header, "content-type": "application/json" }, data: payload });
}
const planText = async () => {
  await page.goto(BASE + "/settings/billing");
  return page.textContent("main");
};

// 1) Checkout creates the catalog on first use and uses Managed Payments.
let res = await api("/api/billing/checkout", { plan: "PRO" });
const { url } = await res.json();
ok("checkout returns a Stripe URL", res.ok() && url?.startsWith("https://checkout.stripe.test"));
const session = state.sessions.at(-1).params;
const proPrice = state.prices.find((p) => p.id === session.line_items[0].price);
ok("Pro price has the right amount", proPrice?.lookup_key === "sureframe_pro_monthly" && proPrice?.unit_amount === 1200 && proPrice.recurring?.interval === "month");
ok("product uses the SaaS tax code", state.products.find((p) => p.id === proPrice.product)?.tax_code === "txcd_10103001");
ok("checkout uses Managed Payments", session.managed_payments?.enabled === "true" && !session.automatic_tax);
ok("checkout charges the Pro price once", session.line_items[0].price === proPrice.id && session.line_items[0].quantity === "1");
const workspaceId = session.subscription_data.metadata.workspaceId;

res = await api("/api/billing/checkout", { plan: "PRO" });
ok("prices are reused, not duplicated", state.prices.filter((p) => p.lookup_key === "sureframe_pro_monthly").length === 1);

// 2) Stripe confirms the subscription.
const sub = createSubscription(session.customer, workspaceId, "sureframe_pro_monthly");
ok("bad webhook signature refused", (await webhook("customer.subscription.created", sub, "whsec_wrong")).status() === 400);
ok("webhook accepted", (await webhook("customer.subscription.created", sub)).ok());
ok("billing page shows Pro", /Pro plan/.test(await planText()) && /Renews/.test(await page.textContent("main")));

// 3) Extra client seats and cloud backup ride on the same subscription.
res = await api("/api/billing/seats", { extraSeats: 3 });
const seatItem = sub.items.data.find((i) => i.price.lookup_key === "sureframe_client_seat_monthly");
ok("extra seats added to the subscription", res.ok() && seatItem?.quantity === 3 && seatItem.price.unit_amount === 200);
res = await api("/api/billing/backup", { enabled: true });
ok("cloud backup added", res.ok() && sub.items.data.some((i) => i.price.lookup_key === "sureframe_cloud_backup_monthly"));
await webhook("customer.subscription.updated", sub);

// 4) Upgrading switches the plan in place instead of opening a second checkout.
const sessionsBefore = state.sessions.length;
res = await api("/api/billing/checkout", { plan: "BUSINESS" });
const up = await res.json();
ok("upgrade goes straight back to billing", res.ok() && up.url.endsWith("/settings/billing?upgraded=1") && state.sessions.length === sessionsBefore);
ok("plan item switched to Business", sub.items.data.some((i) => i.price.lookup_key === "sureframe_business_monthly") && !sub.items.data.some((i) => i.price.lookup_key === "sureframe_pro_monthly"));
ok("seats kept through the upgrade", sub.items.data.find((i) => i.price.lookup_key === "sureframe_client_seat_monthly")?.quantity === 3);
await webhook("customer.subscription.updated", sub);
ok("billing page shows Business", /Business plan/.test(await planText()));

// 5) Customer portal.
res = await api("/api/billing/portal");
const portal = await res.json();
ok("portal opens with our configuration", res.ok() && portal.url && state.portalConfigs.length === 1);

// 6) Cancelling drops to Free; a stale event for an old subscription can't undo a newer one.
sub.status = "canceled";
await webhook("customer.subscription.deleted", sub);
ok("cancelled subscription returns to Free", /Free plan/.test(await planText()));
const sub2 = createSubscription(session.customer, workspaceId, "sureframe_pro_monthly");
await webhook("customer.subscription.created", sub2);
await webhook("customer.subscription.deleted", sub);
ok("old subscription's events don't override the new one", /Pro plan/.test(await planText()));

// 7) Data export.
res = await page.request.get(BASE + "/api/account/export");
const exp = await res.json();
ok("export downloads as a file", /attachment/.test(res.headers()["content-disposition"] ?? ""));
ok("export has the account and workspace", exp.user?.email === email && exp.workspaces?.[0]?.workspace?.id === workspaceId);

// 8) Account deletion.
await page.goto(BASE + "/settings/account");
await page.fill('input[name="confirm"]', "someone@else.com");
await page.click("text=Delete my account");
await page.waitForURL("**error=confirm**");
ok("wrong confirmation refused", !!(await page.waitForSelector("text=doesn't match your email", { timeout: 5000 }).catch(() => null)));
await page.fill('input[name="confirm"]', email);
await page.click("text=Delete my account");
await page.waitForURL((u) => u.pathname === "/");
ok("deleting cancels billing in Stripe", state.deletedCustomers.includes(session.customer));
await page.goto(BASE + "/settings/billing");
ok("signed out after deletion", page.url().includes("/login"));

// 9) Rate limits.
let limited = false;
for (let i = 0; i < 25 && !limited; i++) limited = (await page.request.post(BASE + "/api/billing/portal")).status() === 429;
ok("billing endpoints are rate limited", limited);

await browser.close();
server.close();
