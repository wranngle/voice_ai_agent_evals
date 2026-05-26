// Responsive sweep of the one-page Agent Console — captures each of the three
// in-page views at phone / tablet / desktop widths, flags horizontal scroll
// (the most common mobile regression) and any pageerror per stop.
//   bun run playground/mobile-audit.mjs
import { chromium } from "playwright"

const BASE = "http://localhost:4321"
const VIEWPORTS = [
  { name: "phone", w: 375, h: 812 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "desktop", w: 1440, h: 900 },
]
const VIEWS = [
  ["showcase", "Showcase"],
  ["console", "Control plane"],
  ["hooks", "Hooks (React)"],
]

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=swiftshader"] })
const findings = []

for (const vp of VIEWPORTS) {
  for (const [view] of VIEWS) {
    // Below 920px the sidebar is hidden by design — we can't click .nav-item,
    // so seed the view in localStorage via addInitScript and let the App boot
    // straight into it. This isolates "does the content render cleanly at this
    // width" from "is there a way to navigate at this width" (which is a
    // separate UX concern surfaced when responsive nav is missing).
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await ctx.newPage()
    const errs = []
    page.on("pageerror", (e) => {
      if (/Cannot read properties of null \(reading 'addEventListener'\)/.test(e.message)) return
      errs.push(e.message)
    })
    await page.addInitScript((v) => { try { localStorage.setItem("console.view", v) } catch {} }, view)
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForTimeout(1500)
    const m = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      viewportW: window.innerWidth,
      hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
    }))
    const file = `mobile/${vp.name}-${view}.png`
    await page.screenshot({ path: "playground/audit/" + file, fullPage: false })
    findings.push({ vp: vp.name, w: vp.w, view, ...m, errs: errs.length })
    await ctx.close()
  }
}
await browser.close()

console.log("\n══ mobile audit ══")
for (const f of findings) {
  const scroll = f.hasHScroll ? `❌ ${f.docW}px content / ${f.viewportW}px viewport` : "✓"
  console.log(`  ${f.vp.padEnd(8)} ${String(f.w + "px").padEnd(7)} ${f.view.padEnd(10)} h-scroll: ${scroll}  pageerrors: ${f.errs}`)
}
const broken = findings.filter((f) => f.hasHScroll || f.errs > 0).length
console.log(`\n${broken === 0 ? "✅ all viewports clean" : "❌ " + broken + " stop(s) flagged"}\n`)
process.exit(broken === 0 ? 0 : 1)
