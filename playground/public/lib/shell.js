// Shared playground shell — sidebar nav, JSONL logger, bottom terminal.
// Used by /app.js (widget showcase), /react.js (hooks island), /components.html (merged library page).
// Spec: src/internal/jsonl-trace.ts — {ts, channel, level, run_id, key?, msg, fields?}.

const $ = (s, r = document) => r.querySelector(s);
export const RUN_ID = (globalThis.crypto?.randomUUID?.() || String(Date.now()));
export const TERM_EVENTS = [];
export const TERM_FILTER = { current: "all" };
const TERM_MAX = 500;
const LOG_QUEUE = [];
let logTimer = null;
let AGENT_KEY = "";

export function setAgentKey(k) { AGENT_KEY = k || ""; }

export function logEvent(channel, msg, fields = null, level = "info") {
  const ev = {
    ts: new Date().toISOString(),
    channel, level, run_id: RUN_ID, msg,
    ...(fields ? { fields } : {}),
    ...(AGENT_KEY ? { key: AGENT_KEY } : {}),
  };
  TERM_EVENTS.unshift(ev);
  if (TERM_EVENTS.length > TERM_MAX) TERM_EVENTS.length = TERM_MAX;
  LOG_QUEUE.push(ev);
  scheduleFlush();
  renderTerm();
}

function scheduleFlush() {
  if (logTimer) return;
  logTimer = setTimeout(async () => {
    const batch = LOG_QUEUE.splice(0, LOG_QUEUE.length);
    logTimer = null;
    if (!batch.length) return;
    try { await fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: batch }) }); } catch {}
  }, 350);
}

const TERM_TABS = [
  { id: "all", label: "all", match: () => true },
  { id: "preset", label: "presets", match: (e) => e.channel === "playground.preset" || e.channel === "playground.demo" },
  { id: "attr", label: "attrs", match: (e) => e.channel === "playground.attr" },
  { id: "react", label: "react", match: (e) => e.channel.startsWith("react.") },
  { id: "api", label: "api", match: (e) => e.channel.startsWith("playground.api") || e.channel.endsWith(".api") },
  { id: "nav", label: "nav", match: (e) => e.channel === "playground.nav" },
  { id: "errors", label: "errors", match: (e) => e.level === "error" || e.level === "warn" },
];

const escapeHtml = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

export function renderTerm() {
  const tabs = $("#termTabs"); if (!tabs) return;
  if (!tabs.children.length) {
    for (const t of TERM_TABS) {
      const b = document.createElement("button");
      b.className = "term-tab" + (t.id === TERM_FILTER.current ? " active" : "");
      b.dataset.tab = t.id;
      b.textContent = t.label;
      b.addEventListener("click", () => { TERM_FILTER.current = t.id; renderTerm(); });
      tabs.append(b);
    }
  }
  for (const b of tabs.children) b.classList.toggle("active", b.getAttribute("data-tab") === TERM_FILTER.current);
  const body = $("#termBody"); if (!body) return;
  const tab = TERM_TABS.find((t) => t.id === TERM_FILTER.current);
  const shown = TERM_EVENTS.filter(tab.match);
  const meta = $("#termMeta");
  if (meta) meta.textContent = `${TERM_EVENTS.length} event${TERM_EVENTS.length === 1 ? "" : "s"} · POST /api/log → logs/voice-evals-${new Date().toISOString().slice(0, 10)}.jsonl`;
  if (!shown.length) { body.innerHTML = '<div class="term-empty">no events for this filter yet</div>'; return; }
  body.innerHTML = shown.map((e) => {
    const ts = e.ts.slice(11, 19);
    const lvl = (e.level || "info").padEnd(4);
    const f = e.fields ? "  " + escapeHtml(JSON.stringify(e.fields).slice(0, 200)) : "";
    return `<div class="term-line ${e.level || ""}"><span class="ts">${ts}</span> <span class="level-tag">${lvl}</span> <span class="ch">${e.channel}</span>  <span class="msg">${escapeHtml(e.msg || "")}</span><span class="fields">${f}</span></div>`;
  }).join("");
  body.scrollTop = 0;
}

const NAV_ITEMS = [
  { href: "/", label: "Widget showcase", ico: "▣" },
  { href: "/react.html", label: "React hooks", ico: "ƒ" },
  { href: "/components.html", label: "Components", ico: "◫" },
  { sec: "Original (legacy)" },
  { href: "/ui-library.html", label: "Library grid", ico: "◰" },
  { href: "/examples.html", label: "Examples", ico: "◱" },
  { href: "/blocks.html", label: "Blocks", ico: "◧" },
];

export function renderSidebar() {
  const nav = $("#nav"); if (!nav) return;
  nav.innerHTML = "";
  for (const it of NAV_ITEMS) {
    if (it.sec) {
      const s = document.createElement("div");
      s.className = "nav-section label";
      s.textContent = it.sec;
      nav.append(s);
      continue;
    }
    const a = document.createElement("a");
    a.href = it.href;
    if (location.pathname === it.href || (it.href === "/" && location.pathname === "/index.html")) a.classList.add("active");
    a.innerHTML = `<span class="ico">${it.ico}</span><span class="label">${it.label}</span>`;
    a.addEventListener("click", () => logEvent("playground.nav", "click", { to: it.href }));
    nav.append(a);
  }
}

export function wireTerminal() {
  const c = $("#btnTermClear"); if (c) c.addEventListener("click", () => { TERM_EVENTS.length = 0; renderTerm(); });
  const cp = $("#btnTermCopy"); if (cp) cp.addEventListener("click", () => navigator.clipboard?.writeText(TERM_EVENTS.map((e) => JSON.stringify(e)).join("\n")));
  const t = $("#btnTermToggle"); if (t) t.addEventListener("click", () => {
    const collapsed = $("#app").classList.toggle("term-collapsed");
    t.textContent = collapsed ? "▴" : "▾";
    logEvent("playground.nav", collapsed ? "terminal.collapse" : "terminal.expand");
  });
}
