"use client"

// ElevenLabs Agent Console — one page. Showcase (looks · capabilities · components)
// and a live control plane, switched client-side. No page loads. Everything logs.

import { createRoot } from "react-dom/client"
import { useEffect, useRef, useState } from "react"
import { type AgentState } from "@/components/ui/orb"
import { logEvent, setAgentKey, useLog, clearEvents, getEvents } from "@/spa/log"
import { Showcase } from "@/spa/showcase"
import { ControlPlane, type Preset } from "@/spa/control-plane"
import { HooksView } from "@/spa/hooks"
import { BlocksView } from "@/spa/blocks"

type View = "showcase" | "console" | "hooks" | "blocks"
const STATES: AgentState[] = [null, "listening", "thinking", "talking"]

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const ICONS = {
  showcase: "M4 5h16M4 12h16M4 19h10",
  console: "M12 2a7 7 0 0 1 7 7c0 3-2 5-2 8H7c0-3-2-5-2-8a7 7 0 0 1 7-7z",
  hooks: "M6 4l3 8-3 8M18 4l-3 8 3 8M9 12h6",
  blocks: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
}

// Auto-play cycles the orb state + capability spotlight on a timer. The CSS
// prefers-reduced-motion rule only stops CSS keyframes, not these JS-driven
// state changes, so honor the preference here: reduced-motion users land paused
// (motion stays opt-in via the Auto-play button) instead of being forced into it.
const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

function useAutoplay() {
  const [playing, setPlaying] = useState(!prefersReducedMotion)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setTick((t) => t + 1), 1700)
    return () => clearInterval(id)
  }, [playing])
  useEffect(() => { if (playing && tick > 0) logEvent("console.autoplay", "tick", { tick, state: STATES[tick % STATES.length] }) }, [tick, playing])
  return { playing, setPlaying, tick, agentState: STATES[tick % STATES.length] }
}

const TABS = [
  { id: "all", label: "all", m: () => true },
  { id: "look", label: "looks", m: (e: any) => e.channel === "console.spotlight" || e.channel === "console.autoplay" },
  { id: "widget", label: "widget", m: (e: any) => e.channel === "console.widget" },
  { id: "nav", label: "nav", m: (e: any) => e.channel === "console.nav" },
  { id: "err", label: "errors", m: (e: any) => e.level === "error" || e.level === "warn" },
]

function Terminal() {
  const events = useLog()
  const [tab, setTab] = useState("all")
  const [collapsed, setCollapsed] = useState(false)
  const cur = TABS.find((t) => t.id === tab)!
  const shown = events.filter(cur.m)
  useEffect(() => { document.getElementById("app")?.classList.toggle("term-collapsed", collapsed) }, [collapsed])
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))
  return (
    <section className="term" aria-label="Event terminal">
      <div className="term-h">
        <div className="term-tabs" role="tablist" aria-label="Event filter">{TABS.map((t) => <button key={t.id} className={`term-tab${t.id === tab ? " active" : ""}`} role="tab" aria-selected={t.id === tab} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
        <span className="term-spacer" />
        <span className="term-meta">{events.length} events · POST /api/log → logs/voice-evals-{new Date().toISOString().slice(0, 10)}.jsonl</span>
        <button className="btn" onClick={clearEvents}>clear</button>
        <button className="btn" onClick={() => navigator.clipboard?.writeText(getEvents().map((e) => JSON.stringify(e)).join("\n"))}>copy</button>
        <button className="btn" aria-label={collapsed ? "Expand terminal" : "Collapse terminal"} onClick={() => setCollapsed((c) => !c)}>{collapsed ? "▴" : "▾"}</button>
      </div>
      <div className="term-b" tabIndex={0} aria-label="Event log">
        {shown.length === 0 ? <div className="term-empty">no events for this filter yet</div> : shown.map((e, i) => (
          <div key={i} className={`tl ${e.level}`}>
            <span className="ts">{e.ts.slice(11, 19)}</span> <span className="lv">{e.level}</span> <span className="ch">{e.channel}</span>{"  "}
            <span className="msg" dangerouslySetInnerHTML={{ __html: esc(e.msg) }} />
            {e.fields && <span className="fl">  {esc(JSON.stringify(e.fields).slice(0, 200))}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

function App() {
  const [view, setView] = useState<View>(() => (localStorage.getItem("console.view") as View) || "showcase")
  const [agentId, setAgentId] = useState("")
  const [preset, setPreset] = useState<Preset | null>(null)
  const { playing, setPlaying, tick, agentState } = useAutoplay()
  const booted = useRef(false)

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => {
      setAgentId(d.showcaseAgentId); setAgentKey(d.showcaseAgentId)
      if (!booted.current) { booted.current = true; logEvent("console.boot", "ready", { agent: d.showcaseAgentId }) }
    })
  }, [])
  useEffect(() => { localStorage.setItem("console.view", view); logEvent("console.nav", view) }, [view])

  const go = (v: View) => setView(v)
  const openLive = (p: Preset, label: string) => { setPreset({ ...p }); setView("console"); logEvent("console.nav", "open-live", { capability: label }) }

  const nav = (id: View, label: string, icon: string) => (
    <button className={`nav-item${view === id ? " active" : ""}`} onClick={() => go(id)}>
      <span className="ic"><Icon d={icon} /></span>{label}
    </button>
  )

  return (
    <div className="app" id="app">
      <aside className="side" aria-label="Console sidebar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div><div className="name">ElevenLabs</div><div className="sub">Agent Console</div></div>
        </div>
        <nav className="nav" aria-label="View switcher">
          {nav("showcase", "Showcase", ICONS.showcase)}
          {nav("console", "Control plane", ICONS.console)}
          {nav("hooks", "Hooks (React)", ICONS.hooks)}
          {nav("blocks", "Reference apps", ICONS.blocks)}
        </nav>
        <div className="spacer" />
        <div className="agent-chip" title={agentId}>agent <b>●</b> {agentId ? agentId.slice(0, 20) + "…" : "connecting…"}</div>
      </aside>

      <main className="main" aria-label="Current view">
        {/* Compact view switcher for narrow viewports where the sidebar is hidden. */}
        <nav className="viewbar" aria-label="View switcher (compact)">
          <button className={view === "showcase" ? "active" : ""} onClick={() => go("showcase")}>Showcase</button>
          <button className={view === "console" ? "active" : ""} onClick={() => go("console")}>Control plane</button>
          <button className={view === "hooks" ? "active" : ""} onClick={() => go("hooks")}>Hooks</button>
          <button className={view === "blocks" ? "active" : ""} onClick={() => go("blocks")}>Blocks</button>
        </nav>
        <div className="view">
          {view === "showcase" && (
            <>
              <div className="view-head">
                <span className="eyebrow">Everything at a glance</span>
                <h1 className="title">Everything an agent can do,<br /><span className="thin">every way it can look.</span></h1>
                <p className="lede">A live, auto-playing showcase of the ElevenLabs agent surface — orbs, capabilities, and the native UI components — with a real control plane one click away.</p>
                <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                  <button className={`btn ${playing ? "on" : ""}`} onClick={() => { setPlaying((p) => !p); logEvent("console.autoplay", playing ? "pause" : "play") }}>{playing ? "⏸ Auto-play on" : "▶ Auto-play"}</button>
                  <button className="btn primary" onClick={() => openLive({ mode: "voice" }, "hero")}>Open control plane →</button>
                </div>
              </div>
              <Showcase agentState={agentState} tick={tick} playing={playing} onOpen={openLive} />
            </>
          )}
          {view === "console" && (
            <>
              <div className="view-head">
                <span className="eyebrow">Control plane</span>
                <h1 className="title">Tune it. <span className="thin">Talk to it.</span></h1>
                <p className="lede">A real <code>&lt;elevenlabs-convai&gt;</code> widget wired to the live <code>[DEV]</code> agent. Change the config on the right; click the orb to start a conversation.</p>
                <div style={{ marginTop: 20 }}><button className="btn" onClick={() => go("showcase")}>← Back to showcase</button></div>
              </div>
              {agentId && <div style={{ marginTop: 26 }}><ControlPlane agentId={agentId} preset={preset} /></div>}
            </>
          )}
          {view === "hooks" && (
            <>
              <div className="view-head">
                <span className="eyebrow">React hooks</span>
                <h1 className="title">Drive it with hooks. <span className="thin">Not the embed.</span></h1>
                <p className="lede"><code>@elevenlabs/react</code> in the same bundle: <code>ConversationProvider</code> + <code>useConversationControls</code>, three connection modes (public agent-id · signed-url · WebRTC token), and <code>useScribe</code> for live STT. Pick a connection, hit startSession.</p>
                <div style={{ marginTop: 20 }}><button className="btn" onClick={() => go("showcase")}>← Back to showcase</button></div>
              </div>
              {agentId && <div style={{ marginTop: 26 }}><HooksView agentId={agentId} /></div>}
            </>
          )}
          {view === "blocks" && (
            <>
              <div className="view-head">
                <span className="eyebrow">Reference apps</span>
                <h1 className="title">11 full apps. <span className="thin">Real upstream blocks.</span></h1>
                <p className="lede">Voice Chat × 3 · Music Player × 2 · Realtime Transcriber · Transcriber · Voice Form · Voice Nav · Speaker · Pong — each from <code>elevenlabs/ui</code>'s blocks registry, mounted verbatim (server actions swapped for proxy shims).</p>
                <div style={{ marginTop: 20 }}><button className="btn" onClick={() => go("showcase")}>← Back to showcase</button></div>
              </div>
              <div style={{ marginTop: 26 }}><BlocksView /></div>
            </>
          )}
        </div>
      </main>

      <Terminal />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
