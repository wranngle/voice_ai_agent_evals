"use client"

// Uniform auto-playing gallery — everything an ElevenLabs agent can do, every
// way it can look, and every UI component, in one frame, auto-cycling at a glance.
// Three rails: Looks (orbs) · Capabilities (agent abilities) · Components (native UI).

import { createRoot } from "react-dom/client"
import React, { useEffect, useRef, useState } from "react"
import { Orb, type AgentState } from "@/components/ui/orb"

import AudioPlayerDemo from "@/examples/audio-player-demo"
import BarVisualizerDemo from "@/examples/bar-visualizer-demo"
import ConversationDemo from "@/examples/conversation-demo"
import LiveWaveformDemo from "@/examples/live-waveform-demo"
import MatrixDemo from "@/examples/matrix-demo"
import MessageDemo from "@/examples/message-demo"
import ResponseDemo from "@/examples/response-demo"
import ScrubBarDemo from "@/examples/scrub-bar-demo"
import ShimmeringTextDemo from "@/examples/shimmering-text-demo"
import TranscriptViewerDemo from "@/examples/transcript-viewer-demo"
import VoiceButtonDemo from "@/examples/voice-button-demo"
import VoicePickerDemo from "@/examples/voice-picker-demo"
import WaveformDemo from "@/examples/waveform-demo"
import ConversationBarDemo from "@/examples/conversation-bar-demo"
import MicSelectorDemo from "@/examples/mic-selector-demo"
import SpeechInputDemo from "@/examples/speech-input-demo"

const glog = (channel: string, msg: string, fields?: Record<string, unknown>) =>
  (window as any).__galleryLog?.(channel, msg, fields)

// ───────────────────────── auto-play engine ─────────────────────────
const STATE_CYCLE: AgentState[] = [null, "listening", "thinking", "talking"]

function useAutoplay() {
  const [playing, setPlaying] = useState(true)
  const [tick, setTick] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!playing) { if (ref.current) clearInterval(ref.current); ref.current = null; return }
    ref.current = setInterval(() => setTick((t) => t + 1), 1700)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [playing])
  useEffect(() => {
    if (playing && tick > 0) glog("gallery.autoplay", "tick", { tick, state: STATE_CYCLE[tick % STATE_CYCLE.length] })
  }, [tick, playing])
  return { playing, setPlaying, tick, agentState: STATE_CYCLE[tick % STATE_CYCLE.length] }
}

// ───────────────────────── uniform chrome ─────────────────────────
class Boundary extends React.Component<{ children: React.ReactNode; name: string }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: Error) { return { err: e?.message || String(e) } }
  componentDidCatch(e: Error) { glog("gallery.error", this.props.name, { err: e?.message }) }
  render() {
    if (this.state.err) return <div className="text-[11px] text-red-400 px-3 py-6 text-center">⚠ {this.state.err}</div>
    return this.props.children
  }
}

function Tile({ title, sub, badge, children, footer }: { title: string; sub?: string; badge?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border border-white/10 bg-[#11151f] overflow-hidden">
      <header className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.06]">
        <h3 className="text-[12.5px] font-semibold text-neutral-100 leading-none">{title}</h3>
        {badge && <span className="ml-auto text-[9.5px] font-medium uppercase tracking-wide text-[#6db035] bg-[#6db035]/10 px-1.5 py-0.5 rounded">{badge}</span>}
      </header>
      {sub && <p className="px-3.5 pt-2.5 text-[11px] leading-snug text-neutral-400">{sub}</p>}
      <div className="flex-1 flex items-center justify-center p-3.5 min-h-[150px]">{children}</div>
      {footer && <div className="px-3.5 py-2 border-t border-white/[0.06] text-[11px]">{footer}</div>}
    </section>
  )
}

const RailHead = ({ n, title, blurb }: { n: string; title: string; blurb: string }) => (
  <div className="flex items-baseline gap-3 mt-9 mb-3.5">
    <span className="text-[11px] font-mono text-[#6db035]">{n}</span>
    <h2 className="text-[15px] font-semibold text-neutral-100">{title}</h2>
    <p className="text-[11.5px] text-neutral-500">{blurb}</p>
  </div>
)

const Grid = ({ min = 280, children }: { min?: number; children: React.ReactNode }) => (
  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>
)

// ───────────────────────── RAIL 1 · LOOKS (orbs) ─────────────────────────
const PALETTES: { name: string; colors: [string, string]; seed: number }[] = [
  { name: "Brand green", colors: ["#6DB035", "#2792DC"], seed: 1000 },
  { name: "Ocean", colors: ["#4ba3ff", "#1e3a8a"], seed: 2000 },
  { name: "Sunset", colors: ["#ff7a59", "#ffd166"], seed: 3000 },
  { name: "Hot pink", colors: ["#ff0066", "#ffe5f0"], seed: 4000 },
  { name: "Default cloud", colors: ["#CADCFC", "#A0B9D1"], seed: 5000 },
  { name: "Mono slate", colors: ["#E5E7EB", "#9CA3AF"], seed: 6000 },
  { name: "Violet", colors: ["#a78bfa", "#6d28d9"], seed: 7000 },
  { name: "Emerald", colors: ["#34d399", "#065f46"], seed: 8000 },
]

function OrbTile({ p, agentState }: { p: typeof PALETTES[number]; agentState: AgentState }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-28 rounded-full p-1 bg-black/30 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
        <div className="h-full w-full overflow-hidden rounded-full bg-[#0a0d14]">
          <Orb colors={p.colors} seed={p.seed} agentState={agentState} />
        </div>
      </div>
      <span className="text-[11px] text-neutral-300">{p.name}</span>
    </div>
  )
}

const VARIANTS = [
  { variant: "full", placement: "bottom-right" },
  { variant: "compact", placement: "bottom-left" },
  { variant: "expandable", placement: "top-right" },
]
function VariantFrame({ variant, placement }: { variant: string; placement: string }) {
  const [v, h] = placement.split("-")
  const align = `${v === "top" ? "items-start" : "items-end"} ${h === "left" ? "justify-start" : "justify-end"}`
  return (
    <a href={`/widget.html?variant=${variant}&placement=${placement}`}
       onClick={() => glog("gallery.deeplink", "look.variant", { variant, placement })}
       className="group flex flex-col gap-1.5 no-underline">
      <div className={`relative h-28 w-full rounded-lg border border-white/10 bg-[#0a0d14] p-2 flex ${align}`}>
        <div className={`rounded-md bg-[#6db035]/90 ${variant === "full" ? "h-7 w-24" : variant === "compact" ? "h-6 w-16" : "h-7 w-20"} flex items-center px-2`}>
          <span className="text-[9px] font-medium text-black/80 truncate">{variant}</span>
        </div>
      </div>
      <span className="text-[11px] text-neutral-300 group-hover:text-white">{variant} · {placement} <span className="text-neutral-600">→</span></span>
    </a>
  )
}

function LooksRail({ agentState }: { agentState: AgentState }) {
  const label = agentState ?? "idle"
  return (
    <>
      <RailHead n="01" title="What it can look like"
        blurb={`Live orbs — auto-cycling state: ${label}. Colors, seeds, and agent states the widget can render.`} />
      <Grid min={150}>
        {PALETTES.map((p) => <Tile key={p.name} title={p.name}><OrbTile p={p} agentState={agentState} /></Tile>)}
      </Grid>
      <div className="mt-3">
        <Grid min={220}>
          {VARIANTS.map((v) => (
            <Tile key={v.variant} title={`${v.variant} variant`} badge="widget" sub="Click to open live in the control plane.">
              <VariantFrame {...v} />
            </Tile>
          ))}
        </Grid>
      </div>
    </>
  )
}

// ───────────────────────── RAIL 2 · CAPABILITIES ─────────────────────────
type Cap = { title: string; blurb: string; deeplink: string; illo: React.FC<{ active: boolean }> }

const ChatIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="w-full space-y-1.5">
    <div className="ml-auto w-3/5 rounded-lg rounded-br-sm bg-[#6db035]/20 px-2.5 py-1.5 text-[10.5px] text-neutral-200">How do I reset my password?</div>
    <div className={`w-4/5 rounded-lg rounded-bl-sm bg-white/[0.06] px-2.5 py-1.5 text-[10.5px] text-neutral-300 transition-opacity ${active ? "opacity-100" : "opacity-40"}`}>Sure — I'll text you a secure reset link now.</div>
  </div>
)
const TranscriptIllo: React.FC<{ active: boolean }> = ({ active }) => {
  const words = "rendering the conversation word by word in real time".split(" ")
  const n = active ? words.length : Math.ceil(words.length / 2)
  return <p className="text-[11px] leading-relaxed text-neutral-300">{words.map((w, i) => <span key={i} className={i < n ? "text-[#6db035]" : "text-neutral-600"}>{w} </span>)}</p>
}
const PromptIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <pre className="w-full text-[10px] leading-relaxed text-neutral-300 bg-black/30 rounded-md p-2.5 overflow-hidden">{`override_prompt:
  "Respond only as a
   pirate. ${active ? "Arrr! 🏴‍☠️" : "..."}"`}</pre>
)
const VarsIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="w-full font-mono text-[10px] space-y-1 text-neutral-300">
    {[["user_name", "\"Cody\""], ["plan_tier", "\"pro\""], ["account_age", active ? "412" : "…"]].map(([k, v]) => (
      <div key={k} className="flex justify-between bg-black/30 rounded px-2 py-1"><span className="text-[#4ba3ff]">{k}</span><span>{v}</span></div>
    ))}
  </div>
)
const ToolsIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="flex flex-col items-center gap-2 text-[10.5px] text-neutral-300">
    <span className="rounded bg-white/[0.06] px-2 py-1">agent calls <code className="text-[#6db035]">book_appointment()</code></span>
    <span className={`transition-transform ${active ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-40"}`}>↓</span>
    <span className="rounded bg-[#6db035]/15 px-2 py-1 text-[#9fd66b]">your browser runs it</span>
  </div>
)
const LangIllo: React.FC<{ active: boolean }> = ({ active }) => {
  const langs = ["English", "Español", "Français", "Deutsch", "日本語", "العربية"]
  const i = active ? langs.length - 1 : 1
  return <div className="flex flex-wrap gap-1.5 justify-center">{langs.map((l, k) => <span key={l} className={`text-[11px] rounded px-2 py-1 ${k === i ? "bg-[#6db035]/20 text-[#9fd66b]" : "bg-white/[0.04] text-neutral-500"}`}>{l}</span>)}</div>
}
const VoiceIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="w-full font-mono text-[10px] space-y-1 text-neutral-300">
    {[["voice", active ? "Charlotte" : "Rachel"], ["model", "eleven_turbo"], ["speed", "1.1×"], ["stability", "0.4"]].map(([k, v]) => (
      <div key={k} className="flex justify-between bg-black/30 rounded px-2 py-1"><span className="text-[#4ba3ff]">{k}</span><span>{v}</span></div>
    ))}
  </div>
)
const MarkdownIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="w-full text-[10.5px] text-neutral-300 space-y-1">
    <div className="font-semibold text-neutral-100">### Steps</div>
    <div>• point one {active && "✓"}</div>
    <pre className="bg-black/30 rounded p-1.5 text-[9.5px] text-[#9fd66b]">{`const ok = true`}</pre>
    <a className="text-[#4ba3ff] underline" href="#" onClick={(e) => e.preventDefault()}>clickable link →</a>
  </div>
)
const InterruptIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="flex flex-col items-center gap-2 text-[10.5px]">
    <span className="text-neutral-400">agent: <span className="line-through opacity-60">…as I was saying the his—</span></span>
    <span className={`rounded bg-[#ff0066]/20 text-[#ff85b3] px-2 py-1 transition-opacity ${active ? "opacity-100" : "opacity-30"}`}>user barges in → agent stops instantly</span>
  </div>
)
const ConnIllo: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="flex flex-col gap-1.5 w-full text-[10.5px] text-neutral-300">
    {[["WebRTC", "lowest latency"], ["WebSocket", "signed-url auth"], ["agent-id", "public, zero-config"]].map(([k, v], i) => (
      <div key={k} className={`flex justify-between rounded px-2 py-1 ${active && i === 0 ? "bg-[#6db035]/15" : "bg-black/30"}`}><span className="font-mono text-[#4ba3ff]">{k}</span><span className="text-neutral-500">{v}</span></div>
    ))}
  </div>
)

const CAPS: Cap[] = [
  { title: "Voice conversation", blurb: "Full-duplex speech — the default mode.", deeplink: "/widget.html", illo: ({ active }) => <div className="h-20 w-20 rounded-full overflow-hidden bg-[#0a0d14]"><Orb colors={["#6DB035", "#2792DC"]} agentState={active ? "talking" : "listening"} /></div> },
  { title: "Text chat", blurb: "Mic off — the widget becomes a chat box.", deeplink: "/widget.html?override-text-only=1&text-input=1", illo: ChatIllo },
  { title: "Live transcript", blurb: "Conversation rendered word-by-word as it happens.", deeplink: "/widget.html?transcript=1", illo: TranscriptIllo },
  { title: "Prompt override", blurb: "Swap the system prompt per session — no redeploy.", deeplink: "/widget.html?override-text-only=1&text-input=1&override-prompt=" + encodeURIComponent("You MUST respond to every message with exactly 'OVERRIDE_OK_42'."), illo: PromptIllo },
  { title: "Dynamic variables", blurb: "Inject runtime context into prompt, messages, tools.", deeplink: "/widget.html?dynamic-variables=" + encodeURIComponent('{"user_name":"Cody","plan_tier":"pro"}'), illo: VarsIllo },
  { title: "Client tools", blurb: "Agent triggers actions in the user's own browser.", deeplink: "/widget.html", illo: ToolsIllo },
  { title: "Multi-language", blurb: "Override the conversation language per session.", deeplink: "/widget.html?override-language=es", illo: LangIllo },
  { title: "Voice & model override", blurb: "Per-session voice, LLM, speed, stability.", deeplink: "/widget.html?override-voice-id=&override-speed=1.1", illo: VoiceIllo },
  { title: "Markdown & code", blurb: "Rich agent replies — headings, lists, links, code.", deeplink: "/widget.html?override-text-only=1&text-input=1&syntax-highlight-theme=dark&markdown-link-allowed-hosts=*&override-prompt=" + encodeURIComponent("Always reply with a Markdown demo: heading, bullets, a link to https://elevenlabs.io, and a fenced JS snippet."), illo: MarkdownIllo },
  { title: "Interruption (barge-in)", blurb: "Talk over the agent — it stops and listens.", deeplink: "/widget.html", illo: InterruptIllo },
  { title: "Connection modes", blurb: "WebRTC, WebSocket, signed-url, or public agent-id.", deeplink: "/widget.html?use-rtc=1", illo: ConnIllo },
]

function CapabilitiesRail({ tick, playing }: { tick: number; playing: boolean }) {
  const spotlight = playing ? tick % CAPS.length : -1
  useEffect(() => { if (spotlight >= 0) glog("gallery.spotlight", CAPS[spotlight].title, { index: spotlight }) }, [spotlight])
  return (
    <>
      <RailHead n="02" title="What an agent can do"
        blurb="Every capability auto-demos; click any tile to open it live in the control plane." />
      <Grid min={280}>
        {CAPS.map((c, i) => {
          const active = i === spotlight
          const Illo = c.illo
          return (
            <div key={c.title} className={`rounded-xl transition-shadow ${active ? "shadow-[0_0_0_1.5px_#6db035]" : ""}`}>
              <Tile title={c.title} sub={c.blurb}
                footer={<a href={c.deeplink} onClick={() => glog("gallery.deeplink", c.title, { href: c.deeplink })} className="text-[#4ba3ff] no-underline hover:underline">▶ Open live →</a>}>
                <Illo active={active || !playing} />
              </Tile>
            </div>
          )
        })}
      </Grid>
    </>
  )
}

// ───────────────────────── RAIL 3 · COMPONENTS ─────────────────────────
const COMPONENTS: [string, React.FC<any>][] = [
  ["Orb", ({ }) => <div className="h-24 w-24 rounded-full overflow-hidden bg-[#0a0d14]"><Orb colors={["#6DB035", "#2792DC"]} agentState="talking" /></div>],
  ["Waveform", WaveformDemo], ["BarVisualizer", BarVisualizerDemo], ["LiveWaveform", LiveWaveformDemo],
  ["AudioPlayer", AudioPlayerDemo], ["ScrubBar", ScrubBarDemo], ["TranscriptViewer", TranscriptViewerDemo],
  ["Message", MessageDemo], ["Conversation", ConversationDemo], ["ConversationBar", ConversationBarDemo],
  ["Response", ResponseDemo], ["VoiceButton", VoiceButtonDemo], ["VoicePicker", VoicePickerDemo],
  ["MicSelector", MicSelectorDemo], ["SpeechInput", SpeechInputDemo], ["ShimmeringText", ShimmeringTextDemo], ["Matrix", MatrixDemo],
]

function ComponentsRail() {
  return (
    <>
      <RailHead n="03" title="What the UI components can do"
        blurb={`${COMPONENTS.length} native components from ui.elevenlabs.io — each mounted live.`} />
      <Grid min={300}>
        {COMPONENTS.map(([name, Demo]) => (
          <Tile key={name} title={name} badge="component">
            <div className="w-full"><Boundary name={name}><Demo /></Boundary></div>
          </Tile>
        ))}
      </Grid>
    </>
  )
}

// ───────────────────────── shell ─────────────────────────
function Gallery() {
  const { playing, setPlaying, tick, agentState } = useAutoplay()
  useEffect(() => { glog("gallery.boot", "ready", { rails: 3, looks: PALETTES.length, capabilities: CAPS.length, components: COMPONENTS.length }) }, [])
  return (
    <div className="pb-16">
      <div className="flex items-center gap-3 sticky top-0 z-10 bg-[#0a0d14]/95 backdrop-blur py-2 -mx-1 px-1 border-b border-white/[0.06]">
        <button
          onClick={() => { setPlaying((p) => !p); glog("gallery.autoplay", playing ? "pause" : "play") }}
          className={`text-[12px] font-medium rounded-md px-3 py-1.5 border ${playing ? "border-[#6db035] text-[#9fd66b] bg-[#6db035]/10" : "border-white/15 text-neutral-300"}`}>
          {playing ? "⏸ Auto-play on" : "▶ Auto-play off"}
        </button>
        <span className="text-[11px] text-neutral-500">state: <span className="text-neutral-300">{agentState ?? "idle"}</span> · tick {tick}</span>
        <span className="ml-auto text-[11px] text-neutral-600">{PALETTES.length} looks · {CAPS.length} capabilities · {COMPONENTS.length} components</span>
      </div>
      <LooksRail agentState={agentState} />
      <CapabilitiesRail tick={tick} playing={playing} />
      <ComponentsRail />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Gallery />)
