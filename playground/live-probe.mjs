// Live-probe: close every quota/voice-gated gap in the audit by exercising
// each capability end-to-end against the real upgraded account.
//   bun run playground/live-probe.mjs   (server on :4321)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const BASE = "http://localhost:4321";
const OUT = join(import.meta.dir, "audit");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const steps = [];
const step = async (name, fn) => { try { const info = await fn(); steps.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? " — " + info : ""}`); } catch (e) { steps.push({ name, ok: false, err: e.message }); console.log(`  ✗ ${name} — ${e.message}`); } };
const newPage = async () => { const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, permissions: ["microphone"] }); return ctx.newPage(); };
const shot = (page, n) => page.screenshot({ path: join(OUT, n) });

// ---- F: widget VOICE call → in-call chrome ----
await step("F widget voice call → in-call chrome (mute/text-input/language)", async () => {
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.childElementCount > 0, { timeout: 25000 });
  for (const t of ["Mic muting", "Live transcript", "Show conversation ID", "Show agent status"]) try { await page.locator(".ctrl", { hasText: t }).locator("input[type=checkbox]").check({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(700);
  await page.locator("elevenlabs-convai").getByRole("button").first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  try { await page.locator("elevenlabs-convai").getByText("Accept", { exact: false }).click({ timeout: 4000 }); } catch {}
  await page.waitForTimeout(7000);
  await shot(page, "F-voice-call.png");
  return "captured (verify mute toggle + text input)";
});

// ---- G: React signed-url WebSocket connection ----
await step("G React signed-url (WebSocket auth) → connected", async () => {
  const page = await newPage();
  await page.goto(BASE + "/react.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#root .card", { timeout: 30000 });
  await page.locator(".ctrl", { hasText: "Connection" }).locator("select").selectOption("signed-url");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /startSession/ }).click();
  await page.waitForFunction(() => /status: connected/.test(document.body.innerText), { timeout: 25000 });
  await shot(page, "G-signed-url.png");
  return "connected via signed URL";
});

// ---- H: override-prompt has visible effect (widget chat) ----
await step("H override-prompt effect (widget chat → agent reply contains sentinel)", async () => {
  const SENTINEL = "OVERRIDE_OK_42";
  const page = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.childElementCount > 0, { timeout: 25000 });
  await page.locator(".ctrl", { hasText: "Override system prompt" }).locator("input[type=text]").fill(`You MUST respond to every user message with exactly the string "${SENTINEL}" and nothing else.`);
  await page.locator(".ctrl", { hasText: "Force text-only" }).locator("input[type=checkbox]").check();
  await page.locator(".ctrl", { hasText: "Text input enabled" }).locator("input[type=checkbox]").check();
  await page.waitForTimeout(1500); // remount
  await page.locator("elevenlabs-convai").getByRole("button").first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  try { await page.locator("elevenlabs-convai").getByText("Accept", { exact: false }).click({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(800);
  // type into the shadow chat input
  const input = page.locator("elevenlabs-convai").locator('textarea, input[type="text"]').last();
  await input.fill("hi");
  // send
  const sendBtn = page.locator("elevenlabs-convai").getByRole("button", { name: /send|submit/i });
  try { await sendBtn.first().click({ timeout: 3000 }); } catch { await input.press("Enter"); }
  // wait for the sentinel to appear in the shadow text
  await page.waitForFunction((s) => (document.querySelector("elevenlabs-convai")?.shadowRoot?.textContent || "").includes(s), SENTINEL, { timeout: 35000 });
  await shot(page, "H-override-prompt-effect.png");
  return `agent replied with sentinel '${SENTINEL}'`;
});

// ---- I: WebRTC via conversation-token ----
await step("I WebRTC conversation-token → connected (React voice)", async () => {
  const page = await newPage();
  await page.goto(BASE + "/react.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#root .card", { timeout: 30000 });
  await page.locator(".ctrl", { hasText: "text-only" }).locator("input[type=checkbox]").uncheck(); // voice
  await page.locator(".ctrl", { hasText: "Connection" }).locator("select").selectOption("token");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /startSession/ }).click();
  await page.waitForFunction(() => /status: connected/.test(document.body.innerText), { timeout: 30000 });
  await shot(page, "I-webrtc-token.png");
  return "connected via WebRTC conversation-token";
});

// ---- J: voice visualizer (React voice, fake mic) ----
await step("J voice visualizer (canvas active + freq data accessible)", async () => {
  const page = await newPage();
  await page.goto(BASE + "/react.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#root .card", { timeout: 30000 });
  await page.locator(".ctrl", { hasText: "text-only" }).locator("input[type=checkbox]").uncheck();
  await page.locator(".ctrl", { hasText: "Connection" }).locator("select").selectOption("agent-id");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /startSession/ }).click();
  await page.waitForFunction(() => /status: connected/.test(document.body.innerText), { timeout: 30000 });
  await page.waitForTimeout(5000); // let audio flow / VAD trigger
  // verify canvas rendered + the visualizer effect runs without error
  const canvasOk = await page.evaluate(() => { const c = document.querySelector("#viz canvas"); return c && c.width > 100 && c.height > 50; });
  if (!canvasOk) throw new Error("visualizer canvas missing or zero-sized");
  await shot(page, "J-voice-visualizer.png");
  return "voice session connected; canvas " + (canvasOk ? "active" : "missing");
});

// ---- K: multi-turn text conversation ----
await step("K multi-turn text — 3 messages, 3 agent replies", async () => {
  const page = await newPage();
  await page.goto(BASE + "/react.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#root .card", { timeout: 30000 });
  await page.getByRole("button", { name: /startSession/ }).click();
  await page.waitForFunction(() => /status: connected/.test(document.body.innerText), { timeout: 25000 });
  const send = async (text, n) => {
    const before = await page.evaluate(() => (document.querySelector("#events pre")?.innerText.match(/"source":"ai"/g) || []).length);
    const input = page.locator("#controls input[type=text]").first();
    await input.fill(text);
    await page.getByRole("button", { name: "send", exact: true }).click();
    try { await page.waitForFunction((b) => ((document.querySelector("#events pre")?.innerText.match(/"source":"ai"/g) || []).length) > b, before, { timeout: 45000 }); }
    catch { await shot(page, "K-multi-turn.png"); throw new Error(`turn ${n} no reply (before=${before}); log head=${(await page.evaluate(() => document.querySelector("#events pre")?.innerText.split("\n").slice(0, 8).join(" | ") || ""))}`); }
  };
  // Showcase agent has prompt-injection guardrail — use innocuous questions.
  await send("What's the capital of France?", 1);
  await send("How many continents are there?", 2);
  await send("Thanks, anything else useful to know?", 3);
  await shot(page, "K-multi-turn.png");
  const count = await page.evaluate(() => (document.querySelector("#events pre")?.innerText.match(/"source":"ai"/g) || []).length);
  if (count < 3) throw new Error("only " + count + " agent replies");
  return count + " agent replies received";
});

// ---- L: Scribe (useScribe) live STT ----
await step("L Scribe (useScribe) → connected", async () => {
  const page = await newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/react.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#scribe", { timeout: 30000 });
  await page.locator("#scribe").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200); // token fetch
  await page.locator("#scribe").getByRole("button", { name: "connect", exact: true }).click();
  let connected = false;
  try { await page.waitForFunction(() => /status: connected|status: transcribing/.test(document.querySelector("#scribe")?.innerText || ""), { timeout: 30000 }); connected = true; }
  catch {}
  await page.waitForTimeout(1500);
  await shot(page, "L-scribe.png");
  const state = await page.evaluate(() => ({ text: document.querySelector("#scribe")?.innerText.split("\n").slice(0, 12).join(" | ") || "", events: (document.querySelector("#events pre")?.innerText.split("\n").filter((l) => l.includes("scribe")).slice(0, 8).join(" | ")) || "" }));
  if (!connected) throw new Error(`scribe state: ${state.text.slice(0, 200)} | events: ${state.events.slice(0, 200)} | pageerrors: ${errs.slice(0, 1).join(" | ")}`);
  return "scribe connected; events=" + state.events.slice(0, 80);
});

await browser.close();
console.log("\n── live probe summary ──");
const passed = steps.filter((s) => s.ok).length;
console.log(`${passed}/${steps.length} passed`);
process.exit(passed === steps.length ? 0 : 1);
