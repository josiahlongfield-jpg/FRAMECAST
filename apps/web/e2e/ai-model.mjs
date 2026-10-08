// The self-hosted speech model for on-device transcripts: the founder's
// one-tap install (from a fake Hugging Face into a fake S3/R2 bucket), the
// /models route that only hands out installed files (as short-lived redirects
// to the bucket), and the real transcription worker checking every file's
// hash, keeping verified copies on the device and refusing a tampered file.
//
// Needs the app running with SUPPORT_EMAIL=owner@test.dev,
// HF_BASE_URL=http://localhost:12113 and the fake bucket:
//   S3_BUCKET=fc-test S3_ENDPOINT=http://localhost:12114 S3_REGION=auto
//   AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
// (this script starts both fakes). The fake model can't really transcribe, so
// a valid install still ends in "Transcript unavailable" here; what's checked
// is why it stopped.
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { startFakeHf, files, MODEL, REVISION, sha256, requests as hfRequests } from "./fake-hf.mjs";
import { startFakeS3, objects, log as s3Log } from "./fake-s3.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S3 = "http://localhost:12114/fc-test/";
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${cond ? "" : ` ${extra}`}`);
  if (!cond) process.exitCode = 1;
};
const prisma = new PrismaClient();
await prisma.rateLimit.deleteMany();
const hf = await startFakeHf();
// The bucket only allows the app's own origin (CORS), whichever port it runs on.
const s3 = await startFakeS3({ origins: [new URL(BASE).origin] });
const args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-webgpu"];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args });
const stamp = Date.now();
const perms = { permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"] };
const BAD = "The transcription model didn't download correctly.";
const model = (p) => `${BASE}/models/${p}`;
const prefix = `${MODEL}/${REVISION}/`;

async function signIn(context, email, next) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login?next=${next}`);
  await page.fill('input[name="email"]', email);
  await page.click("text=Continue");
  await page.waitForURL((u) => u.pathname === next, { timeout: 60000 });
  return page;
}
const install = (page, body) => page.request.post(`${BASE}/api/support/speech-model`, { data: body });

// ---------- 1. Only the founder ----------
const anon = await (await browser.newContext()).newPage();
// The fake bucket starts empty, but the app remembers a found manifest for 30 s (e.g. from a previous run).
for (let i = 0; i < 40 && (await anon.request.get(model("manifest.json"))).status() !== 404; i++) await anon.waitForTimeout(1000);
let res = await install(anon, { step: "plan" });
ok("signed out: install refused", res.status() === 401);
const userEmail = `model-user${stamp}@example.com`;
const userCtx = await browser.newContext(perms);
const user = await signIn(userCtx, userEmail, "/record");
res = await user.goto(`${BASE}/support/accounts`);
// With the app-wide loading screen the page streams, so the status can be 200 with the not-found page.
ok("non-founder: /support/accounts is not found", res.status() === 404 || !!(await user.waitForSelector("text=Page not found", { timeout: 15000 }).catch(() => null)));
ok("non-founder: no speech model panel", (await user.locator("[data-testid=speech-model]").count()) === 0);
for (const body of [{ step: "plan" }, { step: "file", revision: REVISION, name: "config.json" }, { step: "finish", revision: REVISION }]) {
  res = await install(user, body);
  ok(`non-founder: install step "${body.step}" refused`, res.status() === 404);
}
ok("non-founder: nothing downloaded or stored", hfRequests.length === 0 && objects.size === 0);

// ---------- 2. Before install ----------
res = await user.request.get(model("manifest.json"), { maxRedirects: 0 });
ok("not installed: /models/manifest.json is 404", res.status() === 404);
// A workspace with the add-on (given free), and a recording to transcribe.
await user.goto(`${BASE}/record`);
await user.click("text=I've saved it");
await prisma.workspace.updateMany({
  where: { members: { some: { user: { email: userEmail } } } },
  data: { plan: "SOLO", complimentaryPlan: "SOLO", aiAssist: true, aiAssistComplimentary: true },
});
await user.goto(`${BASE}/settings/billing`);
ok("billing says the speech model isn't installed", !!(await user.waitForSelector("[data-testid=ai-model-missing]", { timeout: 15000 }).catch(() => null)));
await user.goto(`${BASE}/record`);
await user.click("text=Camera only");
await user.click("text=Start recording");
await user.waitForSelector("text=/Recording · \\d/", { timeout: 15000 });
await user.waitForTimeout(3000);
await user.click("button:has-text('Stop')");
await user.waitForURL("**/v/**", { timeout: 30000 });
const videoId = user.url().split("/v/")[1].split("?")[0];
for (let i = 0; i < 100 && (await prisma.video.findUnique({ where: { id: videoId } })).status === "RECORDING"; i++) await user.waitForTimeout(200);
ok("recording stored in the bucket", [...objects.keys()].some((k) => !k.startsWith("models/")));
const warnings = [];
user.on("console", (m) => m.text().startsWith("Transcript unavailable:") && warnings.push(m.text()));
const browserUrls = [];
userCtx.on("request", (r) => browserUrls.push(r.url()));
await user.reload();
await user.waitForSelector("text=Make transcript and summary", { timeout: 30000 });
await user.click("text=Make transcript and summary");
await user.waitForSelector("[data-testid=ai-failed]", { timeout: 30000 });
ok("not installed: 'Transcript unavailable, try again'", (await user.textContent("[data-testid=ai-failed]")).includes("Transcript unavailable, try again"));
ok("not installed: says the speech model isn't installed", (await user.textContent("[data-testid=ai-failed]")).includes("speech model isn't installed"));

// ---------- 3. The founder installs it ----------
const founderCtx = await browser.newContext();
const founder = await signIn(founderCtx, "owner@test.dev", "/support/accounts");
await founder.waitForSelector("[data-testid=speech-model]");
ok("founder sees 'Not installed'", (await founder.textContent("[data-testid=speech-model-status]")).includes("Not installed"));

// Step by step through the API first, to see that nothing is live until the end.
res = await install(founder, { step: "plan" });
const plan = await res.json();
const wanted = Object.keys(files).sort();
ok("plan: resolves main to the exact revision", res.ok() && plan.revision === REVISION, JSON.stringify(plan).slice(0, 300));
ok("plan: the JSON files and the four ONNX files, nothing else", JSON.stringify(plan.files.map((f) => f.name).sort()) === JSON.stringify(wanted), JSON.stringify(plan.files));
res = await install(founder, { step: "file", revision: REVISION, name: "README.md" });
ok("a file outside the list is refused", res.status() === 502);
res = await install(founder, { step: "file", revision: "f".repeat(40), name: "config.json" });
ok("an unknown revision is refused", !res.ok());
res = await install(founder, { step: "finish", revision: REVISION });
ok("finish before the files are copied is refused", res.status() === 502 && !objects.has("models/manifest.json"));
for (const f of plan.files.slice(0, -1)) {
  res = await install(founder, { step: "file", revision: REVISION, name: f.name });
  const out = await res.json();
  ok(`copied ${f.name} with its sha256`, res.ok() && out.sha256 === sha256(files[f.name]) && out.bytes === files[f.name].length);
}
res = await founder.request.get(model("manifest.json"));
ok("half-finished install: still not live", res.status() === 404 && !objects.has("models/manifest.json"));
res = await founder.request.get(model(prefix + "config.json"), { maxRedirects: 0 });
ok("half-finished install: its files aren't served", res.status() === 404);
ok("big file uploaded in parts", s3Log.some((l) => l.key === `models/${prefix}onnx/encoder_model.onnx` && l.query === "partNumber,uploadId"));

// Then the button finishes it (skipping what's already copied).
const before = hfRequests.filter((p) => p.startsWith("/cdn/")).length;
await founder.click("text=Install speech model");
await founder.waitForSelector("text=/Installed version 0123456/", { timeout: 120000 });
ok("button copied only the missing file", hfRequests.filter((p) => p.startsWith("/cdn/")).length === before + 1);
await founder.waitForSelector("text=/Installed: version 0123456, 9 files/");
ok("status shows version, size and date", /Installed: version 0123456, 9 files, 43 MB, on \d+ \w+ \d{4}\./.test(await founder.textContent("[data-testid=speech-model-status]")), await founder.textContent("[data-testid=speech-model-status]"));
ok("downloads only at the exact revision", hfRequests.filter((p) => p.includes("/resolve/")).every((p) => p.includes(`/resolve/${REVISION}/`)));
const writes = s3Log.map((l, i) => ({ ...l, i })).filter((l) => l.method === "PUT" || l.method === "POST");
const manifestAt = writes.findLast((l) => l.key === "models/manifest.json").i;
ok("manifest written last", writes.filter((l) => l.key !== "models/manifest.json").every((l) => l.i < manifestAt));
const manifest = JSON.parse(objects.get("models/manifest.json").body);
ok("manifest: model, revision, date", manifest.model === MODEL && manifest.revision === REVISION && !isNaN(Date.parse(manifest.installedAt)));
ok("manifest: every file's sha256 and size", wanted.every((n) => manifest.files[n]?.sha256 === sha256(files[n]) && manifest.files[n].bytes === files[n].length) && Object.keys(manifest.files).length === wanted.length);
ok("stored files are byte-for-byte the originals", wanted.every((n) => objects.get(`models/${prefix}${n}`)?.body.equals(files[n])));
ok("skipped files aren't stored", !objects.has(`models/${prefix}README.md`) && !objects.has(`models/${prefix}onnx/encoder_model_fp16.onnx`));

// Re-running is safe.
res = await install(founder, { step: "plan" });
ok("re-run: everything already copied", (await res.json()).files.every((f) => f.done));
res = await install(founder, { step: "file", revision: REVISION, name: "onnx/decoder_model_merged_q4.onnx" });
ok("re-run: copying a file again gives the same hash", res.ok() && (await res.json()).sha256 === sha256(files["onnx/decoder_model_merged_q4.onnx"]));
res = await install(founder, { step: "finish", revision: REVISION });
ok("re-run: finish again", res.ok() && JSON.parse(objects.get("models/manifest.json").body).files["config.json"].sha256 === manifest.files["config.json"].sha256);

// ---------- 4. /models only hands out installed files ----------
res = await user.request.get(model("manifest.json"));
const served = await res.json();
ok("manifest.json served, not cached", res.ok() && served.revision === REVISION && res.headers()["cache-control"] === "no-store");
res = await user.request.get(model(prefix + "onnx/encoder_model.onnx"), { maxRedirects: 0 });
const location = res.headers()["location"] ?? "";
ok("listed file: 302 to a presigned bucket link", res.status() === 302 && location.startsWith(`${S3}models/${prefix}onnx/encoder_model.onnx?`) && location.includes("X-Amz-Expires=900"), location);
ok("redirect is never cached", res.headers()["cache-control"] === "no-store");
res = await user.request.get(location, { headers: { Origin: BASE } });
ok("bucket link gives the file, with CORS for the app", sha256(await res.body()) === sha256(files["onnx/encoder_model.onnx"]) && res.headers()["access-control-allow-origin"] === BASE);
for (const p of [
  `${prefix}README.md`,
  `${prefix}onnx/encoder_model_fp16.onnx`,
  `${MODEL}/${"f".repeat(40)}/config.json`,
  `${MODEL}/${REVISION}`,
  `.staging/${REVISION}/config.json.json`,
  `models/manifest.json`,
  `${prefix}%2E%2E/%2E%2E/manifest.json`,
  "videos/anything",
]) {
  res = await user.request.get(model(p), { maxRedirects: 0 });
  ok(`/models refuses ${p}`, res.status() === 404, String(res.status()));
}
await user.goto(`${BASE}/settings/billing`);
await user.waitForSelector("[data-testid=ai-assist]");
ok("billing no longer says it's missing", (await user.locator("[data-testid=ai-model-missing]").count()) === 0);

// ---------- 5. The worker: verified downloads, kept on the device ----------
const cacheKeys = () => user.evaluate(async () => (await (await caches.open("sureframe-models-v1")).keys()).map((r) => r.url));
const modelGets = () => s3Log.filter((l) => l.method === "GET" && l.key.startsWith(`models/${prefix}`)).length;
async function run() {
  warnings.length = 0;
  await user.goto(`${BASE}/v/${videoId}`);
  await user.waitForSelector("text=Make transcript and summary", { timeout: 30000 });
  await user.click("text=Make transcript and summary");
  await user.waitForSelector("[data-testid=ai-failed]", { timeout: 120000 });
  for (let i = 0; i < 20 && !warnings.length; i++) await user.waitForTimeout(100);
  return warnings.join(" ");
}
let why = await run();
const kept = await cacheKeys();
ok("valid model: gets past the hash checks", !why.includes(BAD) && !why.includes("isn't installed"), why);
ok("valid model: verified files kept on the device under /models URLs", kept.length >= 7 && kept.every((u) => u.startsWith(`${BASE}/models/${prefix}`)) && kept.some((u) => u.endsWith("config.json")), JSON.stringify(kept));
ok("valid model: fetched through the bucket redirect", modelGets() >= kept.length);
const gets = modelGets();
why = await run();
ok("second time: nothing downloaded again", modelGets() === gets && !why.includes(BAD), `${gets} -> ${modelGets()} ${why}`);

// A copy on the device that's been changed is thrown away and fetched again.
await user.evaluate(async (u) => (await caches.open("sureframe-models-v1")).put(u, new Response("not the model")), `${BASE}/models/${prefix}config.json`);
why = await run();
ok("changed copy on the device: refetched, not used", !why.includes(BAD) && modelGets() === gets + 1, why);

// A file in the bucket that doesn't match the manifest is refused.
objects.set(`models/${prefix}config.json`, { body: Buffer.from(JSON.stringify({ model_type: "whisper", tampered: true })), type: "application/json" });
await user.evaluate(() => caches.delete("sureframe-models-v1"));
why = await run();
ok("tampered file: worker refuses it", why.includes(BAD), why);
ok("tampered file: 'Transcript unavailable, try again'", (await user.textContent("[data-testid=ai-failed]")).includes("Transcript unavailable, try again"));
ok("tampered file: not kept on the device", !(await cacheKeys()).some((u) => u.endsWith("/config.json")));

const outside = browserUrls.filter((u) => /^https?:/.test(u) && !u.startsWith(`${BASE}/`) && !u.startsWith(S3));
ok("the browser only talked to the app and its bucket (no Hugging Face, no CDN)", browserUrls.length > 0 && outside.length === 0, JSON.stringify(outside.slice(0, 5)));
ok("model bytes came only via /models and the bucket", browserUrls.filter((u) => u.includes(MODEL)).every((u) => u.startsWith(`${BASE}/models/`) || u.startsWith(S3)));

await browser.close();
hf.close();
s3.close();
await prisma.$disconnect();
