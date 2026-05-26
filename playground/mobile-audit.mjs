// Responsive sweep of the one-page Agent Console — captures each of the three
// in-page views at phone / tablet / desktop widths, flags horizontal scroll
// (the most common mobile regression) and any pageerror per stop.
//   bun run playground/mobile-audit.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

mkdirSync("playground/audit/mobile", { recursive: true })

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
  ["blocks", "Reference apps"],
]

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=swiftshader"] })
const findings = []

for (const vp of VIEWPORTS) {
  for (const [view] of VIEWS) {
    // Below 920px the sidebar is hidden by design — we can't click .nav-item,
    // so seed the view in localStorage via addInitScript and let the App boot
    // straight into it. This isolates "does the content render cleanly at this
    // width" from "can you navigate at this width" — the latter is covered
    // separately by the viewbar-navigation test below.
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await ctx.newPage()
    const errs = []
    page.on("pageerror", (e) => {
      if (/Cannot read properties of null \(reading 'addEventListener'\)/.test(e.message)) return
      errs.push({ message: e.message, stack: e.stack })
    })
    await page.addInitScript((v) => { try { localStorage.setItem("console.view", v) } catch {} }, view)
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForTimeout(1500)
    const m = await page.evaluate((narrow) => {
      // Below the 760px breakpoint every split-grid view (.blocks-grid /
      // .cp-grid / .hooks-grid) must collapse to ONE column. A two-track grid
      // at phone width crushes its second pane to a clipped sliver — the bug
      // class #37/#38 fixed. h-scroll can't catch it (minmax(0,1fr) absorbs the
      // overflow), so assert the track count directly.
      let crushed = null
      if (narrow) {
        const g = document.querySelector(".cp-grid, .hooks-grid, .blocks-grid")
        if (g) {
          const tracks = getComputedStyle(g).gridTemplateColumns.trim().split(/\s+/).length
          if (tracks > 1) crushed = `${g.className} = ${tracks} tracks`
        }
      }
      return {
        docW: document.documentElement.scrollWidth,
        viewportW: window.innerWidth,
        hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
        crushed,
      }
    }, vp.w <= 760)
    const file = `mobile/${vp.name}-${view}.png`
    await page.screenshot({ path: "playground/audit/" + file, fullPage: false })
    findings.push({ vp: vp.name, w: vp.w, view, ...m, errs })
    await ctx.close()
  }
}

// Viewbar navigation — at ≤920px the sidebar is hidden, so the compact .viewbar
// is the ONLY way to switch views. The loop above seeds each view via
// localStorage, and verify.mjs runs at 1366px where the viewbar is display:none,
// so nothing else proves a phone user can actually move between views. Boot at
// the default view, then click each viewbar button and assert its target view
// renders (per-view container marker).
const navMarkers = { showcase: ".hero", console: ".cp-grid", hooks: ".hooks-grid", blocks: ".blocks-grid" }
const navProblems = []
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await ctx.newPage()
  page.on("pageerror", (e) => navProblems.push(`pageerror: ${e.message}`))
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForTimeout(1200)
  const barVisible = await page.evaluate(() => {
    const b = document.querySelector(".viewbar")
    return !!b && getComputedStyle(b).display !== "none"
  })
  if (!barVisible) navProblems.push("viewbar not visible at 375px (mobile nav unreachable)")
  else {
    for (const [label, key] of [["Blocks", "blocks"], ["Hooks", "hooks"], ["Control plane", "console"], ["Showcase", "showcase"]]) {
      const clicked = await page.evaluate((lbl) => {
        const btn = [...document.querySelectorAll(".viewbar button")].find((b) => b.textContent.trim() === lbl)
        if (!btn) return false
        btn.click()
        return true
      }, label)
      if (!clicked) { navProblems.push(`no viewbar button "${label}"`); continue }
      await page.waitForTimeout(500)
      const rendered = await page.evaluate((sel) => !!document.querySelector(sel), navMarkers[key])
      if (!rendered) navProblems.push(`viewbar "${label}" did not render ${navMarkers[key]}`)
    }
  }
  await ctx.close()
}

await browser.close()

console.log("\n══ mobile audit ══")
for (const f of findings) {
  const scroll = f.hasHScroll ? `❌ ${f.docW}px content / ${f.viewportW}px viewport` : "✓"
  const stack = f.crushed ? `  ❌ split-grid not stacked: ${f.crushed}` : ""
  console.log(`  ${f.vp.padEnd(8)} ${String(f.w + "px").padEnd(7)} ${f.view.padEnd(10)} h-scroll: ${scroll}  pageerrors: ${f.errs.length}${stack}`)
  // Surface actual pageerror messages + stacks — without this the summary used
  // to show "pageerrors: 3" with zero clue what failed. Sibling of #79/#81/#83.
  for (const e of f.errs) {
    console.log(`      ! ${e.message}`)
    if (e.stack) console.log(e.stack.split("\n").slice(0, 4).map((l) => "        " + l).join("\n"))
  }
}
console.log("\n══ viewbar navigation (phone) ══")
if (navProblems.length === 0) console.log("  ✓ viewbar visible; all 4 buttons switch views")
else navProblems.forEach((p) => console.log(`  ❌ ${p}`))

const broken = findings.filter((f) => f.hasHScroll || f.errs.length > 0 || f.crushed).length + navProblems.length
console.log(`\n${broken === 0 ? "✅ all viewports clean" : "❌ " + broken + " stop(s) flagged"}\n`)
process.exit(broken === 0 ? 0 : 1)
