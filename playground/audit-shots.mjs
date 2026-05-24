// Capability-fidelity audit: capture states that prove each capability VISIBLY
// manifests in the real widget (not just that an attribute was set).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "http://localhost:4321";
const OUT = join(import.meta.dir, "audit");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const cfg = await (await fetch(BASE + "/api/config")).json();
const AGENT = cfg.showcaseAgentId;
const widgetReady = () => page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.childElementCount > 0, { timeout: 25000 });
const shot = (n) => page.screenshot({ path: join(OUT, n) });
const note = [];

async function fresh() {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await widgetReady();
  await page.evaluate(() => document.querySelectorAll(".card.collapsed h2").forEach((h) => h.click()));
  await page.waitForTimeout(800);
}

// 1) custom text-contents must appear on the trigger (variant=full shows main_label + start_call)
await fresh();
await page.locator('#text input[placeholder="Need help?"]').fill("AUDIT — custom label");
await page.locator('#text input[placeholder="Start a call"]').fill("AUDIT — begin");
await page.waitForTimeout(1000);
await shot("A-text-contents.png");
note.push("A text-contents: filled main_label + start_call — trigger should read 'AUDIT — custom label' / 'AUDIT — begin'");

// 2) avatar image must replace the orb
await fresh();
await page.locator('.ctrl', { hasText: "Avatar image URL" }).locator("input[type=text]").fill("https://avatars.githubusercontent.com/u/79276999");
await page.waitForTimeout(1500);
await shot("B-avatar-image.png");
note.push("B avatar-image-url: set to a real image — trigger avatar should be the image, not the orb");

// 3) server styles must visibly recolor the widget (PATCH accent → pink), via real API
await page.evaluate((a) => fetch(`/api/widget/${a}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ styles: { accent: "#ff0066", accent_primary: "#ffffff", base: "#0b0e14", base_primary: "#ffffff" } }) }), AGENT);
await page.waitForTimeout(1500);
await fresh();
await shot("C-styles-accent.png");
note.push("C styles PATCH: accent=#ff0066 base=dark — trigger 'Start a call' button + sheet should be pink/dark");

// 4) text-only must change the trigger to chat ('Start a chat')
await fresh();
await page.locator('.ctrl', { hasText: "Force text-only" }).locator("input[type=checkbox]").check();
await page.waitForTimeout(1200);
await shot("D-text-only.png");
note.push("D override-text-only: trigger should read 'Start a chat' (chat mode, no mic)");

// 5) expandable variant opened
await fresh();
await page.locator('.ctrl', { hasText: "Variant" }).locator("select").selectOption("expandable");
await page.waitForTimeout(800);
const trig = page.locator("elevenlabs-convai").getByRole("button").first();
try { await trig.click({ timeout: 6000 }); } catch {}
await page.waitForTimeout(2000);
await shot("E-expandable-open.png");
note.push("E variant=expandable opened — expanded sheet (terms modal or chat panel)");

// restore styles to defaults so the showcase agent isn't left pink
await page.evaluate((a) => fetch(`/api/widget/${a}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ styles: { accent: "#000000", accent_primary: "#ffffff", base: "#ffffff", base_primary: "#000000" } }) }), AGENT);

await browser.close();
console.log("pageerrors:", errs.length, errs.slice(0, 5));
note.forEach((n) => console.log(" •", n));
console.log("\nshots in playground/audit/");
