import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=swiftshader"] });
const viewports = [
  { name: "phone", w: 375, h: 812 },
  { name: "tablet", w: 768, h: 1024 },
];
const pages = [
  ["/", "1-widget"], ["/react.html", "2-react"],
  ["/ui-library.html", "3-ui-library"], ["/examples.html", "4-examples"], ["/blocks.html", "5-blocks"],
];
const findings = [];
for (const v of viewports) {
  const c = await b.newContext({ viewport: { width: v.w, height: v.h } });
  for (const [url, slug] of pages) {
    const p = await c.newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    try { await p.goto("http://localhost:4321" + url, { waitUntil: "networkidle", timeout: 30000 }); } catch {}
    await p.waitForTimeout(2000);
    const overflow = await p.evaluate(() => ({ docW: document.documentElement.scrollWidth, viewportW: window.innerWidth, hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2 }));
    const file = `mobile/${v.name}-${slug}.png`;
    await p.screenshot({ path: "playground/audit/" + file, fullPage: false });
    findings.push({ v: v.name, w: v.w, url, ...overflow, errs: errs.length });
    await p.close();
  }
  await c.close();
}
await b.close();
console.log("\n══ mobile audit ══");
for (const f of findings) console.log(`  ${f.v.padEnd(7)} ${String(f.w)+"px"} ${f.url.padEnd(18)} h-scroll: ${f.hasHScroll ? "❌ "+f.docW+"px content / "+f.viewportW+"px viewport" : "✓"}  errs:${f.errs}`);
