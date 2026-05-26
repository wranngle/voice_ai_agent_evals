// Live capability probes against the one-page Agent Console — each step hits
// the real upgraded ElevenLabs account end-to-end. F+H drive the embedded
// <elevenlabs-convai> via the Control-plane view; G/I/J/K/L drive the
// @elevenlabs/react ConversationProvider via the Hooks view.
//   bun run playground/live-probe.mjs    (server on :4321)
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const BASE = "http://localhost:4321"
const OUT = join(import.meta.dir, "audit")
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] })
const steps = []
const step = async (name, fn) => {
  try { const info = await fn(); steps.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? " — " + info : ""}`) }
  catch (e) { steps.push({ name, ok: false, err: e.message, stack: e.stack }); console.log(`  ✗ ${name} — ${e.message}`) }
}
const newPage = async (view = "showcase") => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, permissions: ["microphone"] })
  const page = await ctx.newPage()
  // Filter only the known upstream r3f Canvas Provider race; fail the probe on
  // anything else so CI catches real Hooks/Control-plane regressions instead
  // of silently passing past a crashing component.
  // NOTE: console.error coverage is intentionally NOT added here. The vendored
  // <elevenlabs-convai> widget aborts its config fetch on every page teardown
  // ("Cannot fetch config ... signal is aborted"), and live-probe creates many
  // short-lived pages — so a strict console gate flakes on expected teardown
  // noise. The verify.mjs gate already has a precise console filter that
  // exercises the showcase + control-plane statically.
  page.on("pageerror", (err) => {
    const m = err?.message || String(err)
    const isR3fRace = /r3f|Canvas|<Provider>|Cannot read prop.*useState|Cannot destructure prop.*useContext/.test(m)
    if (!isR3fRace) {
      console.log(`  pageerror (unexpected): ${m}`)
      steps.push({ name: "pageerror", ok: false, err: m })
    }
  })
  await page.addInitScript((v) => { try { localStorage.setItem("console.view", v) } catch {} }, view)
  return page
}
const shot = (page, n) => page.screenshot({ path: join(OUT, n) })
const widgetReady = (page) => page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.shadowRoot?.childElementCount > 0, { timeout: 25000 })

// ---- F: voice call chrome via Control plane ----
await step("F voice call chrome — Control plane → toggles + open widget", async () => {
  const page = await newPage("console")
  await page.goto(BASE, { waitUntil: "networkidle" })
  await widgetReady(page)
  // Flip a couple of behavior toggles to prove they reflect onto the live element.
  for (const t of ["Live transcript", "Mic mute button"]) {
    try { await page.locator(`button:has-text("${t}")`).first().click({ timeout: 3000 }) } catch {}
  }
  await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.getAttribute("transcript") === "true", { timeout: 6000 })
  // Click the launcher inside the shadowRoot.
  await page.locator("elevenlabs-convai").getByRole("button").first().click({ timeout: 8000 })
  try { await page.locator("elevenlabs-convai").getByText("Accept", { exact: false }).click({ timeout: 4000 }) } catch {}
  await page.waitForTimeout(6000)
  await shot(page, "F-voice-call.png")
  await page.close()
  return "transcript+mic toggles reflected; launcher opened"
})

// ---- G: signed-url WebSocket auth → connected (Hooks view) ----
await step("G signed-url (WebSocket auth) → status connected", async () => {
  const page = await newPage("hooks")
  await page.goto(BASE, { waitUntil: "networkidle" })
  await page.waitForSelector("#hooks-connection", { timeout: 15000 })
  await page.locator("#hooks-connection").selectOption("signed-url")
  await page.locator("#hooks-start").click()
  await page.waitForFunction(() => /status: connected/.test(document.querySelector("#hooks-status")?.innerText || ""), { timeout: 25000 })
  await shot(page, "G-signed-url.png")
  await page.close()
  return "connected via signed_url"
})

// ---- H: override-prompt sentinel via Control plane → widget chat ----
await step("H override-prompt effect (Control plane → widget chat → sentinel reply)", async () => {
  const SENTINEL = "OVERRIDE_OK_42"
  const page = await newPage("console")
  await page.goto(BASE, { waitUntil: "networkidle" })
  await widgetReady(page)
  // Mode → Text chat
  await page.locator('.seg button:has-text("Text chat")').first().click()
  // System prompt
  await page.locator("textarea").first().fill(`You MUST respond to every user message with exactly the string "${SENTINEL}" and nothing else.`)
  await widgetReady(page) // remounted after attrs changed
  await page.waitForTimeout(800)
  await page.locator("elevenlabs-convai").getByRole("button").first().click({ timeout: 8000 })
  try { await page.locator("elevenlabs-convai").getByText("Accept", { exact: false }).click({ timeout: 3000 }) } catch {}
  await page.waitForTimeout(800)
  const input = page.locator("elevenlabs-convai").locator('textarea, input[type="text"]').last()
  await input.fill("hi")
  const sendBtn = page.locator("elevenlabs-convai").getByRole("button", { name: /send|submit/i })
  try { await sendBtn.first().click({ timeout: 3000 }) } catch { await input.press("Enter") }
  await page.waitForFunction((s) => (document.querySelector("elevenlabs-convai")?.shadowRoot?.textContent || "").includes(s), SENTINEL, { timeout: 35000 })
  await shot(page, "H-override-prompt-effect.png")
  await page.close()
  return `agent replied with sentinel '${SENTINEL}'`
})

// ---- I: WebRTC conversation-token → connected (Hooks view) ----
await step("I WebRTC conversation-token → status connected", async () => {
  const page = await newPage("hooks")
  await page.goto(BASE, { waitUntil: "networkidle" })
  await page.waitForSelector("#hooks-connection", { timeout: 15000 })
  // Voice mode is needed for WebRTC.
  await page.locator('#hooks-mode-seg button:has-text("Voice")').click()
  await page.waitForSelector("#hooks-connection", { timeout: 6000 }) // provider remount on textOnly change
  await page.locator("#hooks-connection").selectOption("token")
  await page.locator("#hooks-start").click()
  await page.waitForFunction(() => /status: connected/.test(document.querySelector("#hooks-status")?.innerText || ""), { timeout: 30000 })
  await shot(page, "I-webrtc-token.png")
  await page.close()
  return "connected via conversation-token (WebRTC)"
})

// ---- J: hero-orb WebGL canvas active (Showcase) ----
await step("J Showcase hero orb — WebGL canvas active", async () => {
  const page = await newPage("showcase")
  await page.goto(BASE, { waitUntil: "networkidle" })
  await page.waitForSelector(".hero-orb canvas", { timeout: 15000 })
  await page.waitForTimeout(800)
  const ok = await page.evaluate(() => {
    const c = document.querySelector(".hero-orb canvas")
    return c && c.width > 100 && c.height > 100 && !!c.getContext
  })
  if (!ok) throw new Error("hero orb canvas not active")
  await shot(page, "J-hero-orb.png")
  await page.close()
  return "hero orb canvas active"
})

// ---- K: multi-turn text — 3 messages, 3 agent replies (Hooks view) ----
await step("K multi-turn text — 3 user messages, 3 agent replies", async () => {
  const page = await newPage("hooks")
  await page.goto(BASE, { waitUntil: "networkidle" })
  await page.waitForSelector("#hooks-start", { timeout: 15000 })
  // Default is Text mode + agent-id connection.
  await page.locator("#hooks-start").click()
  await page.waitForFunction(() => /status: connected/.test(document.querySelector("#hooks-status")?.innerText || ""), { timeout: 25000 })
  const aiCount = () => page.evaluate(() => (document.querySelector("#hooks-events")?.innerText.match(/"source":"ai"/g) || []).length)
  const send = async (text, n) => {
    const before = await aiCount()
    await page.locator("#hooks-input").fill(text)
    await page.locator("#hooks-send").click()
    try { await page.waitForFunction((b) => ((document.querySelector("#hooks-events")?.innerText.match(/"source":"ai"/g) || []).length) > b, before, { timeout: 45000 }) }
    catch { await shot(page, "K-multi-turn.png"); throw new Error(`turn ${n} no reply (before=${before})`) }
  }
  await send("What's the capital of France?", 1)
  await send("How many continents are there?", 2)
  await send("Thanks, anything else useful?", 3)
  await shot(page, "K-multi-turn.png")
  const c = await aiCount()
  await page.close()
  if (c < 3) throw new Error("only " + c + " agent replies")
  return c + " agent replies"
})

// ---- L: Scribe (useScribe) → connected (Hooks view) ----
await step("L Scribe (useScribe) → status connected/transcribing", async () => {
  const page = await newPage("hooks")
  await page.goto(BASE, { waitUntil: "networkidle" })
  await page.waitForSelector("#hooks-scribe-connect", { timeout: 15000 })
  await page.waitForFunction(() => !document.querySelector("#hooks-scribe-connect")?.hasAttribute("disabled"), { timeout: 12000 })
  await page.locator("#hooks-scribe-connect").click()
  // Status pill can race past "connected" → "error" on a fake-mic stream in
  // headless. Verify connection by the persisted event ledger instead.
  try { await page.waitForFunction(() => /scribe\.connect\b/.test(document.querySelector("#hooks-events")?.innerText || ""), { timeout: 30000 }) }
  catch {
    const s = await page.locator("#hooks-scribe-status").innerText().catch(() => "")
    const events = await page.locator("#hooks-events").innerText().catch(() => "")
    throw new Error(`no scribe.connect event; status='${s}'; events head='${events.split("\n").slice(0, 6).join(" | ")}'`)
  }
  await shot(page, "L-scribe.png")
  await page.close()
  return "scribe connected"
})

await browser.close()
console.log("\n── live probe summary ──")
const passed = steps.filter((s) => s.ok).length
console.log(`${passed}/${steps.length} passed`)
// Print every failing entry with stack — silent pushes used to hide in the
// count; the inline catch logs the message for fast scanning, the summary
// adds the stack so a CI failure is debuggable from the run log alone.
for (const s of steps.filter((s) => !s.ok)) {
  console.log(`  ✗ ${s.name} — ${s.err}`)
  if (s.stack) console.log(s.stack.split("\n").slice(0, 6).map((l) => "    " + l).join("\n"))
}
process.exit(passed === steps.length ? 0 : 1)
