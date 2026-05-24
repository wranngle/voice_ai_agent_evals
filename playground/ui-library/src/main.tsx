import { createRoot } from "react-dom/client"
import { useState } from "react"
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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {hint && <p className="text-[11px] text-neutral-400 mt-0.5">{hint}</p>}
      </div>
      <div className="min-h-[140px] flex items-center justify-center">{children}</div>
    </div>
  )
}

// fake amplitude array for static visualizers
const fakeBars = Array.from({ length: 48 }, (_, i) => 0.2 + 0.6 * Math.sin(i / 4) * Math.sin(i / 3))

function App() {
  const [orbState, setOrbState] = useState<AgentState>(null)
  const [vbState, setVbState] = useState<"idle" | "active" | "muted">("idle")

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
        <Section title="Waveform (static)" hint="Pre-computed amplitudes">
          <div className="w-full h-20"><Waveform amplitudes={fakeBars} /></div>
        </Section>
        <Section title="ScrollingWaveform" hint="Streaming amplitudes over time">
          <div className="w-full h-20"><ScrollingWaveform amplitudes={fakeBars} /></div>
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

      <p className="text-[11px] text-neutral-500 mt-8">
        Components not embedded here (need providers / external services): <code>ConversationBar</code> (needs <code>ConversationProvider</code>),{" "}
        <code>AudioPlayer + ScrubBar</code> (needs <code>AudioPlayerProvider</code> + audio URL),{" "}
        <code>VoicePicker</code> (fetches voices via <code>@elevenlabs/elevenlabs-js</code>),{" "}
        <code>SpeechInput</code> (needs Scribe token). All source is in <code>components/ui/</code>; this page can be extended in <code>playground/ui-library/src/main.tsx</code>.
      </p>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
