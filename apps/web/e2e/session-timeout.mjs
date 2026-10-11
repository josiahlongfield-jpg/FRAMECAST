// Sign-ins end when the browser is closed, or after a long stretch of no use,
// without cutting off API calls (uploads, replies) already under way.
import { chromium } from "@playwright/test";
import { agreed } from "./agree.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass ? "" : ` ${detail}`}`);
  if (!pass) failed++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + "/record");
const loginEmail = `timeout${Date.now()}@acme.com`;
await agreed(loginEmail);
await page.fill('input[name="email"]', loginEmail);
await page.click("text=Continue");
await page.waitForURL("**/record");
await page.click("text=I've saved it").catch(() => {});

await page.goto(BASE + "/library");
ok("signed in: library opens", new URL(page.url()).pathname === "/library");
const marker = (await ctx.cookies()).find((c) => c.name === "sf_active");
ok("activity cookie is a browser-session cookie", marker?.expires === -1, JSON.stringify(marker));

// A second tab in the same open browser stays signed in.
const tab = await ctx.newPage();
await tab.goto(BASE + "/library");
ok("new tab in the open browser stays signed in", new URL(tab.url()).pathname === "/library");
await tab.close();

// "Close the browser": a new browser keeps only cookies with an expiry date.
const kept = (await ctx.cookies()).filter((c) => c.expires !== -1);
ok("the 30-day session cookie is still there", kept.some((c) => c.name.includes("session-token")));
const reopened = await browser.newContext();
await reopened.addCookies(kept);
const p2 = await reopened.newPage();
await p2.goto(BASE + "/library");
// The page streams in, so the redirect to sign in can land just after load.
await p2.waitForURL("**/login**", { timeout: 15000 }).catch(() => {});
ok("after closing the browser: sent to sign in", new URL(p2.url()).pathname === "/login", p2.url());
ok("sign-in page explains why", await p2.isVisible("[data-testid=signed-out-note]"));
ok("session cookie deleted", !(await reopened.cookies()).some((c) => c.name.includes("session-token")));
await p2.goto(BASE + "/library");
await p2.waitForURL("**/login**", { timeout: 15000 }).catch(() => {});
ok("stays signed out", new URL(p2.url()).pathname === "/login");
await reopened.close();

// Browser closed, then an API address typed in directly: signed out there too.
const closedApi = await browser.newContext();
await closedApi.addCookies((await ctx.cookies()).filter((c) => c.name !== "sf_active"));
const exp = await closedApi.request.get(BASE + "/api/account/export");
ok("after closing the browser: API calls are signed out", exp.status() === 401, String(exp.status()));
ok("and that clears the old session", !(await closedApi.cookies()).some((c) => c.name.includes("session-token")));
await closedApi.close();

// Idle for longer than the limit: an API call doesn't bring the session back,
// and the next page load is signed out.
const idle = await browser.newContext();
await idle.addCookies((await ctx.cookies()).map((c) => (c.name === "sf_active" ? { ...c, value: String(Date.now() - 9 * 3_600_000) } : c)));
const p3 = await idle.newPage();
const api = await (await idle.request.get(BASE + "/api/auth/session")).json();
ok("idle: API calls are signed out", !api?.user, JSON.stringify(api));
await p3.goto(BASE + "/library");
await p3.waitForURL("**/login**", { timeout: 15000 }).catch(() => {});
ok("idle over 8 hours: next page load signs out", new URL(p3.url()).pathname === "/login", p3.url());
await idle.close();

// Recent activity keeps you in.
const active = await browser.newContext();
const hourAgo = String(Date.now() - 3_600_000);
await active.addCookies((await ctx.cookies()).map((c) => (c.name === "sf_active" ? { ...c, value: hourAgo } : c)));
// A background check (new replies) works but doesn't count as using the site.
const bg = await (await active.request.get(BASE + "/api/auth/session", { headers: { "x-sf-background": "1" } })).json();
ok("background check while active: still signed in", !!bg?.user, JSON.stringify(bg));
ok("background check doesn't extend the session", (await active.cookies()).find((c) => c.name === "sf_active")?.value === hourAgo);
const fg = await (await active.request.get(BASE + "/api/auth/session")).json();
ok("a normal API call while active works", !!fg?.user);
ok("and counts as activity", (await active.cookies()).find((c) => c.name === "sf_active")?.value !== hourAgo);
const p4 = await active.newPage();
await p4.goto(BASE + "/library");
await p4.waitForTimeout(2000);
ok("used within the last 8 hours: still signed in", new URL(p4.url()).pathname === "/library", p4.url());

// Signing in again works normally and starts a fresh session.
const again = await browser.newContext();
const p5 = await again.newPage();
await p5.goto(BASE + "/login");
ok("plain visit to sign-in has no signed-out note", !(await p5.isVisible("[data-testid=signed-out-note]")));

await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
