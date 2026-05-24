import { createRoot } from "react-dom/client"
import React, { useState } from "react"
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

class Boundary extends React.Component<{ children: React.ReactNode; name: string }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: Error) { return { err: e?.message || String(e) } }
  componentDidCatch(e: Error) { console.error(`Boundary[${this.props.name}]`, e) }
  render() {
    if (this.state.err) return <div className="text-xs text-red-400 px-3 py-2">⚠ {this.state.err}</div>
    return this.props.children
  }
}

const BLOCKS = [
  { id: "voice-chat-01", name: "Voice Chat 01", desc: "Conversation + transcript card", Block: VoiceChat01 },
  { id: "voice-chat-02", name: "Voice Chat 02", desc: "Compact bar-style chat", Block: VoiceChat02 },
  { id: "voice-chat-03", name: "Voice Chat 03", desc: "Full-page chat with sidebar", Block: VoiceChat03 },
  { id: "music-player-01", name: "Music Player 01", desc: "Card-style player", Block: MusicPlayer01 },
  { id: "music-player-02", name: "Music Player 02", desc: "Compact player", Block: MusicPlayer02 },
  { id: "realtime-transcriber-01", name: "Realtime Transcriber 01", desc: "Live mic → Scribe partials + committed transcripts (uses /api/scribe-token)", Block: RealtimeTranscriber01 },
  { id: "transcriber-01", name: "Transcriber 01", desc: "Record audio → batch STT (uses /api/stt)", Block: Transcriber01 },
  { id: "voice-form-01", name: "Voice Form 01", desc: "Speak your name → form fields auto-fill via STT + llm.sh extract", Block: VoiceForm01 },
  { id: "voice-nav-01", name: "Voice Nav 01", desc: "Speak your intent → site URL matches (fetches docs sitemap + llm.sh)", Block: VoiceNav01 },
  { id: "speaker-01", name: "Speaker 01", desc: "TTS speaker / agent voice demo", Block: Speaker01 },
  { id: "pong-01", name: "Pong 01", desc: "Voice-controlled Pong (Redis stubbed in-memory for single-tab play)", Block: Pong01 },
]

function App() {
  const [pick, setPick] = useState(BLOCKS[0].id)
  const active = BLOCKS.find((b) => b.id === pick)!
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="p-6 pb-2">
        <h1 className="text-xl font-semibold">ElevenLabs UI — reference apps (blocks)</h1>
        <p className="text-xs text-neutral-400 mt-1">
          <strong>All 11 upstream reference apps mounted.</strong> Each runs the upstream <code>page.tsx</code> verbatim; every <code>"use server"</code> action is replaced with a thin client shim → Bun proxy: <code>/api/scribe-token</code> · <code>/api/stt</code> · <code>/api/extract-form</code> · <code>/api/voice-nav</code> (LLM via <code>llm.sh</code>). Pong's Upstash Redis presence is stubbed in-memory; Speaker's <code>next/link</code> is shimmed with a plain anchor.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BLOCKS.map((b) => (
            <button key={b.id} onClick={() => setPick(b.id)} className={"px-3 py-1.5 rounded-md text-xs border " + (pick === b.id ? "bg-emerald-600 border-emerald-500 text-white" : "border-neutral-700 text-neutral-300 hover:border-neutral-500")}>
              {b.name}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-500 mt-2">{active.desc} · source: <code>playground/ui-library/src/blocks/{active.id}/page.tsx</code></p>
      </header>
      <main className="border-t border-neutral-800">
        <Boundary name={active.id}>
          <active.Block />
        </Boundary>
      </main>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
