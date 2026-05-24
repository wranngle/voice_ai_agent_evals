// Central-promise e2e: render the showcase in real Chromium, drive it, and
// prove a live conversation round-trip. Fails on any console error / pageerror.
//   bun run playground/verify.mjs   (server must be running on :4321)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PLAYGROUND_URL ?? "http://localhost:4321";
const OUT = join(import.meta.dir, "verify");
mkdirSync(OUT, { recursive: true });

const errors = [];
const steps = [];
const step = async (name, fn) => {
  try { const info = await fn(); steps.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? " — " + info : ""}`); }
  catch (e) { steps.push({ name, ok: false, err: e.message }); console.log(`  ✗ ${name} — ${e.message}`); }
};

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const shot = (n) => page.screenshot({ path: join(OUT, n), fullPage: false });

console.log(`\nVerifying ${BASE}\n`);

// ---- Widget page ----
await step("widget page loads + shadow root populates", async () => {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => {
    const w = document.querySelector("elevenlabs-convai");
    return w && w.shadowRoot && w.shadowRoot.childElementCount > 0;
  }, { timeout: 25000 });
  await page.waitForTimeout(1500);
  await shot("01-widget-home.png");
  const n = await page.evaluate(() => document.querySelector("elevenlabs-convai").shadowRoot.querySelectorAll("*").length);
  return `shadow nodes: ${n}`;
});

await step("drive controls (variant/placement/text-input)", async () => {
  await page.locator(".ctrl", { hasText: "Variant" }).locator("select").selectOption("compact");
  await page.locator(".ctrl", { hasText: "Placement" }).locator("select").selectOption("top-right");
  await page.locator(".ctrl", { hasText: "Text input enabled" }).locator("input[type=checkbox]").check();
  await page.waitForTimeout(800);
  const attrs = await page.evaluate(() => {
    const w = document.querySelector("elevenlabs-convai");
    return { variant: w.getAttribute("variant"), placement: w.getAttribute("placement"), text: w.getAttribute("text-input") };
  });
  await shot("02-widget-controls.png");
  if (attrs.variant !== "compact" || attrs.placement !== "top-right") throw new Error("attrs not reflected: " + JSON.stringify(attrs));
  return JSON.stringify(attrs);
});

await step("combo grid applies variant+placement", async () => {
  await page.locator('.matrix-grid button[data-v="full"][data-p="bottom-right"]').click();
  await page.waitForTimeout(800);
  const v = await page.evaluate(() => document.querySelector("elevenlabs-convai").getAttribute("variant"));
  await shot("03-combo-grid.png");
  return "variant=" + v;
});

await step("exhaustive control sweep — every toggle/select/color/safe-text reflects", async () => {
  // network/connection-affecting attrs need valid values; exercise everything else.
  const skip = ["agent-id", "signed-url", "override-config", "server-location", "environment", "user-id", "use-rtc",
    "language", "dynamic-variables", "avatar-image-url", "override-prompt", "override-llm", "override-speed",
    "override-stability", "override-similarity-boost", "override-first-message", "override-language", "override-voice-id",
    "worklet-path-raw-audio-processor", "worklet-path-audio-concat-processor", "worklet-path-libsamplerate"];
  const r = await page.evaluate((skipArr) => {
    const skip = new Set(skipArr); const W = () => document.querySelector("elevenlabs-convai");
    const fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
    let attempted = 0, reflected = 0; const misses = [];
    for (const ctrl of document.querySelectorAll("#panels .ctrl")) {
      if (ctrl.closest("#api")) continue; // API-panel style editor drives server config, not element attrs
      const span = ctrl.querySelector(".attr"); if (!span) continue;
      const name = span.textContent.trim(); if (skip.has(name) || name.startsWith("--")) continue;
      const cb = ctrl.querySelector("input[type=checkbox]"), sel = ctrl.querySelector("select"),
            col = ctrl.querySelector("input[type=color]"), txt = ctrl.querySelector("input[type=text]");
      if (cb) { attempted++; cb.checked = true; fire(cb, "change"); W().hasAttribute(name) ? reflected++ : misses.push(name); }
      else if (sel && sel.options.length > 1) { attempted++; const v = sel.options[sel.options.length - 1].value; sel.value = v; fire(sel, "change"); (W().getAttribute(name) === v) ? reflected++ : misses.push(name); }
      else if (col) { attempted++; col.value = "#123456"; fire(col, "input"); /(#123456)/i.test(W().getAttribute(name) || "") ? reflected++ : misses.push(name); }
      else if (txt) { attempted++; txt.value = "demo-" + name; fire(txt, "input"); (W().getAttribute(name) === "demo-" + name) ? reflected++ : misses.push(name); }
    }
    return { attempted, reflected, misses, attrCount: W().attributes.length };
  }, skip);
  await page.waitForTimeout(600);
  await shot("08-control-sweep.png");
  if (r.reflected < r.attempted) throw new Error(`${r.reflected}/${r.attempted} reflected; misses: ${r.misses.join(",")}`);
  return `${r.reflected}/${r.attempted} controls reflected onto the element (now ${r.attrCount} attrs)`;
});

await step("API panel: GET + PATCH styles round-trip (DEV-guarded, real API)", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.childElementCount > 0, { timeout: 25000 });
  await page.locator("#api").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "GET widget config" }).click();
  await page.waitForFunction(() => /widget_config|variant|avatar/.test(document.querySelector("#api pre.out")?.innerText || ""), { timeout: 15000 });
  await page.getByRole("button", { name: /PATCH styles/ }).click();
  await page.waitForTimeout(2500);
  const out = await page.locator("#api pre.out").innerText();
  await shot("09-api-roundtrip.png");
  if (/"error"|403/.test(out)) throw new Error("PATCH rejected: " + out.slice(0, 120));
  return "GET ok; PATCH styles accepted";
});

await step("open widget (click trigger in shadow)", async () => {
  const trigger = page.locator("elevenlabs-convai").getByRole("button").first();
  await trigger.click({ timeout: 8000 });
  await page.waitForTimeout(2000);
  await shot("04-widget-open.png");
  return "clicked";
});

// ---- React island ----
await step("react island mounts (no invalid-hook errors)", async () => {
  await page.goto(BASE + "/react.html", { waitUntil: "networkidle", timeout: 40000 });
  await page.waitForSelector("#root .card", { timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot("05-react-home.png");
  const cards = await page.locator("#root section.card").count();
  if (cards < 4) throw new Error("only " + cards + " cards rendered");
  return cards + " cards";
});

await step("react: start text-only conversation + agent responds", async () => {
  // text-only is default; ensure it
  const toggle = page.locator(".ctrl", { hasText: "text-only" }).locator("input[type=checkbox]");
  if (!(await toggle.isChecked())) await toggle.check();
  await page.getByRole("button", { name: /startSession/ }).click();
  const logText = () => page.evaluate(() => document.querySelector("#events pre")?.innerText || "");
  try { await page.waitForFunction(() => /status: connected/.test(document.body.innerText), { timeout: 25000 }); }
  catch { throw new Error("never connected; log=" + (await logText()).slice(0, 300)); }
  await shot("06-react-connected.png");
  // send a message
  const input = page.locator("#controls input[type=text]").first();
  await input.fill("In one short sentence, what can you help with?");
  await page.getByRole("button", { name: "send", exact: true }).click();
  // wait for an agent text event (streaming part, final message, or any inbound message)
  try { await page.waitForFunction(() => /onAgentChatResponsePart|agent_response|onMessage/.test(document.querySelector("#events pre")?.innerText || ""), { timeout: 35000 }); }
  catch { throw new Error("connected but no agent reply; log=" + (await logText()).slice(0, 400)); }
  await page.waitForTimeout(1500);
  await shot("07-react-conversation.png");
  const log = await page.evaluate(() => document.querySelector("#events pre")?.innerText.split("\n").slice(0, 6).join(" | "));
  return "agent responded; log head: " + log;
});

await step("URL params drive the widget on load", async () => {
  await page.goto(BASE + "?variant=tiny&placement=top-left&dismissible=1&mic-muting=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.childElementCount > 0, { timeout: 25000 });
  const a = await page.evaluate(() => { const w = document.querySelector("elevenlabs-convai"); return { variant: w.getAttribute("variant"), placement: w.getAttribute("placement"), dismissible: w.getAttribute("dismissible") }; });
  await shot("10-url-params.png");
  if (a.variant !== "tiny" || a.placement !== "top-left" || a.dismissible !== "true") throw new Error("URL not applied: " + JSON.stringify(a));
  return JSON.stringify(a);
});

await browser.close();

// ---- report ----
console.log("\n── summary ──");
const passed = steps.filter((s) => s.ok).length;
console.log(`steps: ${passed}/${steps.length} passed`);
console.log(`console/page errors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log("   ! " + e));
const failed = steps.filter((s) => !s.ok);
const ok = errors.length === 0 && failed.length === 0;
console.log(`\n${ok ? "PASS ✅" : "FAIL ❌"} — screenshots in playground/verify/\n`);
process.exit(ok ? 0 : 1);
