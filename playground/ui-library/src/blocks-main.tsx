import { createRoot } from "react-dom/client"
import React, { useState } from "react"
import VoiceChat01 from "@/blocks/voice-chat-01/page"
import VoiceChat02 from "@/blocks/voice-chat-02/page"
import VoiceChat03 from "@/blocks/voice-chat-03/page"
import MusicPlayer01 from "@/blocks/music-player-01/page"
import MusicPlayer02 from "@/blocks/music-player-02/page"

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
]

function App() {
  const [pick, setPick] = useState(BLOCKS[0].id)
  const active = BLOCKS.find((b) => b.id === pick)!
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="p-6 pb-2">
        <h1 className="text-xl font-semibold">ElevenLabs UI — reference apps (blocks)</h1>
        <p className="text-xs text-neutral-400 mt-1">
          Full reference apps from <code>elevenlabs/ui/registry/elevenlabs-ui/blocks/</code>, mounted in this SPA. Pick one — the upstream <code>page.tsx</code> renders straight into the viewport. Blocks requiring server actions (voice-form, voice-nav, transcriber) are not embedded (need a Next.js server).
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
