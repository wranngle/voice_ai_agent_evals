// Run every verification script + thumbnails in sequence, gate on each.
// Single command for "is the playground demonstrably working end to end?"
//   bun run playground/verify-all.mjs
import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"

// verify.mjs proves the one-page console end-to-end (Showcase + Control plane
// + JSONL terminal + DEV-guarded widget PATCH round-trip). live-probe.mjs hits
// the real ElevenLabs API for the 7 live capabilities (voice chrome, signed-url,
// prompt override sentinel, WebRTC token, hero WebGL, multi-turn text, Scribe).
const steps = [
  { name: "verify.mjs (e2e — 11 steps, one-page console)", cmd: "bun", args: ["run", "playground/verify.mjs"] },
  { name: "live-probe.mjs (7 live capabilities)", cmd: "bun", args: ["run", "playground/live-probe.mjs"] },
  { name: "a11y-audit.mjs (axe across 4 views — no serious/critical)", cmd: "bun", args: ["run", "playground/a11y-audit.mjs"] },
  { name: "mobile-audit.mjs (12 viewport×view stops — no h-scroll, no pageerrors)", cmd: "bun", args: ["run", "playground/mobile-audit.mjs"] },
]

const t0 = Date.now()
const results = []
for (const s of steps) {
  process.stdout.write(`\n── ${s.name} ──\n`)
  const r = spawnSync(s.cmd, s.args, { stdio: "inherit" })
  results.push({ ...s, code: r.status, ok: r.status === 0 })
}

const pad = (s, n) => String(s).padEnd(n)
console.log("\n══ summary ══")
for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"}  ${pad(r.name, 36)}  exit=${r.code}`)

// quick artifact + page sanity (paths produced by the rewritten verify.mjs)
const artifacts = [
  ["verify/01-home.png", "console home"],
  ["verify/02-showcase.png", "showcase view"],
  ["verify/03-deeplink.png", "capability deep-link"],
  ["verify/04-widget-live.png", "live convai widget"],
  ["verify/05-roundtrip.png", "sidebar round-trip"],
]
console.log("\n══ key artifacts ══")
for (const [path, desc] of artifacts) {
  const p = "playground/" + path
  const exists = existsSync(p)
  const age = exists ? Math.round((Date.now() - statSync(p).mtimeMs) / 60000) : -1
  console.log(`  ${exists ? "✅" : "❌"}  ${pad(desc, 26)}  ${exists ? `${age}m old` : "MISSING"}  ${path}`)
}

const totalMin = ((Date.now() - t0) / 60000).toFixed(1)
const allGreen = results.every((r) => r.ok)
console.log(`\n${allGreen ? "✅ ALL VERIFICATIONS GREEN" : "❌ AT LEAST ONE FAILED"} — total ${totalMin} min\n`)
process.exit(allGreen ? 0 : 1)
