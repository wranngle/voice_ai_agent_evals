import { createRoot } from "react-dom/client"
import React, { useEffect, useState } from "react"
import { ConversationProvider } from "@elevenlabs/react"
import { Orb, type AgentState } from "@/components/ui/orb"
import { Waveform, ScrollingWaveform } from "@/components/ui/waveform"
import { BarVisualizer } from "@/components/ui/bar-visualizer"
import { LiveWaveform } from "@/components/ui/live-waveform"
import { ShimmeringText } from "@/components/ui/shimmering-text"
import { Matrix, digits } from "@/components/ui/matrix"
import { Message, MessageContent, MessageAvatar } from "@/components/ui/message"
import { Response } from "@/components/ui/response"
import { VoiceButton } from "@/components/ui/voice-button"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ui/conversation"
import { MicSelector } from "@/components/ui/mic-selector"
import { ConversationBar } from "@/components/ui/conversation-bar"
import { VoicePicker } from "@/components/ui/voice-picker"
import { AudioPlayerProvider, AudioPlayerButton, AudioPlayerProgress, AudioPlayerTime, AudioPlayerDuration } from "@/components/ui/audio-player"
import { SpeechInput, SpeechInputRecordButton, SpeechInputPreview, SpeechInputCancelButton } from "@/components/ui/speech-input"
import { TranscriptViewerContainer, TranscriptViewerWords, TranscriptViewerPlayPauseButton, TranscriptViewerScrubBar } from "@/components/ui/transcript-viewer"

class Boundary extends React.Component<{ children: React.ReactNode; name: string }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: Error) { return { err: e?.message || String(e) } }
  componentDidCatch(e: Error) { console.error(`Boundary[${this.props.name}]`, e) }
  render() {
    if (this.state.err) return <div className="text-xs text-red-400 px-2 py-1">⚠ render error: {this.state.err}</div>
    return this.props.children
  }
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {hint && <p className="text-[11px] text-neutral-400 mt-0.5">{hint}</p>}
      </div>
      <div className="min-h-[140px] flex items-center justify-center">
        <Boundary name={title}>{children}</Boundary>
      </div>
    </div>
  )
}

// fake amplitude array for static visualizers
const fakeBars = Array.from({ length: 48 }, (_, i) => 0.2 + 0.6 * Math.sin(i / 4) * Math.sin(i / 3))

// real ElevenLabs voice IDs (publicly known seeds)
const demoVoices = [
  { voiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", labels: { accent: "American" } },
  { voiceId: "AZnzlk1XvdvUeBnXmlld", name: "Domi", labels: { accent: "American" } },
  { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Bella", labels: { accent: "American" } },
] as any

function App() {
  const [orbState, setOrbState] = useState<AgentState>(null)
  const [vbState, setVbState] = useState<"idle" | "active" | "muted">("idle")
  const [agentId, setAgentId] = useState("")
  const [voice, setVoice] = useState("")
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then((d) => setAgentId(d.showcaseAgentId)) }, [])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 font-sans">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">ElevenLabs UI library — live components</h1>
        <p className="text-xs text-neutral-400 mt-1">
          17 drop-in React components from{" "}
          <a href="https://ui.elevenlabs.io/docs/components" className="text-emerald-400 hover:underline">
            ui.elevenlabs.io
          </a>
          . Bundled with Bun · sources in <code>playground/ui-library/src/</code>.
        </p>
      </header>

      {/* ORB family */}
      <h2 className="text-sm font-semibold text-neutral-300 mt-4 mb-2">Agent visualization</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        <Section title="Orb — default" hint="Two-color gradient, audio-reactive">
          <div className="h-40 w-40"><Orb /></div>
        </Section>
        <Section title="Orb — brand colors" hint='colors={["#6DB035","#2792DC"]}'>
          <div className="h-40 w-40"><Orb colors={["#6DB035", "#2792DC"]} /></div>
        </Section>
        <Section title="Orb — agent state" hint="Click to cycle">
          <div className="h-40 w-40 cursor-pointer" onClick={() => setOrbState((s) => ({ null: "thinking", thinking: "listening", listening: "talking", talking: null } as Record<string, AgentState>)[String(s)])}>
            <Orb agentState={orbState} colors={["#FF6B6B", "#4ECDC4"]} />
            <p className="text-[11px] text-neutral-400 text-center mt-1">state: {String(orbState)}</p>
          </div>
        </Section>
        <Section title="Orb — manual volumes" hint="manualInput=0.4 manualOutput=0.85">
          <div className="h-40 w-40"><Orb volumeMode="manual" manualInput={0.4} manualOutput={0.85} colors={["#a78bfa", "#f472b6"]} /></div>
        </Section>
      </div>

      {/* Audio visualization */}
      <h2 className="text-sm font-semibold text-neutral-300 mt-6 mb-2">Audio visualization</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        <Section title="Waveform (static)" hint="Pre-computed amplitudes (0–1)">
          <div className="w-full h-20"><Waveform data={fakeBars} barColor="#6db035" /></div>
        </Section>
        <Section title="ScrollingWaveform" hint="Live scrolling, generated from mic">
          <div className="w-full h-20"><ScrollingWaveform speed={2} barCount={48} active /></div>
        </Section>
        <Section title="BarVisualizer" hint="demo mode = fake audio for showcase">
          <div className="w-full h-20"><BarVisualizer demo barCount={20} /></div>
        </Section>
        <Section title="LiveWaveform" hint="Live mic input (browser permission gated)">
          <div className="w-full h-20"><LiveWaveform /></div>
        </Section>
      </div>

      {/* Conversation / messages */}
      <h2 className="text-sm font-semibold text-neutral-300 mt-6 mb-2">Conversation & messages</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        <Section title="Message — user" hint="from='user'">
          <div className="w-full">
            <Message from="user">
              <MessageAvatar src="https://avatars.githubusercontent.com/u/79276999" name="User" />
              <MessageContent>Hello! Can you help me with my account?</MessageContent>
            </Message>
          </div>
        </Section>
        <Section title="Message — assistant" hint="from='assistant'">
          <div className="w-full">
            <Message from="assistant">
              <MessageAvatar src="https://avatars.githubusercontent.com/u/79276999" name="Agent" />
              <MessageContent>Of course — what's your account email?</MessageContent>
            </Message>
          </div>
        </Section>
        <Section title="Response — streaming markdown" hint="Built on Streamdown; handles partial markdown">
          <div className="w-full text-sm">
            <Response>
              {"Here's what I can help with:\n- billing **questions**\n- product *demos*\n- `code examples`\n\n[ElevenLabs](https://elevenlabs.io)"}
            </Response>
          </div>
        </Section>
        <Section title="Conversation (auto-scrolling list)" hint="ConversationContent + items">
          <div className="w-full h-40">
            <Conversation>
              <ConversationContent>
                <Message from="user"><MessageContent>One.</MessageContent></Message>
                <Message from="assistant"><MessageContent>Two.</MessageContent></Message>
                <Message from="user"><MessageContent>Three.</MessageContent></Message>
                <Message from="assistant"><MessageContent>Four — keep scrolling.</MessageContent></Message>
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>
        </Section>
      </div>

      {/* Voice */}
      <h2 className="text-sm font-semibold text-neutral-300 mt-6 mb-2">Voice interaction</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        <Section title="VoiceButton — idle/active/muted" hint="Click to cycle state">
          <VoiceButton state={vbState} onClick={() => setVbState((s) => ({ idle: "active", active: "muted", muted: "idle" } as const)[s])} />
        </Section>
        <Section title="MicSelector" hint="Lists input devices (browser permission gated)">
          <MicSelector />
        </Section>
      </div>

      {/* Text / data */}
      <h2 className="text-sm font-semibold text-neutral-300 mt-6 mb-2">Text & data</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        <Section title="ShimmeringText" hint="motion-driven gradient text">
          <ShimmeringText text="Thinking…" className="text-lg" />
        </Section>
        <Section title="Matrix — digits" hint="Pixel-grid frames; cycles through digits 0–9">
          <Matrix frames={digits} fps={2} className="text-emerald-400" />
        </Section>
      </div>

      {/* Compound / provider-driven */}
      <h2 className="text-sm font-semibold text-neutral-300 mt-6 mb-2">Compound / provider-driven</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        <Section title="ConversationBar" hint="Live agent bar — mic toggle, keyboard, end-call">
          <div className="w-full">
            {agentId ? <ConversationProvider textOnly><ConversationBar agentId={agentId} /></ConversationProvider> : <span className="text-xs text-neutral-500">loading agent…</span>}
          </div>
        </Section>
        <Section title="AudioPlayer" hint="Play / pause / seek a sample wav">
          <AudioPlayerProvider>
            <div className="w-full flex items-center gap-3">
              <AudioPlayerButton item={{ id: "demo", src: "https://www.kozco.com/tech/piano2.wav" } as any} />
              <AudioPlayerProgress className="flex-1" />
              <span className="text-xs tabular-nums text-neutral-400"><AudioPlayerTime /> / <AudioPlayerDuration /></span>
            </div>
          </AudioPlayerProvider>
        </Section>
        <Section title="VoicePicker" hint="3 sample ElevenLabs voices">
          <div className="w-full">
            <VoicePicker voices={demoVoices} value={voice} onValueChange={setVoice} />
            <p className="text-[11px] text-neutral-500 mt-2">selected: {voice || "—"}</p>
          </div>
        </Section>
      </div>

      {/* Scribe + transcript */}
      <h2 className="text-sm font-semibold text-neutral-300 mt-6 mb-2">Scribe + transcript (live STT)</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        <Section title="SpeechInput" hint="Mic → Scribe partials (token via /api/scribe-token)">
          <div className="w-full flex flex-col items-center gap-3">
            <SpeechInput getToken={async () => (await (await fetch("/api/scribe-token")).json()).token}>
              <div className="flex items-center gap-2">
                <SpeechInputRecordButton />
                <SpeechInputCancelButton />
              </div>
              <SpeechInputPreview className="text-xs text-neutral-300 max-w-[260px]" />
            </SpeechInput>
          </div>
        </Section>
        <Section title="TranscriptViewer" hint="Audio + word-level alignment (Streamdown-rendered)">
          <div className="w-full">
            <TranscriptViewerContainer
              audioSrc="https://www.kozco.com/tech/piano2.wav"
              audioType="audio/wav"
              alignment={{
                characters: "Hello world this is a synthesized transcript".split(""),
                characterStartTimesSeconds: Array.from({ length: 43 }, (_, i) => i * 0.1),
                characterEndTimesSeconds: Array.from({ length: 43 }, (_, i) => i * 0.1 + 0.09),
              } as any}
            >
              <div className="flex items-center gap-2 mb-2">
                <TranscriptViewerPlayPauseButton />
                <TranscriptViewerScrubBar className="flex-1" />
              </div>
              <TranscriptViewerWords className="text-xs leading-relaxed" />
            </TranscriptViewerContainer>
          </div>
        </Section>
      </div>

      <p className="text-[11px] text-neutral-500 mt-8">
        All 17 ui.elevenlabs.io components above are real source pulled via <code>/r/&lt;slug&gt;.json</code>, bundled with Bun. To inspect or copy any component:{" "}
        <code>playground/ui-library/src/components/ui/&lt;name&gt;.tsx</code>.
      </p>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
