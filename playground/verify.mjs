// Central-promise e2e for the one-page Agent Console: load /, prove the
// Showcase, Control plane, and Hooks in-page views work end-to-end, drive a
// real <elevenlabs-convai> in the control plane, and exit non-zero on any
// console or page error. Run with the playground server up on :4321.
//   bun run playground/verify.mjs
import { chromium } from "playwright";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const BASE = process.env.PLAYGROUND_URL ?? "http://localhost:4321";
const OUT = join(import.meta.dir, "verify");
mkdirSync(OUT, { recursive: true });

const errors = [];
const steps = [];
const step = async (name, fn) => {
  try { const info = await fn(); steps.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? " — " + info : ""}`); }
  catch (e) { steps.push({ name, ok: false, err: e.message, stack: e.stack }); console.log(`  ✗ ${name} — ${e.message}`); }
};

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
// Known vendored elevenlabs/ui dev-warnings — enumerated EXPLICITLY rather than
// blanket-swallowing every "Warning:" line, so a new React warning from our own
// code still fails the run. (The old `startsWith("Warning:")` swallow hid a real
// styled-jsx bug where scoped <style jsx> never applied.) React passes the
// attribute/component name as printf %s args, not in m.text(), so resolve args.
const VENDOR_WARNINGS = [
  // Radix <Button asChild> wraps a function component that doesn't forwardRef.
  (s) => /Function components cannot be given refs/.test(s),
  // elevenlabs/ui SpeechInput passes inert={true}; React 18 treats `inert` as a
  // non-boolean DOM attr. The button still renders inert correctly — cosmetic.
  (s) => /non-boolean attribute/.test(s) && /\binert\b/.test(s),
];
const pendingConsole = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  pendingConsole.push(
    Promise.all(m.args().map((a) => a.jsonValue().catch(() => "")))
      .then((args) => {
        const full = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
        if (full.startsWith("Warning:") && VENDOR_WARNINGS.some((re) => re(full))) return;
        // r3f's Canvas Provider error-boundary companion line is also noise.
        if (/^The above error occurred in the .*Provider.* component/.test(full)) return;
        errors.push("console: " + m.text());
      })
      .catch(() => {})
  );
});
// @react-three/fiber's internal Canvas Provider intermittently throws
// "Cannot read properties of null (reading 'addEventListener')" when the 8
// simultaneously-mounted Looks-rail orbs tear down during a view switch — it's
// a known r3f race (events.connect targeting a null DOM node mid-unmount).
// Filter only that exact signature; any other null-deref still fails the run.
// The error only originates from r3f's Canvas Provider in this app — we
// audited every component for direct .addEventListener-on-null patterns and
// there are none, so matching the message alone is precise here. (If a real
// null-deref of this exact text appears elsewhere later, the same step that
// triggers it will likely also break a step assertion or a different error.)
const R3F_RACE = /Cannot read properties of null \(reading 'addEventListener'\)/;
page.on("pageerror", (e) => {
  if (R3F_RACE.test(e.message)) return;
  errors.push("pageerror: " + e.message);
});
const shot = (n) => page.screenshot({ path: join(OUT, n), fullPage: false });

// Start clean: the App persists last view in localStorage; we want Showcase
// first. Use addInitScript so the value lands BEFORE the first nav — a second
// goto() to set localStorage caused @react-three/fiber's Canvas Provider to
// race on the first-mount unmount (intermittent "Cannot read properties of
// null (reading 'addEventListener')").
await page.addInitScript(() => {
  try { localStorage.setItem("console.view", "showcase"); } catch {}
});
const fresh = async (path = "/") => {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
};
const goView = async (label) => {
  await page.locator(".nav-item", { hasText: label }).first().click();
  await page.waitForTimeout(400);
};

console.log(`\nVerifying ${BASE}\n`);

await step("/ serves the one-page console (gallery.html)", async () => {
  const r = await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  if (!r || r.status() >= 400) throw new Error("HTTP " + (r ? r.status() : "no response"));
  const title = await page.title();
  if (!/Agent Console/i.test(title)) throw new Error("unexpected title: " + title);
  await shot("01-home.png");
  return title;
});

await step("Showcase view: hero + 3 rails render", async () => {
  await fresh();
  await page.waitForSelector(".rail-head", { timeout: 15000 });
  const counts = await page.evaluate(() => ({
    heroOrb: !!document.querySelector(".hero-orb canvas"),
    railHeads: document.querySelectorAll(".rail-head").length,
    orbTiles: document.querySelectorAll(".orb-tile").length,
    openLive: document.querySelectorAll("button.deeplink").length,
    componentTiles: document.querySelectorAll(".card .badge").length,
  }));
  await shot("02-showcase.png");
  if (!counts.heroOrb) throw new Error("hero orb canvas missing");
  if (counts.railHeads < 3) throw new Error("expected 3 rails, got " + counts.railHeads);
  if (counts.orbTiles < 6) throw new Error("Looks: only " + counts.orbTiles + " orb tiles");
  if (counts.openLive < 6) throw new Error("Capabilities: only " + counts.openLive + " Open-live buttons");
  if (counts.componentTiles < 17) throw new Error("Components: only " + counts.componentTiles + " tiles");
  return JSON.stringify(counts);
});

await step("Showcase boots cleanly: JSONL terminal has console.boot", async () => {
  // The Terminal is React-rendered with the live ring; wait for at least one event.
  await page.waitForFunction(() => {
    const meta = document.querySelector(".term-meta");
    const m = (meta?.textContent || "").match(/(\d+) events/);
    return m && parseInt(m[1], 10) > 0;
  }, { timeout: 8000 });
  const meta = await page.locator(".term-meta").innerText();
  const hasBoot = await page.evaluate(() => /console\.boot/.test(document.querySelector(".term-b")?.innerText || ""));
  if (!hasBoot) throw new Error("no console.boot in terminal: " + (await page.locator(".term-b").innerText()).slice(0, 200));
  return meta.slice(0, 60);
});

await step("Capability deep-link: 'Text chat' opens Control plane in-page with mode=text", async () => {
  await fresh();
  await page.waitForSelector("button.deeplink", { timeout: 10000 });
  // Each capability tile now has two .deeplink buttons (Hear sample, Open live);
  // target Open live explicitly so the test doesn't accidentally play audio.
  const tile = page.locator(".card", { hasText: "Text chat" }).first();
  await tile.locator("button.deeplink", { hasText: /Open live/ }).click();
  await page.waitForSelector(".view-head", { timeout: 5000 });
  await page.waitForTimeout(800);
  const head = await page.locator(".view-head .title").first().innerText();
  if (!/Tune it/i.test(head)) throw new Error("did not switch to Control plane: " + head);
  const modeText = await page.locator(".seg button.sel", { hasText: "Text chat" }).count();
  if (!modeText) throw new Error("preset not applied — mode != Text chat");
  await shot("03-deeplink.png");
  return head;
});

await step("Control plane: live <elevenlabs-convai> shadowRoot populates", async () => {
  await page.waitForFunction(() => {
    const w = document.querySelector("elevenlabs-convai");
    return w && w.shadowRoot && w.shadowRoot.childElementCount > 0;
  }, { timeout: 25000 });
  const n = await page.evaluate(() => document.querySelector("elevenlabs-convai").shadowRoot.querySelectorAll("*").length);
  await shot("04-widget-live.png");
  if (n < 3) throw new Error("shadow nodes: " + n);
  return "shadow nodes: " + n;
});

await step("Knob reflects: change variant → attribute updates on the element", async () => {
  // Click 'compact' in the Variant seg, then read the element attr.
  await page.locator(".seg button", { hasText: /^compact$/ }).click();
  await page.waitForTimeout(500);
  // The widget remounts on every config change; wait for it back.
  await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.getAttribute("variant") === "compact", { timeout: 8000 });
  const placement = await page.evaluate(() => document.querySelector("elevenlabs-convai")?.getAttribute("placement"));
  return "variant=compact, placement=" + placement;
});

await step("Behavior toggle: 'Live transcript' on → transcript=true on element", async () => {
  await page.getByRole("button", { name: /Live transcript/ }).click();
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.querySelector("elevenlabs-convai")?.getAttribute("transcript") === "true", { timeout: 6000 });
  return "transcript=true reflected";
});

await step("Sidebar round-trip: Control plane → Showcase → Control plane (no reload)", async () => {
  const startUrl = page.url();
  await goView("Showcase");
  await page.waitForSelector(".rail-head", { timeout: 5000 });
  if (page.url() !== startUrl) throw new Error("URL changed across in-page nav: " + page.url());
  await goView("Control plane");
  await page.waitForSelector(".stage", { timeout: 5000 });
  await shot("05-roundtrip.png");
  return "no page loads";
});

await step("Capability sample: 'Hear it' plays the TTS clip", async () => {
  // Placed after the control-plane sequence so it doesn't disrupt the
  // deeplink → control-plane view chain those steps rely on.
  await fresh(); // Showcase
  await page.waitForSelector("button.deeplink", { timeout: 10000 });
  const hear = page.locator("button.deeplink", { hasText: /Hear it/ }).first();
  await hear.click(); // user gesture → play() resolves
  await page.waitForTimeout(900);
  const state = await page.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? { paused: a.paused, src: (a.currentSrc || a.src), time: a.currentTime } : null;
  });
  if (!state) throw new Error("no <audio> element rendered in a capability tile");
  if (!/\/sounds\/capabilities\/.+\.mp3$/.test(state.src)) throw new Error("audio src not a capability sample: " + state.src);
  // console.sample is logged inside play().then(); a warn-level entry = play() rejected.
  const sample = await page.evaluate(() => {
    const txt = document.querySelector(".term-b")?.innerText || "";
    return { logged: /console\.sample/.test(txt), warned: /warn\s+console\.sample/.test(txt) };
  });
  if (!sample.logged) throw new Error("no console.sample event after Hear-it click");
  if (sample.warned) throw new Error("play() rejected (warn console.sample): " + JSON.stringify(state));
  if (state.paused && state.time === 0) throw new Error("audio neither playing nor advanced: " + JSON.stringify(state));
  await shot("06-capability-audio.png");
  return `playing ${state.src.split("/").pop()}`;
});

await step("Legacy routes 302 → /", async () => {
  const r = await page.context().request.get(BASE + "/widget.html", { maxRedirects: 0 });
  if (r.status() !== 302) throw new Error("/widget.html returned " + r.status() + " (expected 302)");
  const loc = r.headers()["location"];
  if (loc !== "/") throw new Error("redirected to " + loc + " (expected /)");
  return "302 → /";
});

await step("JSONL log endpoint accepts events", async () => {
  const r = await page.context().request.post(BASE + "/api/log", { data: { events: [{ channel: "verify.smoke", msg: "ok", level: "info" }] } });
  if (r.status() !== 200) throw new Error("POST /api/log → " + r.status());
  const body = await r.json();
  if (!body.ok) throw new Error("body: " + JSON.stringify(body));
  return body.file;
});

await step("/api/log preserves client-emit ts (browser-origin truth)", async () => {
  // Doctrine-guard for the fix that stopped /api/log from overwriting the
  // client's ts. Per src/internal/jsonl-trace.ts, ts is origin time; the
  // browser is the emitter for these events, so a server-side toISOString()
  // erases the ~350ms client-flush + RTT shift. Two paths:
  //   1. valid ISO from client → preserved verbatim
  //   2. missing/invalid ts → server-time fallback (so legacy callers still work)
  const fs = await import("node:fs");
  const date = new Date().toISOString().slice(0, 10);
  const file = `logs/voice-evals-${date}.jsonl`;
  const clientTs = "2020-01-02T03:04:05.678Z"; // far past → can't be confused with server time
  const tag = "verify.ts-guard." + Date.now();
  const r = await page.context().request.post(BASE + "/api/log", { data: { events: [
    { ts: clientTs, channel: tag + ".valid", msg: "ok", level: "info" },
    { ts: "not-iso", channel: tag + ".invalid", msg: "ok", level: "info" },
    { channel: tag + ".missing", msg: "ok", level: "info" },
  ] } });
  if (r.status() !== 200) throw new Error("POST → " + r.status());
  // Tail the file and find our 3 tagged lines.
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n").filter((l) => l.includes(tag)).map((l) => JSON.parse(l));
  const got = Object.fromEntries(lines.map((e) => [e.channel.split(".").pop(), e.ts]));
  if (got.valid !== clientTs) throw new Error("valid ISO not preserved: " + got.valid);
  if (got.invalid === "not-iso") throw new Error("invalid ts not rejected");
  if (!/^\d{4}-/.test(got.missing || "")) throw new Error("missing-ts fallback failed: " + got.missing);
  return "valid preserved · invalid+missing fall back to server time";
});

await step("DEV-guarded widget PATCH round-trip — real ElevenLabs API", async () => {
  // The showcase agent is [DEV], so the governance guard permits PATCH. The
  // server forwards the PATCH body as platform_settings.widget partial; the
  // live shape exposes color knobs as widget_config.btn_color etc. (no styles
  // wrapper). Round-trip a sentinel btn_color through and restore it.
  const cfg = await page.context().request.get(BASE + "/api/config");
  const agent = (await cfg.json()).showcaseAgentId;
  if (!agent) throw new Error("no showcaseAgentId in /api/config");
  const get = await page.context().request.get(BASE + "/api/widget/" + agent);
  if (get.status() !== 200) throw new Error("GET widget → " + get.status());
  const before = (await get.json())?.widget_config ?? {};
  const priorBtn = before.btn_color ?? "#000000";
  const sentinel = "#ff00aa";
  const patch = await page.context().request.fetch(BASE + "/api/widget/" + agent, { method: "PATCH", data: { btn_color: sentinel } });
  if (patch.status() !== 200) throw new Error("PATCH sentinel → " + patch.status() + " body=" + (await patch.text()).slice(0, 120));
  const back = (await (await page.context().request.get(BASE + "/api/widget/" + agent)).json())?.widget_config;
  if (back?.btn_color !== sentinel) throw new Error("btn_color not persisted: got " + back?.btn_color);
  const restore = await page.context().request.fetch(BASE + "/api/widget/" + agent, { method: "PATCH", data: { btn_color: priorBtn } });
  if (restore.status() !== 200) throw new Error("restore PATCH → " + restore.status());
  return `GET → PATCH btn_color=${sentinel} → verified → restored ${priorBtn}`;
});

await step("Governance: every agent's mutable flag matches [DEV]-only doctrine", async () => {
  const agents = await (await page.context().request.get(BASE + "/api/agents")).json();
  if (!Array.isArray(agents) || agents.length === 0) throw new Error("no agents from /api/agents");
  // Doctrine: mutable IFF phase is DEV (prefix-less resolves to DEV). Any other
  // prefix ([TEMPLATE]/[PROD]/…) must be mutable:false.
  const wrong = agents.filter((a) => a.mutable !== (a.phase === "DEV"));
  if (wrong.length) throw new Error("mutable⇎[DEV] for: " + JSON.stringify(wrong.slice(0, 3).map((a) => ({ phase: a.phase, mutable: a.mutable, name: a.name }))));
  return `${agents.length} agents, all mutable ⇔ [DEV]`;
});

await step("Governance deny-path: PATCH a governed (non-DEV) agent → 403", async () => {
  const agents = await (await page.context().request.get(BASE + "/api/agents")).json();
  const governed = agents.find((a) => !a.mutable);
  if (!governed) throw new Error("no governed agent on workspace to exercise the deny-path");
  const r = await page.context().request.fetch(BASE + "/api/widget/" + governed.agent_id, { method: "PATCH", data: { btn_color: "#123456" } });
  if (r.status() !== 403) throw new Error(`governed PATCH returned ${r.status()} (expected 403) for [${governed.phase}] ${governed.name}`);
  return `403 on [${governed.phase}] ${governed.name}`;
});

await step("API rejects malformed JSON with 400 — no Bun default-page source leak", async () => {
  const agents = await (await page.context().request.get(BASE + "/api/agents")).json();
  const dev = agents.find((a) => a.mutable);
  if (!dev) throw new Error("no mutable agent to exercise the malformed-body path");
  // Mutable agent: guard passes, so the body parse runs. Malformed JSON must
  // return a clean 400 — NOT the default Bun error page (which base64-encodes
  // server source + stack in a __bunfallback payload).
  // Buffer.from is critical: Playwright's `data: <string>` with application/json
  // auto-wraps the string in quotes (sends valid JSON: a string literal), which
  // would parse successfully and never exercise the catch. Buffer sends raw bytes.
  const patch = await page.context().request.fetch(BASE + "/api/widget/" + dev.agent_id, { method: "PATCH", headers: { "content-type": "application/json" }, data: Buffer.from("not json {{{") });
  if (patch.status() !== 400) throw new Error(`malformed PATCH → ${patch.status()} (expected 400)`);
  if (/bunfallback|<!doctype|<html/i.test(await patch.text())) throw new Error("PATCH error leaked the Bun default page (source/stack)");
  const log = await page.context().request.fetch(BASE + "/api/log", { method: "POST", headers: { "content-type": "application/json" }, data: Buffer.from("not json") });
  if (log.status() !== 400) throw new Error(`malformed /api/log → ${log.status()} (expected 400)`);
  // Also reject valid JSON that's missing the required `events` array — the old
  // [body] fallback silently wrote a "playground.unknown" line for every {} POST.
  const empty = await page.context().request.fetch(BASE + "/api/log", { method: "POST", headers: { "content-type": "application/json" }, data: {} });
  if (empty.status() !== 400) throw new Error(`/api/log {} → ${empty.status()} (expected 400 — missing events array)`);
  return "PATCH + /api/log {malformed, no-events} → 400, no leak";
});

await step("Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) on every response", async () => {
  // Sample varied endpoints — the wrap must apply to static, API, and 404s alike.
  // Catches accidental removal of the withSec() wrap on any code path; relevant
  // once PLAYGROUND_BIND opens the server beyond localhost (clickjacking / MIME
  // sniff / referer leak — same threat model as the source-leak fix #51).
  for (const path of ["/", "/api/agents", "/api/config", "/api/nonexistent"]) {
    const r = await page.context().request.get(BASE + path);
    const h = r.headers();
    const missing = ["x-frame-options", "x-content-type-options", "referrer-policy"].filter((k) => !h[k]);
    if (missing.length) throw new Error(`${path} (${r.status()}) missing: ${missing.join(", ")}`);
  }
  return "all 3 headers on / + 3 API endpoints";
});

await step("Static MIME: every public/ extension has a CT entry (no octet-stream fallback)", async () => {
  // Doctrine-drift test: the CT map in server.ts must cover every file extension
  // actually shipped under public/. Caught .mp3 missing — capability TTS samples
  // were served as application/octet-stream, which is technically valid but
  // can flake <audio> playback in stricter browsers.
  const root = "playground/public";
  const exts = new Map(); // ext -> first matching relative URL
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else { const e = extname(name).toLowerCase(); if (e && !exts.has(e)) exts.set(e, p.replace(root, "")); }
    }
  };
  walk(root);
  const bad = [];
  for (const [ext, relPath] of exts) {
    const r = await page.context().request.get(BASE + relPath);
    const ct = (r.headers()["content-type"] ?? "").split(";")[0].trim();
    if (ct === "application/octet-stream") bad.push(`${ext} → octet-stream (${relPath})`);
  }
  if (bad.length) throw new Error("missing CT entries: " + bad.join("; "));
  return `${exts.size} extensions, all proper MIME`;
});

await step("Scribe token fetch is lazy — no fetch on Hooks-view mount", async () => {
  // ScribePanel used to fetch a single-use token in a mount-time useEffect;
  // the JSONL log showed ~165× more scribe.tokenFetched events than scribe.connect.
  // The token is now fetched only on the connect click. Compare event counts
  // before/after Hooks navigation — must not increase. (Counts pre-navigation
  // can be non-zero from SpeechInputDemo's vendored getToken in the Components
  // rail, which is a separate, upstream-driven flow not in scope here.)
  const countTokens = () => page.evaluate(() => ((document.querySelector(".term-b")?.innerText || "").match(/scribe\.tokenFetched/g) || []).length);
  const before = await countTokens();
  await page.locator(".nav-item", { hasText: "Hooks (React)" }).first().click();
  await page.waitForSelector("#hooks-scribe-connect", { timeout: 10000 });
  await page.waitForTimeout(1500); // settle: any eager mount fetch would have fired
  const after = await countTokens();
  if (after > before) throw new Error(`Scribe fetched a single-use token on Hooks mount: ${before}→${after}`);
  return `no new tokenFetched on Hooks mount (count stable at ${after})`;
});

// Resolve any in-flight console-arg lookups before tearing down the context.
await Promise.all(pendingConsole);
await browser.close();

// ---- report ----
console.log("\n── summary ──");
const passed = steps.filter((s) => s.ok).length;
console.log(`steps: ${passed}/${steps.length} passed`);
console.log(`console/page errors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log("   ! " + e));
const failed = steps.filter((s) => !s.ok);
// Print stacks for failing steps — sibling of #79/#81: catch stores message
// only on the inline ✗ line for readability, but the summary needs the stack
// so a CI failure is debuggable from the run log alone (no artifact download).
if (failed.length) {
  console.log("\n── failing step stacks ──");
  for (const s of failed) {
    const lines = (s.stack || "").split("\n").slice(0, 6).map((l) => "    " + l).join("\n");
    console.log(`  ✗ ${s.name}${lines ? "\n" + lines : ""}`);
  }
}
const ok = errors.length === 0 && failed.length === 0;
console.log(`\n${ok ? "PASS ✅" : "FAIL ❌"} — screenshots in playground/verify/\n`);
process.exit(ok ? 0 : 1);
