import { createRoot } from "react-dom/client"
import React from "react"
import AudioPlayerDemo from "@/examples/audio-player-demo"
import BarVisualizerDemo from "@/examples/bar-visualizer-demo"
import ConversationBarDemo from "@/examples/conversation-bar-demo"
import ConversationDemo from "@/examples/conversation-demo"
import LiveWaveformDemo from "@/examples/live-waveform-demo"
import MatrixDemo from "@/examples/matrix-demo"
import MessageDemo from "@/examples/message-demo"
import MicSelectorDemo from "@/examples/mic-selector-demo"
import OrbDemo from "@/examples/orb-demo"
import ResponseDemo from "@/examples/response-demo"
import ScrubBarDemo from "@/examples/scrub-bar-demo"
import ShimmeringTextDemo from "@/examples/shimmering-text-demo"
import SpeechInputDemo from "@/examples/speech-input-demo"
import TranscriptViewerDemo from "@/examples/transcript-viewer-demo"
import VoiceButtonDemo from "@/examples/voice-button-demo"
import VoicePickerDemo from "@/examples/voice-picker-demo"
import WaveformDemo from "@/examples/waveform-demo"

class Boundary extends React.Component<{ children: React.ReactNode; name: string }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: Error) { return { err: e?.message || String(e) } }
  componentDidCatch(e: Error) { console.error(`Boundary[${this.props.name}]`, e) }
  render() {
    if (this.state.err) return <div className="text-xs text-red-400 px-3 py-2">⚠ {this.state.err}</div>
    return this.props.children
  }
}

const DEMOS = [
  ["Orb", OrbDemo], ["Waveform", WaveformDemo], ["BarVisualizer", BarVisualizerDemo], ["LiveWaveform", LiveWaveformDemo],
  ["AudioPlayer", AudioPlayerDemo], ["ScrubBar", ScrubBarDemo],
  ["Message", MessageDemo], ["Conversation", ConversationDemo], ["ConversationBar", ConversationBarDemo],
  ["Response", ResponseDemo], ["TranscriptViewer", TranscriptViewerDemo],
  ["VoiceButton", VoiceButtonDemo], ["VoicePicker", VoicePickerDemo], ["MicSelector", MicSelectorDemo],
  ["SpeechInput", SpeechInputDemo], ["ShimmeringText", ShimmeringTextDemo], ["Matrix", MatrixDemo],
] as const

function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">ElevenLabs UI — official component demos</h1>
        <p className="text-xs text-neutral-400 mt-1">
          One demo per component, straight from <code>elevenlabs/ui/registry/elevenlabs-ui/examples/</code>. Each card mounts the upstream demo verbatim — wrapped in an error boundary so a broken one doesn&apos;t kill the page.
        </p>
      </header>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
        {DEMOS.map(([name, Demo]) => (
          <section key={name} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="text-sm font-semibold mb-3">{name}</h3>
            <Boundary name={name}><Demo /></Boundary>
          </section>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
