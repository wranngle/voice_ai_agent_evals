import { createRoot } from "react-dom/client"
import { Orb, type AgentState } from "./components/ui/orb"
import { useState } from "react"

const card: React.CSSProperties = { background: "#11151f", border: "1px solid #232a3a", borderRadius: 12, padding: 16 }
const stage: React.CSSProperties = { height: 200, display: "flex", alignItems: "center", justifyContent: "center" }
const muted: React.CSSProperties = { color: "#8b93a7", fontSize: 12, marginTop: 4 }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
      {hint && <p style={muted}>{hint}</p>}
      <div style={{ ...stage, marginTop: 10 }}>{children}</div>
    </div>
  )
}

function App() {
  const [state, setState] = useState<AgentState>(null)
  return (
    <div style={{ minHeight: "100vh", background: "#0b0e14", color: "#d6dcea", fontFamily: "system-ui", padding: "32px 28px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>ElevenLabs UI library — live components</h1>
        <p style={muted}>Drop-in React components from <a style={{ color: "#6db035" }} href="https://ui.elevenlabs.io/docs/components">ui.elevenlabs.io</a>. Bundled with Bun; all sources in <code>playground/ui-library/src/</code>.</p>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        <Section title="Orb — default" hint="Two-color gradient, breathing animation"><Orb /></Section>
        <Section title="Orb — brand colors" hint='colors={["#6DB035","#2792DC"]}'><Orb colors={["#6DB035", "#2792DC"]} /></Section>
        <Section title="Orb — agent state" hint="Click to cycle null / thinking / listening / talking">
          <div onClick={() => setState((s) => ({ null: "thinking", thinking: "listening", listening: "talking", talking: null } as any)[String(s)] as AgentState)} style={{ cursor: "pointer", width: "100%", height: "100%" }}>
            <Orb agentState={state} colors={["#FF6B6B", "#4ECDC4"]} />
            <p style={{ ...muted, textAlign: "center" }}>state: {String(state)}</p>
          </div>
        </Section>
        <Section title="Orb — manual volumes" hint="volumeMode=manual, in=0.4 out=0.85">
          <Orb volumeMode="manual" manualInput={0.4} manualOutput={0.85} colors={["#a78bfa", "#f472b6"]} />
        </Section>
      </div>
      <p style={{ ...muted, marginTop: 30 }}>More components coming in this page: Waveform, BarVisualizer, LiveWaveform, AudioPlayer, ScrubBar, Conversation, ConversationBar, Message, Response, TranscriptViewer, MicSelector, VoicePicker, VoiceButton, SpeechInput, ShimmeringText, Matrix.</p>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
