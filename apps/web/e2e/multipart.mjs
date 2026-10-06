// API-level check of the resumable upload protocol: out-of-order parts,
// a retried (duplicate) part, a missing-part rejection, then a clean finish.
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
await page.goto(BASE + "/login");
await page.fill('input[name="email"]', "api@acme.com");
await page.click("text=Continue");
await page.waitForURL("**/library");
const r = page.request;
const { video } = await (await r.post(BASE + "/api/videos", { data: { mimeType: "video/webm" } })).json();
const a = Buffer.alloc(1000, 97), b = Buffer.alloc(500, 98), c = Buffer.alloc(200, 99);
console.log("part2", (await r.put(`${BASE}/api/videos/${video.id}/parts/2`, { data: b })).status());
console.log("part1", (await r.put(`${BASE}/api/videos/${video.id}/parts/1`, { data: Buffer.alloc(10, 120) })).status());
console.log("part1 retry", (await r.put(`${BASE}/api/videos/${video.id}/parts/1`, { data: a })).status());
const missing = await r.post(`${BASE}/api/videos/${video.id}/complete`, { data: { partCount: 3 } });
console.log("complete w/ missing", missing.status(), await missing.text());
await r.put(`${BASE}/api/videos/${video.id}/parts/3`, { data: c });
const done = await r.post(`${BASE}/api/videos/${video.id}/complete`, { data: { partCount: 3, durationMs: 1234 } });
console.log("complete", done.status(), JSON.stringify((await done.json()).video.sizeBytes));
const body = await (await r.get(`${BASE}/api/videos/${video.id}/stream`)).body();
const ok = body.length === 1700 && body.subarray(0, 1000).every((x) => x === 97) && body.subarray(1000, 1500).every((x) => x === 98) && body.subarray(1500).every((x) => x === 99);
console.log("bytes", body.length, "assembled correctly:", ok);
const range = await r.get(`${BASE}/api/videos/${video.id}/stream`, { headers: { Range: "bytes=995-1004" } });
console.log("range", range.status(), range.headers()["content-range"], (await range.body()).toString());
const anon = await (await browser.newPage()).request.put(`${BASE}/api/videos/${video.id}/parts/1`, { data: a });
console.log("anonymous upload", anon.status());
await browser.close();
