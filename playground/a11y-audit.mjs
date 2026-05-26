// axe-core a11y audit across the three in-page views of the one-page Agent
// Console. Switches views via the sidebar (no reloads), then runs axe.
//   bun run playground/a11y-audit.mjs
import { chromium } from "playwright"
import AxeBuilder from "@axe-core/playwright"

const BASE = "http://localhost:4321"
const VIEWS = [
  ["showcase", "Showcase"],
  ["console", "Control plane"],
  ["hooks", "Hooks (React)"],
  ["blocks", "Reference apps"],
]

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
// addInitScript lands BEFORE the first nav so the App boots on Showcase even if
// localStorage was set differently by a prior interaction.
await page.addInitScript(() => { try { localStorage.setItem("console.view", "showcase") } catch {} })
await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 })
await page.waitForSelector(".rail-head", { timeout: 15000 })

const all = []
for (const [view, label] of VIEWS) {
  if (view !== "showcase") {
    await page.locator(".nav-item", { hasText: label }).first().click()
    await page.waitForTimeout(900)
  }
  const result = await new AxeBuilder({ page })
    // Encapsulated upstream shadow-DOM widget — not our code.
    .exclude("elevenlabs-convai")
    // Vendored elevenlabs/ui demos in the Components rail (BarVisualizer,
    // AudioPlayer, ScrubBar, etc.) carry their own a11y debt — chrome stays
    // in scope (Tile header + the components-rail container itself), demo
    // internals don't.
    .exclude(".components-rail .card-b *")
    .analyze()
  all.push({ view, label, violations: result.violations })
}
await browser.close()

console.log("\n══ a11y audit ══")
const pad = (s, n) => String(s).padEnd(n)
let total = 0
for (const r of all) {
  const counts = r.violations.reduce((a, v) => ((a[v.impact || "minor"] = (a[v.impact || "minor"] || 0) + v.nodes.length), a), {})
  total += r.violations.reduce((s, v) => s + v.nodes.length, 0)
  console.log(`\n  ${pad(r.label, 22)} view='${r.view}'`)
  if (r.violations.length === 0) console.log("    ✅ no violations")
  else for (const v of r.violations) {
    console.log(`    [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)`)
    for (const n of v.nodes.slice(0, 3)) {
      const sel = (Array.isArray(n.target?.[0]) ? n.target[0].join(" > ") : n.target?.[0]) || "(no selector)"
      const msg = (n.failureSummary || "").split("\n").slice(0, 2).join(" / ").slice(0, 140)
      console.log(`      • ${sel}${msg ? `  ${msg}` : ""}`)
    }
    if (v.nodes.length > 3) console.log(`      … +${v.nodes.length - 3} more`)
  }
  const tagged = Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(" · ")
  if (tagged) console.log(`    summary: ${tagged}`)
}
console.log(`\n total nodes flagged: ${total}\n`)
// Fail on any serious/critical violation; minor/moderate are warnings.
const blocking = all.flatMap((r) => r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).length
process.exit(blocking > 0 ? 1 : 0)
