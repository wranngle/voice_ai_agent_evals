// Provenance + drift check for the ElevenLabs UI library copies.
//   bun run playground/sync-ui-library.mjs           → check + report drift
//   bun run playground/sync-ui-library.mjs --apply   → re-sync from upstream
//
// Source of truth: github.com/elevenlabs/ui (apps/www/registry/elevenlabs-ui/).
// The only legitimate drift is the import-path rewrite that lets these
// components resolve in this project's layout (@/registry/elevenlabs-ui/X →
// @/components/ui/X and @/registry/elevenlabs-ui/hooks/X → @/hooks/X).
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const REPO_DIR = "/tmp/el-ui-verify/ui"
const UPSTREAM = "https://github.com/elevenlabs/ui.git"
const LOCAL = "playground/ui-library/src"
const APPLY = process.argv.includes("--apply")

if (!existsSync(REPO_DIR)) {
  mkdirSync("/tmp/el-ui-verify", { recursive: true })
  console.log("cloning upstream…")
  execSync(`git clone --depth 1 --quiet ${UPSTREAM} ${REPO_DIR}`, { stdio: "inherit" })
} else {
  try { execSync(`git -C ${REPO_DIR} fetch --depth 1 --quiet && git -C ${REPO_DIR} reset --hard --quiet origin/HEAD`, { stdio: "ignore" }) } catch {}
}
const head = execSync(`git -C ${REPO_DIR} rev-parse --short HEAD`).toString().trim()
console.log(`upstream HEAD: ${head}\n`)

// EL registry rewrites both `ui/<name>` and `hooks/<name>` paths.
const rewrite = (src) =>
  src
    .replace(/@\/registry\/elevenlabs-ui\/ui\//g, "@/components/ui/")
    .replace(/@\/registry\/elevenlabs-ui\/hooks\//g, "@/hooks/")

function checkFile(localPath, upstreamPath) {
  if (!existsSync(upstreamPath)) return { state: "no-upstream" }
  const upstream = readFileSync(upstreamPath, "utf8")
  const expected = rewrite(upstream)
  if (!existsSync(localPath)) {
    if (APPLY) { mkdirSync(join(localPath, ".."), { recursive: true }); writeFileSync(localPath, expected); return { state: "added" } }
    return { state: "missing-local" }
  }
  const local = readFileSync(localPath, "utf8")
  if (local === expected) return { state: "ok" }
  if (APPLY) { writeFileSync(localPath, expected); return { state: "synced", before: local.length, after: expected.length } }
  return { state: "drift", localLen: local.length, expectedLen: expected.length }
}

const results = []
// 1) components/ui/*.tsx
const ulist = execSync(`ls ${REPO_DIR}/apps/www/registry/elevenlabs-ui/ui/`).toString().trim().split("\n")
for (const f of ulist) {
  if (!f.endsWith(".tsx")) continue
  const local = `${LOCAL}/components/ui/${f}`
  const upstream = `${REPO_DIR}/apps/www/registry/elevenlabs-ui/ui/${f}`
  if (existsSync(local)) results.push({ name: f, area: "ui", ...checkFile(local, upstream) })
}
// 2) hooks/*.ts
const hlist = execSync(`ls ${REPO_DIR}/apps/www/registry/elevenlabs-ui/hooks/`).toString().trim().split("\n")
for (const f of hlist) {
  if (!f.endsWith(".ts")) continue
  const local = `${LOCAL}/hooks/${f}`
  const upstream = `${REPO_DIR}/apps/www/registry/elevenlabs-ui/hooks/${f}`
  if (existsSync(local)) results.push({ name: f, area: "hook", ...checkFile(local, upstream) })
}

// report
const w = (s, n) => String(s).padEnd(n)
const grouped = { ok: [], synced: [], drift: [], added: [], "no-upstream": [], "missing-local": [] }
for (const r of results) grouped[r.state]?.push(r)
console.log(`${results.length} files checked against upstream @ ${head}:`)
for (const [s, arr] of Object.entries(grouped)) if (arr.length) {
  console.log(`  ${w(s, 14)} ${arr.length.toString().padStart(2)}: ${arr.map((r) => r.name).join(", ")}`)
}
const exit = grouped.drift.length || grouped["missing-local"].length ? 1 : 0
console.log(exit === 0 ? "\n✅ all local copies match upstream (after path-rewrite)" : "\n❌ drift — re-run with --apply to sync")
process.exit(exit)
