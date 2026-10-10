// Security regressions: redirects, mobile sign-in handoff, upload bounds, cron auth.
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${cond ? "" : ` ${extra}`}`);
  if (!cond) process.exitCode = 1;
};
const prisma = new PrismaClient();
await prisma.rateLimit.deleteMany();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const email = `sec${Date.now()}@example.com`;
await page.goto(BASE + "/login?next=/library");
await page.fill('input[name="email"]', email);
await page.click("text=Continue");
await page.waitForURL((u) => u.pathname === "/library");

// Open redirect after login.
for (const bad of ["/%5Cevil.com", "//evil.com", "/\\evil.com", "https://evil.com"]) {
  const res = await page.request.get(`${BASE}/login?next=${encodeURIComponent(bad).replace("%255C", "%5C")}`, { maxRedirects: 0 });
  const loc = res.headers()["location"] ?? "";
  ok(`login next=${bad} stays on site`, !/evil/.test(loc), loc);
}

// Mobile handoff: one-time code + PKCE, with a consent step.
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
await page.goto(`${BASE}/mobile/handoff?challenge=${challenge}`);
ok("handoff asks before signing the app in", !!(await page.waitForSelector("text=Sign in to the SureFrame app?", { timeout: 10000 }).catch(() => null)));
// The server action answers with a redirect to the app's scheme.
const appRedirect = (p) =>
  p.waitForResponse((r) => (r.headers()["x-action-redirect"] ?? "").startsWith("sureframe://"), { timeout: 10000 })
    .then((r) => r.headers()["x-action-redirect"].split(";")[0]);
const appUrl = appRedirect(page).catch(() => null);
await page.click("text=Continue to the app");
const back = await appUrl;
const code = back && new URL(back.replace("sureframe://", "https://x/")).searchParams.get("code");
ok("app receives a code, not a session token", !!code && !/token=/.test(back ?? ""), back ?? "no navigation");
const anon = await chromium.launch({ executablePath: process.env.CHROMIUM }).then((b) => b.newContext());
const ex = (body) => anon.request.post(BASE + "/api/mobile/exchange", { data: body });
ok("wrong verifier refused", (await ex({ code, verifier: crypto.randomBytes(32).toString("base64url") })).status() === 400);
const fresh = await (async () => {
  // A fresh tab: the first one is stuck on the app-scheme navigation.
  const tab = await page.context().newPage();
  await tab.goto(`${BASE}/mobile/handoff?challenge=${challenge}`, { waitUntil: "networkidle" });
  const u = appRedirect(tab);
  await tab.click("text=Continue to the app");
  return new URL((await u).replace("sureframe://", "https://x/")).searchParams.get("code");
})();
const good = await ex({ code: fresh, verifier });
const sess = await good.json();
ok("right verifier gets a session", good.ok() && sess.token?.length > 50, JSON.stringify(sess));
ok("code works only once", (await ex({ code: fresh, verifier })).status() === 400);
// Sign-ins end after 8 hours unused, for the app too: it has to send its last-activity time
// (the sf_active cookie) along with the session, or the API treats it as signed out.
const bare = await anon.request.get(BASE + "/api/clients", { headers: { cookie: `${sess.cookie}=${sess.token}` } });
ok("the app's session alone counts as signed out", bare.status() === 401);
const me = await anon.request.get(BASE + "/api/clients", { headers: { cookie: `${sess.cookie}=${sess.token}; sf_active=${Date.now()}` } });
ok("the app's session works on the API with its activity time", me.ok());
ok("handoff without a challenge refuses", await (async () => { await page.goto(`${BASE}/mobile/handoff`); return !!(await page.waitForSelector("text=Update the SureFrame app", { timeout: 10000 }).catch(() => null)); })());

// Upload bounds.
const v = await (await page.request.post(BASE + "/api/videos", { data: { mimeType: "video/webm" } })).json();
const vid = v.video?.id;
const huge = await page.request.post(`${BASE}/api/videos/${vid}/complete`, { data: { partCount: 2_000_000_000 } });
ok("absurd part count refused quickly", huge.status() === 400, String(huge.status()));

// A recording longer than the plan allows is refused when it completes.
const ws = (await prisma.membership.findFirst({ where: { user: { email } } })).workspaceId;
const fp = "f".repeat(32), wrap = "w".repeat(44);
await prisma.workspace.update({ where: { id: ws }, data: { keyFingerprint: fp } });
const newVideo = async () => (await (await page.request.post(BASE + "/api/videos", { data: { mimeType: "video/webm", teamKeyWrap: wrap, keyFingerprint: fp } })).json()).video.id;
const upload = (id, ch) => page.request.put(`${BASE}/api/videos/${id}/parts/1`, { data: Buffer.from(ch.repeat(1000)), headers: { "content-type": "application/octet-stream" } });
const longId = await newVideo();
await upload(longId, "x");
const tooLong = await page.request.post(`${BASE}/api/videos/${longId}/complete`, { data: { partCount: 1, durationMs: 3 * 60 * 60 * 1000 } });
ok("recording over the plan's length refused", tooLong.status() === 413, String(tooLong.status()));

// Once a client has replied, the video can't be moved to another client (their replies would go with it).
const [c1, c2] = await Promise.all(["Ann", "Ben"].map((name) => prisma.client.create({ data: { name, token: crypto.randomBytes(16).toString("hex"), workspaceId: ws } })));
const shortId = await newVideo();
await upload(shortId, "y");
await page.request.post(`${BASE}/api/videos/${shortId}/complete`, { data: { partCount: 1, durationMs: 2000 } });
const sendTo = (clientId) => page.request.patch(`${BASE}/api/videos/${shortId}`, { data: { clientId, clientKeyWrap: wrap, keyFingerprint: fp } });
ok("video sent to a client", (await sendTo(c1.id)).ok());
await prisma.reply.create({ data: { kind: "TEXT", body: "hi", authorName: "Ann", videoId: shortId } });
const moved = await sendTo(c2.id);
ok("after a reply, moving it to another client is refused", moved.status() === 409, String(moved.status()));
ok("the video stays with the first client", (await prisma.video.findUnique({ where: { id: shortId } })).clientId === c1.id);

// Cron needs the exact secret.
ok("cron refuses a wrong secret", (await anon.request.get(BASE + "/api/cron/purge", { headers: { authorization: "Bearer nope" } })).status() === 401);

await browser.close();
await prisma.$disconnect();
process.exit();
