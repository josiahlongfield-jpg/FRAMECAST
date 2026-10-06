// Two-way conversation: a coach adds a client, records a check-in and sends
// it to them. The client, on a phone-sized screen with no account, replies
// with text, voice and video; the coach answers back; an interrupted video
// reply is recovered. Also checks videos are private and seats are capped.
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp";
const args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args });

const finiteDuration = (el) => new Promise((r) => {
  const check = () => (Number.isFinite(el.duration) && el.duration > 0 ? r(el.duration) : setTimeout(check, 200));
  check();
  setTimeout(() => r(el.duration), 10000);
});

// Coach records a check-in video
const coachCtx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1360, height: 900 } });
const coach = await coachCtx.newPage();
await coach.goto(BASE + "/record");
await coach.fill('input[name="email"]', "coach@fitstudio.com");
await coach.click("text=Continue");
await coach.waitForURL("**/record");
await coach.click("text=Camera only");
await coach.click("text=Start recording");
await coach.waitForSelector("text=/Recording · \\d/", { timeout: 15000 });
await coach.waitForTimeout(4000);
await coach.click("button:has-text('Stop')");
await coach.waitForURL("**/v/**", { timeout: 30000 });
const link = coach.url().split("?")[0];
const rootId = link.split("/v/")[1];

// Nobody can watch before it is sent to a client
const strangerCtx = await browser.newContext();
const stranger = await strangerCtx.newPage();
await stranger.goto(link);
console.log("stranger sees:", await stranger.textContent("h1"));
console.log("stranger stream status", (await strangerCtx.request.get(`${BASE}/api/videos/${rootId}/stream`)).status());

// Add a client, send the video to them
const add = await coachCtx.request.post(`${BASE}/api/clients`, { data: { name: "Sam Client", email: "sam@example.com" } });
const sam = (await add.json()).client;
await coach.reload();
await coach.selectOption("select", { label: "Sam Client" });
await coach.waitForSelector("text=Copy Sam's link");
await coach.screenshot({ path: `${shots}/send-to-client.png` });
const personal = `${sam.link}?v=${rootId}`;
console.log("sent to client; personal link opens", personal.replace(/c\/[^?]+/, "c/<token>"));

// Client on a phone, not signed in
const clientCtx = await browser.newContext({ ...devices["Pixel 7"], permissions: ["camera", "microphone"] });
const client = await clientCtx.newPage();
client.on("console", (m) => m.type() === "error" && console.log("client console:", m.text()));
await client.goto(personal);
await client.waitForURL("**/v/**");
await client.fill('textarea[aria-label="Reply"]', "Felt strong on squats this week!");
await client.click("button:has-text('Send reply')");
await client.waitForSelector("aside ul >> text=Felt strong on squats this week!");
console.log("text reply sent");

await client.click("role=tab[name='Voice']");
await client.click("button:has-text('Record voice reply')");
await client.waitForSelector("text=/Recording · \\d/");
await client.waitForTimeout(3000);
await client.click("button:has-text('Stop and send')");
await client.waitForSelector("aside audio", { timeout: 30000 });
console.log("voice reply duration", await client.$eval("aside audio", finiteDuration));

await client.click("role=tab[name='Video']");
await client.click("button:has-text('Record video reply')");
await client.waitForSelector("text=/Recording · \\d/");
await client.waitForTimeout(4000);
await client.click("button:has-text('Stop and send')");
await client.waitForFunction(() => document.querySelectorAll("aside ul video").length === 1, null, { timeout: 30000 });
console.log("video reply duration", await client.$eval("aside ul video", finiteDuration));
await client.screenshot({ path: `${shots}/reply-phone.png`, fullPage: true });

// Interrupted video reply: close the tab mid-recording, reopen, it gets sent
await client.click("role=tab[name='Video']");
await client.click("button:has-text('Record video reply')");
await client.waitForSelector("text=/Recording · \\d/");
await client.waitForTimeout(5000);
await client.close({ runBeforeUnload: false });
const client2 = await clientCtx.newPage();
await client2.goto(link); // remembered on this device, no token in the URL
await client2.waitForFunction(() => document.querySelectorAll("aside ul video").length === 2, null, { timeout: 30000 });
console.log("interrupted reply recovered, video replies now", await client2.$$eval("aside ul video", (els) => els.length));

// Coach sees all replies and answers back
await coach.reload();
await coach.waitForSelector("text=Felt strong on squats this week!");
const counts = await coach.evaluate(() => ({
  audio: document.querySelectorAll("aside ul audio").length,
  video: document.querySelectorAll("aside ul video").length,
}));
console.log("coach sees", counts);
await coach.fill('textarea[aria-label="Reply"]', "Great work Sam. Watch your knees at the bottom.");
await coach.click("button:has-text('Send reply')");
await coach.waitForSelector("aside ul >> text=Watch your knees");
await coach.screenshot({ path: `${shots}/reply-coach.png` });

// Reply media must not show up in the coach's library
await coach.goto(BASE + "/library");
console.log("library cards", await coach.$$eval("main ul li", (els) => els.length));

// Seat limit: the Free plan includes 3 client seats
for (const n of ["Two", "Three"]) await coachCtx.request.post(`${BASE}/api/clients`, { data: { name: `Client ${n}` } });
const fourth = await coachCtx.request.post(`${BASE}/api/clients`, { data: { name: "Client Four" } });
console.log("4th client on Free plan:", fourth.status(), (await fourth.json()).error);
await coach.goto(BASE + "/clients");
await coach.screenshot({ path: `${shots}/clients.png`, fullPage: true });

// Removing a client cuts off their access straight away
await coachCtx.request.delete(`${BASE}/api/clients/${sam.id}`);
const after = await clientCtx.newPage();
await after.goto(link);
console.log("removed client sees:", await after.textContent("h1"));

// A made-up upload token cannot write to the coach's video
const forged = await clientCtx.request.put(`${BASE}/api/videos/${rootId}/parts/1`, { data: Buffer.alloc(10), headers: { "x-upload-token": "forged" } });
console.log("forged token upload", forged.status());
await browser.close();
