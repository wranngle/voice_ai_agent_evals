// Run every verification script + thumbnails in sequence, gate on each.
// Single command for "is the playground demonstrably working end to end?"
//   bun run playground/verify-all.mjs
import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"

const steps = [
  { name: "verify.mjs (e2e — 9 steps)", cmd: "bun", args: ["run", "playground/verify.mjs"] },
  { name: "live-probe.mjs (7 capabilities)", cmd: "bun", args: ["run", "playground/live-probe.mjs"] },
  { name: "audit-shots.mjs (fidelity)", cmd: "bun", args: ["run", "playground/audit-shots.mjs"] },
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

// quick artifact + page sanity
const artifacts = [
  ["verify/01-widget-home.png", "widget home"],
  ["verify/07-react-conversation.png", "react conversation"],
  ["audit/F-voice-call.png", "voice call in-call"],
  ["audit/L-scribe.png", "scribe connected"],
  ["audit/W-voice-form.png", "voice form"],
  ["audit/Z-pong.png", "pong"],
  ["audit/AA-home-with-tour.png", "home with tour"],
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
