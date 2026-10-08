// The microphone level bar on the recorder: it shows the fake microphone's
// beeps as "working", and warns when the microphone only gives silence.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp";
let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass ? "" : ` ${detail}`}`);
  if (!pass) failed++;
};

/** A few seconds of silent 16-bit mono WAV, for a microphone that hears nothing. */
function silentWav(path, seconds = 10, rate = 16000) {
  const data = rate * seconds * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(data, 40);
  writeFileSync(path, b);
}

async function open(extraArgs) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? undefined,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", ...extraArgs],
  });
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/record");
  await page.fill('input[name="email"]', `mic${Date.now()}@acme.com`);
  await page.click("text=Continue");
  await page.waitForURL("**/record");
  await page.click("text=I've saved it");
  return { browser, page };
}

// 1) A working microphone (Chromium's fake device beeps).
{
  const { browser, page } = await open([]);
  await page.waitForSelector("[data-testid=mic-level][data-state=heard]", { timeout: 15000 });
  ok("working mic: says it's working", await page.isVisible("text=Your microphone is working."));
  const width = await page.$eval("[data-testid=mic-level] div div", (el) => parseFloat(el.style.width) || 0);
  ok("working mic: bar moves", width > 0, `${width}`);
  await page.screenshot({ path: `${shots}/mic-level.png` });
  await page.click("text=Camera only");
  await page.click("text=Start recording");
  await page.waitForSelector("text=/Recording · \\d/", { timeout: 15000 });
  ok("bar is gone while recording", (await page.locator("[data-testid=mic-level]").count()) === 0);
  await browser.close();
}

// 2) A microphone that only gives silence.
{
  const wav = "/tmp/claude-0/silence.wav";
  silentWav(wav);
  const { browser, page } = await open([`--use-file-for-fake-audio-capture=${wav}`]);
  await page.waitForSelector("[data-testid=mic-level][data-state=listening]", { timeout: 15000 });
  await page.waitForSelector("[data-testid=mic-level][data-state=quiet]", { timeout: 15000 });
  ok("silent mic: warns it can't hear anything", await page.isVisible("text=/We can't hear anything yet/"));
  await page.screenshot({ path: `${shots}/mic-quiet.png` });
  await browser.close();
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
