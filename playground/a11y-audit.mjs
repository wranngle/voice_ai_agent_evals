// axe-core a11y audit across the 5 playground pages.
//   bun run playground/a11y-audit.mjs
import { chromium } from "playwright"
import AxeBuilder from "@axe-core/playwright"

const BASE = "http://localhost:4321"
const PAGES = [
  ["/", "widget showcase"],
  ["/react.html", "React hooks island"],
  ["/ui-library.html", "UI components grid"],
  ["/examples.html", "17 official demos"],
  ["/blocks.html", "11 reference apps"],
]

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })

const all = []
for (const [url, label] of PAGES) {
  const p = await ctx.newPage()
  await p.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 })
  await p.waitForTimeout(2000)
  // expand collapsed cards so axe sees real content
  await p.evaluate(() => document.querySelectorAll(".card.collapsed h2").forEach((h) => h.click()))
  await p.waitForTimeout(800)
  const result = await new AxeBuilder({ page: p })
    // skip rules that the shadow DOM widget triggers (encapsulated, not our code)
    .exclude("elevenlabs-convai")
    .analyze()
  all.push({ url, label, violations: result.violations })
  await p.close()
}
await browser.close()

console.log("\n══ a11y audit ══")
const pad = (s, n) => String(s).padEnd(n)
let total = 0
for (const r of all) {
  const counts = r.violations.reduce((a, v) => ((a[v.impact || "minor"] = (a[v.impact || "minor"] || 0) + v.nodes.length), a), {})
  total += r.violations.reduce((s, v) => s + v.nodes.length, 0)
  console.log(`\n  ${pad(r.label, 26)} ${r.url}`)
  if (r.violations.length === 0) console.log("    ✅ no violations")
  else for (const v of r.violations) console.log(`    [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s) — ${v.helpUrl}`)
  const tagged = Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(" · ")
  if (tagged) console.log(`    summary: ${tagged}`)
}
console.log(`\n total nodes flagged: ${total}\n`)
