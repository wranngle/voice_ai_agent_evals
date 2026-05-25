import React, { useEffect, useMemo, useState } from "react"
import { logEvent } from "./log"
import { Card, SafeOrb } from "./ui"

const Convai = "elevenlabs-convai" as unknown as React.FC<Record<string, string>>

export type Preset = {
  variant?: string; placement?: string; mode?: "voice" | "text";
  colors?: [string, string]; firstMessage?: string; prompt?: string;
}

const PALETTES: { name: string; c: [string, string] }[] = [
  { name: "Brand", c: ["#9fb0ff", "#5b6cff"] },
  { name: "Ocean", c: ["#4ba3ff", "#1e3a8a"] },
  { name: "Sunset", c: ["#ff7a59", "#ffd166"] },
  { name: "Pink", c: ["#ff5fa2", "#ffd0e4"] },
  { name: "Emerald", c: ["#34d399", "#065f46"] },
  { name: "Mono", c: ["#e5e7eb", "#9ca3af"] },
]
const VARIANTS = ["full", "compact", "expandable"]
const PLACEMENTS = ["bottom-right", "bottom-left", "top-right", "top-left"]
const LOCATIONS = ["", "us", "global", "eu-residency", "in-residency"]

// Boolean widget attributes (set "true" when on). Mirrors the embed's attribute surface.
const TOGGLES: { key: string; attr: string; label: string }[] = [
  { key: "textInput", attr: "text-input", label: "Text input" },
  { key: "transcript", attr: "transcript", label: "Live transcript" },
  { key: "micMuting", attr: "mic-muting", label: "Mic mute button" },
  { key: "dismissible", attr: "dismissible", label: "Dismissible" },
  { key: "defaultExpanded", attr: "default-expanded", label: "Default expanded" },
  { key: "showAvatar", attr: "show-avatar-when-collapsed", label: "Avatar when collapsed" },
]

// Wrap children inside the <label> so the associated control gets an
// accessible name without manual for/id plumbing (axe: label / select-name).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`btn btn-sm${on ? " on" : ""}`} onClick={() => onChange(!on)} style={{ justifyContent: "flex-start", textAlign: "left" }}>
      <span style={{ marginRight: 7 }}>{on ? "●" : "○"}</span>{label}
    </button>
  )
}
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ font: "600 9.5px var(--mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>{title}</div>
    {children}
  </div>
)

export function ControlPlane({ agentId, preset }: { agentId: string; preset: Preset | null }) {
  const [variant, setVariant] = useState(preset?.variant ?? "full")
  const [placement, setPlacement] = useState(preset?.placement ?? "bottom-right")
  const [mode, setMode] = useState<"voice" | "text">(preset?.mode ?? "voice")
  const [colors, setColors] = useState<[string, string]>(preset?.colors ?? ["#9fb0ff", "#5b6cff"])
  const [firstMessage, setFirstMessage] = useState(preset?.firstMessage ?? "")
  const [prompt, setPrompt] = useState(preset?.prompt ?? "")
  const [location, setLocation] = useState("")
  const [language, setLanguage] = useState("")
  const [voiceId, setVoiceId] = useState("")
  const [llm, setLlm] = useState("")
  const [speed, setSpeed] = useState("")
  const [toggles, setToggles] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!preset) return
    if (preset.variant) setVariant(preset.variant)
    if (preset.placement) setPlacement(preset.placement)
    if (preset.mode) setMode(preset.mode)
    if (preset.colors) setColors(preset.colors)
    setFirstMessage(preset.firstMessage ?? "")
    setPrompt(preset.prompt ?? "")
  }, [preset])

  const attrs = useMemo(() => {
    const a: Record<string, string> = { "agent-id": agentId, variant, placement, "avatar-orb-color-1": colors[0], "avatar-orb-color-2": colors[1] }
    if (mode === "text") { a["override-text-only"] = "true"; a["text-input"] = "true" }
    for (const t of TOGGLES) if (toggles[t.key]) a[t.attr] = "true"
    if (firstMessage) a["override-first-message"] = firstMessage
    if (prompt) a["override-prompt"] = prompt
    if (location) a["server-location"] = location
    if (language) a["override-language"] = language
    if (voiceId) a["override-voice-id"] = voiceId
    if (llm) a["override-llm"] = llm
    if (speed) a["override-speed"] = speed
    return a
  }, [agentId, variant, placement, mode, colors, firstMessage, prompt, location, language, voiceId, llm, speed, toggles])

  const key = JSON.stringify(attrs)
  useEffect(() => { logEvent("console.widget", "configured", { variant, placement, mode, knobs: Object.keys(attrs).length }) }, [key])

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 360px", gap: 18, alignItems: "start" }}>
      <div className="stage" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: 40, position: "sticky", top: 18 }}>
        <div className="stage-tag"><span className="dot" /> live · {agentId.slice(0, 18)}…</div>
        <div style={{ position: "relative", height: 180, width: 180 }}><SafeOrb colors={colors} agentState="listening" /></div>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>{mode === "voice" ? "Voice agent is live" : "Chat agent is live"}</div>
          <p style={{ color: "var(--text-dim)", fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>
            The real <code>&lt;elevenlabs-convai&gt;</code> widget is docked at <b style={{ color: "var(--text)" }}>{placement}</b> — {Object.keys(attrs).length} attributes applied live. Find the launcher in that corner.
          </p>
        </div>
        <Convai key={key} {...attrs} />
      </div>

      <Card>
        <div className="card-h"><h2>Configuration</h2><span className="badge">{Object.keys(attrs).length} live</span></div>
        <div className="card-b" style={{ display: "block" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <Section title="Mode & layout">
              <Field label="Mode"><div className="seg">{(["voice", "text"] as const).map((m) => <button key={m} className={mode === m ? "sel" : ""} onClick={() => setMode(m)}>{m === "voice" ? "Voice" : "Text chat"}</button>)}</div></Field>
              <Field label="Variant"><div className="seg">{VARIANTS.map((v) => <button key={v} className={variant === v ? "sel" : ""} onClick={() => setVariant(v)}>{v}</button>)}</div></Field>
              <Field label="Placement"><select value={placement} onChange={(e) => setPlacement((e.target as HTMLSelectElement).value)}>{PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
              <Field label="Orb palette"><div style={{ display: "flex", gap: 8 }}>{PALETTES.map((p) => <button key={p.name} title={p.name} aria-label={`${p.name} palette`} className={`swatch${colors[0] === p.c[0] ? " sel" : ""}`} style={{ background: `linear-gradient(135deg, ${p.c[0]}, ${p.c[1]})` }} onClick={() => setColors(p.c)} />)}</div></Field>
            </Section>

            <Section title="Appearance & behavior">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {TOGGLES.map((t) => <Toggle key={t.key} label={t.label} on={!!toggles[t.key]} onChange={(v) => setToggles((s) => ({ ...s, [t.key]: v }))} />)}
              </div>
            </Section>

            <Section title="Runtime overrides">
              <Field label="First message"><input type="text" value={firstMessage} placeholder="(agent default)" onChange={(e) => setFirstMessage((e.target as HTMLInputElement).value)} /></Field>
              <Field label="System prompt"><textarea rows={3} value={prompt} placeholder="(agent default)" onChange={(e) => setPrompt((e.target as HTMLTextAreaElement).value)} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Language"><input type="text" value={language} placeholder="e.g. es" onChange={(e) => setLanguage((e.target as HTMLInputElement).value)} /></Field>
                <Field label="Speed"><input type="text" value={speed} placeholder="1.0" onChange={(e) => setSpeed((e.target as HTMLInputElement).value)} /></Field>
                <Field label="Voice ID"><input type="text" value={voiceId} placeholder="(agent default)" onChange={(e) => setVoiceId((e.target as HTMLInputElement).value)} /></Field>
                <Field label="LLM"><input type="text" value={llm} placeholder="(agent default)" onChange={(e) => setLlm((e.target as HTMLInputElement).value)} /></Field>
              </div>
            </Section>

            <Section title="Connection">
              <Field label="Server location"><select value={location} onChange={(e) => setLocation((e.target as HTMLSelectElement).value)}>{LOCATIONS.map((l) => <option key={l} value={l}>{l || "(default)"}</option>)}</select></Field>
            </Section>
          </div>
        </div>
        <div className="card-f" style={{ color: "var(--muted)" }}>Every change remounts the live widget. Click the orb in the stage to start; text mode turns it into a chat box.</div>
      </Card>
    </div>
  )
}
