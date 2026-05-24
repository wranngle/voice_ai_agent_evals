// Probe the LIVE-only surface: start a real call (fake mic) and capture the
// in-call widget chrome (mute, transcript, conversation-id, agent status), plus
// a signed-url connection. Reports what the account quota actually allows now.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "http://localhost:4321";
const OUT = join(import.meta.dir, "audit");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, permissions: ["microphone"] });
const page = await ctx.newPage();
const log = [];
page.on("console", (m) => { if (/quota|error|denied|fail/i.test(m.text())) log.push("console:" + m.text().slice(0, 120)); });

// --- 1) widget voice call → in-call chrome ---
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.childElementCount > 0, { timeout: 25000 });
// enable in-call UI toggles
for (const t of ["Mic muting", "Live transcript", "Show conversation ID", "Show agent status"]) {
  try { await page.locator(".ctrl", { hasText: t }).locator("input[type=checkbox]").check({ timeout: 3000 }); } catch {}
}
await page.waitForTimeout(800);
// open + accept terms + start
try { await page.locator("elevenlabs-convai").getByRole("button").first().click({ timeout: 6000 }); } catch {}
await page.waitForTimeout(1200);
try { await page.locator("elevenlabs-convai").getByText("Accept", { exact: false }).click({ timeout: 4000 }); } catch (e) { log.push("no terms/accept: " + e.message.slice(0, 60)); }
await page.waitForTimeout(8000); // let it connect or fail
await page.screenshot({ path: join(OUT, "F-voice-call.png") });
const shadowText = await page.evaluate(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.textContent?.replace(/\s+/g, " ").slice(0, 300) || "");
log.push("widget in-call shadow text: " + shadowText);

// --- 2) signed-url connection via React island (text-only, cheap) ---
await page.goto(BASE + "/react.html", { waitUntil: "networkidle" });
await page.waitForSelector("#root .card", { timeout: 30000 });
await page.locator(".ctrl", { hasText: "Connection" }).locator("select").selectOption("signed-url");
await page.waitForTimeout(500);
await page.getByRole("button", { name: /startSession/ }).click();
try {
  await page.waitForFunction(() => /status: connected/.test(document.body.innerText), { timeout: 20000 });
  log.push("signed-url connection: CONNECTED ✅");
} catch { log.push("signed-url connection: did not connect — " + (await page.evaluate(() => document.querySelector("#events pre")?.innerText.slice(0, 200) || ""))); }
await page.screenshot({ path: join(OUT, "G-signed-url.png") });

await browser.close();
console.log("── live probe ──");
log.forEach((l) => console.log(" •", l));
