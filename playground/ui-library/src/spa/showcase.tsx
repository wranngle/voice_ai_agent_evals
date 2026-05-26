import React, { useEffect } from "react"
import { type AgentState } from "@/components/ui/orb"
import { SafeOrb, Tile, RailHead, Grid, OrbTile } from "./ui"
import { logEvent } from "./log"
import type { Preset } from "./control-plane"

import AudioPlayerDemo from "@/examples/audio-player-demo"
import BarVisualizerDemo from "@/examples/bar-visualizer-demo"
import ConversationDemo from "@/examples/conversation-demo"
import LiveWaveformDemo from "@/examples/live-waveform-demo"
import MatrixDemo from "@/examples/matrix-demo"
import OrbDemo from "@/examples/orb-demo"
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

const PALETTES: { name: string; c: [string, string]; seed: number }[] = [
  { name: "Brand", c: ["#9fb0ff", "#5b6cff"], seed: 1000 },
  { name: "Ocean", c: ["#4ba3ff", "#1e3a8a"], seed: 2000 },
  { name: "Sunset", c: ["#ff7a59", "#ffd166"], seed: 3000 },
  { name: "Hot pink", c: ["#ff5fa2", "#ffd0e4"], seed: 4000 },
  { name: "Cloud", c: ["#cadcfc", "#a0b9d1"], seed: 5000 },
  { name: "Slate", c: ["#e5e7eb", "#9ca3af"], seed: 6000 },
  { name: "Violet", c: ["#b79cff", "#6d28d9"], seed: 7000 },
  { name: "Emerald", c: ["#34d399", "#065f46"], seed: 8000 },
]

type Cap = { title: string; blurb: string; preset: Preset }
const CAPS: Cap[] = [
  { title: "Voice conversation", blurb: "Full-duplex speech — the default mode.", preset: { mode: "voice" } },
  { title: "Text chat", blurb: "Mic off; the widget becomes a chat box.", preset: { mode: "text" } },
  { title: "Prompt override", blurb: "Swap the system prompt per session — no redeploy.", preset: { mode: "text", prompt: "You MUST reply to every message with exactly 'OVERRIDE_OK_42'." } },
  { title: "Custom first message", blurb: "Greet each visitor with a tailored opener.", preset: { firstMessage: "Hey — I'm the Wranngle demo agent. Ask me anything." } },
  { title: "Markdown & code", blurb: "Rich replies: headings, lists, links, fenced code.", preset: { mode: "text", prompt: "Always answer with a short Markdown demo: a heading, two bullets, a link to https://elevenlabs.io, and a fenced JS snippet." } },
  { title: "Brand the orb", blurb: "Match the orb to your product palette.", preset: { colors: ["#ff5fa2", "#ffd0e4"] } },
  { title: "Compact placement", blurb: "Dock it anywhere — four corners, three variants.", preset: { variant: "compact", placement: "bottom-left" } },
  { title: "Expandable panel", blurb: "Opens into a larger conversational surface.", preset: { variant: "expandable", placement: "top-right" } },
]

const COMPONENTS: [string, React.FC<any>, boolean][] = [
  ["Orb", OrbDemo, false], ["Waveform", WaveformDemo, false], ["BarVisualizer", BarVisualizerDemo, false], ["LiveWaveform", LiveWaveformDemo, false],
  ["AudioPlayer", AudioPlayerDemo, false], ["ScrubBar", ScrubBarDemo, false], ["TranscriptViewer", TranscriptViewerDemo, false],
  ["Message", MessageDemo, false], ["Conversation", ConversationDemo, false], ["ConversationBar", ConversationBarDemo, false],
  ["Response", ResponseDemo, false], ["VoiceButton", VoiceButtonDemo, false], ["VoicePicker", VoicePickerDemo, false],
  ["MicSelector", MicSelectorDemo, false], ["SpeechInput", SpeechInputDemo, true], ["ShimmeringText", ShimmeringTextDemo, false], ["Matrix", MatrixDemo, false],
]

class Boundary extends React.Component<{ children: React.ReactNode; name: string }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: Error) { return { err: e?.message || String(e) } }
  componentDidCatch(e: Error) { logEvent("console.error", this.props.name, { err: e?.message }, "error") }
  render() { return this.state.err ? <div style={{ color: "var(--err)", fontSize: 11, padding: "24px 0", textAlign: "center" }}>⚠ {this.state.err}</div> : this.props.children }
}

export function Showcase({ agentState, tick, playing, onOpen }: { agentState: AgentState; tick: number; playing: boolean; onOpen: (p: Preset, label: string) => void }) {
  const spotlight = playing ? tick % CAPS.length : -1
  useEffect(() => { if (spotlight >= 0) logEvent("console.spotlight", CAPS[spotlight].title, { index: spotlight }) }, [spotlight])

  return (
    <>
      <div className="hero">
        <div className="hero-orb"><SafeOrb colors={["#9fb0ff", "#5b6cff"]} agentState={agentState} /></div>
        <div>
          <span className="state-pill"><span className="dot" /> agent state · {agentState ?? "idle"}</span>
          <div className="hero-meta" style={{ marginTop: 18 }}>
            <div className="hero-stat"><div className="n">{PALETTES.length}</div><div className="l">looks</div></div>
            <div className="hero-stat"><div className="n">{CAPS.length}</div><div className="l">capabilities</div></div>
            <div className="hero-stat"><div className="n">{COMPONENTS.length}</div><div className="l">components</div></div>
          </div>
        </div>
      </div>

      <RailHead n="01" title="What it can look like" blurb={`Live orbs, auto-cycling state · ${agentState ?? "idle"}`} />
      <Grid min={158} className="stagger">{PALETTES.map((p) => <OrbTile key={p.name} name={p.name} colors={p.c} seed={p.seed} agentState={agentState} />)}</Grid>

      <RailHead n="02" title="What an agent can do" blurb="Auto-demoing; click any tile to open it live →" />
      <Grid min={272} className="stagger">
        {CAPS.map((c, i) => (
          <div key={c.title} style={i === spotlight ? { borderRadius: "var(--r)", boxShadow: "0 0 0 1.5px var(--brand-accent)" } : undefined}>
            <Tile title={c.title} footer={<button className="deeplink" onClick={() => onOpen(c.preset, c.title)}>▶ Open live →</button>}>
              <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.5, margin: 0, alignSelf: "stretch" }}>{c.blurb}</p>
            </Tile>
          </div>
        ))}
      </Grid>

      <RailHead n="03" title="What the UI components can do" blurb={`${COMPONENTS.length} native components from ui.elevenlabs.io, mounted live`} />
      <Grid min={300} className="stagger components-rail">
        {COMPONENTS.map(([name, Demo, contain]) => (
          <Tile key={name} title={name} badge="component" contain={contain}>
            <div style={{ width: "100%" }}><Boundary name={name}><Demo /></Boundary></div>
          </Tile>
        ))}
      </Grid>
    </>
  )
}
