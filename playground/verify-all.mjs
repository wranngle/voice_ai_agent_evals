// Run every verification script + thumbnails in sequence, gate on each.
// Single command for "is the playground demonstrably working end to end?"
//   bun run playground/verify-all.mjs
import { spawnSync } from "node:child_process"
import { existsSync, statSync, readFileSync } from "node:fs"

// Doctrine-drift guard: verify.mjs's step count is the source of truth, but it's
// also claimed in prose across README / AUDIT / FEATURE-MATRIX and in this file's
// own step labels. They drifted to 9/11/12 once. Derive the real count from the
// step() invocations and fail the gate if any doc disagrees, so the number can
// only be wrong in one place at a time (here) instead of silently rotting.
const REAL_STEPS = (readFileSync("playground/verify.mjs", "utf8").match(/^\s*(?:await\s+)?step\(/gm) || []).length
const driftSources = [
  ["playground/README.md", /verify\.mjs[^\n]*?\((\d+)\s*steps?/i, /verify\b[^\n]*?(\d+)\s*\/\s*\d+\s*verify/i],
  ["playground/AUDIT.md", /verify\.mjs\s+(\d+)\s*\/\s*\d+/i],
  ["playground/FEATURE-MATRIX.md", /verify\.mjs[^\n]*?passes\s+(\d+)\s*\/\s*\d+/i],
  ["playground/verify-all.mjs", /verify\.mjs[^\n]*?(\d+)\s*steps?/i],
]
const drifts = []
for (const [file, ...pats] of driftSources) {
  const txt = readFileSync(file, "utf8")
  for (const pat of pats) {
    const hit = txt.match(pat)
    if (hit && Number(hit[1]) !== REAL_STEPS) drifts.push(`${file}: claims ${hit[1]}, verify.mjs has ${REAL_STEPS}`)
  }
}
if (drifts.length) {
  console.error(`\n❌ verify step-count drift (source of truth = ${REAL_STEPS}):\n  ${drifts.join("\n  ")}\n`)
  process.exit(1)
}

// verify.mjs proves the one-page console end-to-end (Showcase + Control plane
// + JSONL terminal + DEV-guarded widget PATCH round-trip). live-probe.mjs hits
// the real ElevenLabs API for the 7 live capabilities (voice chrome, signed-url,
// prompt override sentinel, WebRTC token, hero WebGL, multi-turn text, Scribe).
const steps = [
  { name: "verify.mjs (e2e — 16 steps, one-page console)", cmd: "bun", args: ["run", "playground/verify.mjs"] },
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
