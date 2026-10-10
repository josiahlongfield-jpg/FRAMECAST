// Drives a real Chromium with fake camera/mic through: sign in, record, stop,
// watch; then a crash mid-recording followed by automatic recovery.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const ctx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));

await page.goto(BASE + "/");
await page.screenshot({ path: `${shots}/landing.png`, fullPage: true });
await page.goto(BASE + "/pricing");
await page.screenshot({ path: `${shots}/pricing.png`, fullPage: true });

await page.goto(BASE + "/record");
await page.fill('input[name="email"]', `demo${Date.now()}@acme.com`);
await page.click("text=Continue");
await page.waitForURL("**/record");
await page.click("text=I've saved it"); // first device: recovery key shown once

// 1) Normal recording
await page.click("text=Camera only");
await page.click("text=Start recording");
await page.waitForSelector("text=/Recording · \\d/", { timeout: 15000 });
const t0 = Date.now(); await page.waitForTimeout(6000);
await page.screenshot({ path: `${shots}/recording.png` });
console.log("clicking stop after", Date.now() - t0, await page.textContent("text=/Recording · \\d/")); await page.click("button:has-text('Stop')");
await page.waitForURL("**/v/**", { timeout: 30000 });
const firstUrl = page.url();
await page.waitForSelector("main video", { timeout: 20000 });
const dur = await page.$eval("main video", (v) => new Promise((r) => {
  const check = () => (Number.isFinite(v.duration) ? r(v.duration) : setTimeout(check, 200));
  check();
  setTimeout(() => r(v.duration), 10000);
}));
console.log("watch url", firstUrl, "player duration", dur);
await page.fill('textarea[aria-label="Reply"]', "Looks great, ship it");
await page.click("button:has-text('Send reply')");
await page.waitForSelector("aside ul >> text=Looks great, ship it");
await page.screenshot({ path: `${shots}/watch.png` });

// 2) Crash mid-recording: record 25s (>5MB => at least one part uploaded), then kill the page.
await page.goto(BASE + "/record");
await page.click("text=Camera only");
await page.click("text=Start recording");
await page.waitForSelector("text=/Recording · \\d/", { timeout: 15000 });
await page.waitForTimeout(25000);
const status = await page.textContent("text=/Uploaded: /");
console.log("before crash:", status);
await page.close({ runBeforeUnload: false });

const page2 = await ctx.newPage();
await page2.goto(BASE + "/record");
await page2.waitForSelector("text=We finished uploading", { timeout: 30000 });
console.log("recovery banner shown");
await page2.screenshot({ path: `${shots}/recovered.png` });
const recoveredHref = await page2.getAttribute("text=View it", "href");
await page2.goto(BASE + recoveredHref);
await page2.waitForSelector("main video", { timeout: 20000 });
const dur2 = await page2.$eval("main video", (v) => new Promise((r) => {
  const check = () => (Number.isFinite(v.duration) ? r(v.duration) : setTimeout(check, 200));
  check();
  setTimeout(() => r(v.duration), 10000);
}));
console.log("recovered video duration", dur2);

await page2.goto(BASE + "/library");
await page2.screenshot({ path: `${shots}/library.png` });
await browser.close();
