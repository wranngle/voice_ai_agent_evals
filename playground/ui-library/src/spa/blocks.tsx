// Reference apps from elevenlabs/ui — 11 full upstream pages, surfaced as a
// sub-tab switcher inside the SPA (one block mounts at a time so they don't
// fight for the full viewport simultaneously). Per-block error boundary keeps
// a broken one from blanking the view.
import React, { useState } from "react"
import { Card } from "./ui"
import { logEvent } from "./log"

import VoiceChat01 from "@/blocks/voice-chat-01/page"
import VoiceChat02 from "@/blocks/voice-chat-02/page"
import VoiceChat03 from "@/blocks/voice-chat-03/page"
import MusicPlayer01 from "@/blocks/music-player-01/page"
import MusicPlayer02 from "@/blocks/music-player-02/page"
import RealtimeTranscriber01 from "@/blocks/realtime-transcriber-01/page"
import Transcriber01 from "@/blocks/transcriber-01/page"
import VoiceForm01 from "@/blocks/voice-form-01/page"
import VoiceNav01 from "@/blocks/voice-nav-01/page"
import Speaker01 from "@/blocks/speaker-01/page"
import Pong01 from "@/blocks/pong-01/page"

type BlockDef = { slug: string; title: string; sub: string; Component: React.FC }
const BLOCKS: BlockDef[] = [
  { slug: "voice-chat-01", title: "Voice Chat 01", sub: "Customer support card", Component: VoiceChat01 },
  { slug: "voice-chat-02", title: "Voice Chat 02", sub: "Compact chat panel", Component: VoiceChat02 },
  { slug: "voice-chat-03", title: "Voice Chat 03", sub: "Full-page conversation", Component: VoiceChat03 },
  { slug: "music-player-01", title: "Music Player 01", sub: "Album-art player + tracklist", Component: MusicPlayer01 },
  { slug: "music-player-02", title: "Music Player 02", sub: "Minimal player", Component: MusicPlayer02 },
  { slug: "realtime-transcriber", title: "Realtime Transcriber", sub: "useScribe live STT", Component: RealtimeTranscriber01 },
  { slug: "transcriber", title: "Transcriber", sub: "Batch STT via /api/stt", Component: Transcriber01 },
  { slug: "voice-form", title: "Voice Form", sub: "STT + llm.sh extract via /api/extract-form", Component: VoiceForm01 },
  { slug: "voice-nav", title: "Voice Nav", sub: "STT + sitemap + llm.sh URL match", Component: VoiceNav01 },
  { slug: "speaker", title: "Speaker", sub: "ElevenMusic player + twin orb visuals", Component: Speaker01 },
  { slug: "pong", title: "Pong", sub: "Pixel-grid scoreboard (Redis stubbed in-memory)", Component: Pong01 },
]

class Boundary extends React.Component<{ children: React.ReactNode; name: string }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: Error) { return { err: e?.message || String(e) } }
  componentDidCatch(e: Error) { logEvent("console.error", "block:" + this.props.name, { err: e?.message }, "error") }
  render() { return this.state.err ? <div style={{ color: "var(--err)", fontSize: 12, padding: 24, textAlign: "center" }}>⚠ {this.props.name} crashed: {this.state.err}</div> : this.props.children }
}

export function BlocksView() {
  const [active, setActive] = useState(BLOCKS[0].slug)
  const block = BLOCKS.find((b) => b.slug === active) ?? BLOCKS[0]
  const Mounted = block.Component
  return (
    <div className="blocks-grid">
      <Card>
        <div className="card-h"><h2>Reference apps</h2><span className="badge">{BLOCKS.length}</span></div>
        <div className="card-b" style={{ display: "block", padding: 8 }}>
          <nav aria-label="Block switcher" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {BLOCKS.map((b) => (
              <button key={b.slug} className={`nav-item${active === b.slug ? " active" : ""}`}
                onClick={() => { setActive(b.slug); logEvent("console.nav", "block", { slug: b.slug }) }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{b.title}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{b.sub}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>
      </Card>

      <Card>
        <div className="card-h"><h2>{block.title}</h2><span className="badge">block</span></div>
        <div className="card-b" style={{ display: "block", padding: 0, minHeight: 480, position: "relative", overflow: "hidden" }}>
          <Boundary name={block.slug}><Mounted /></Boundary>
        </div>
      </Card>
    </div>
  )
}
