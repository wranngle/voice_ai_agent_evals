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

export function ControlPlane({ agentId, preset }: { agentId: string; preset: Preset | null }) {
  const [variant, setVariant] = useState(preset?.variant ?? "full")
  const [placement, setPlacement] = useState(preset?.placement ?? "bottom-right")
  const [mode, setMode] = useState<"voice" | "text">(preset?.mode ?? "voice")
  const [colors, setColors] = useState<[string, string]>(preset?.colors ?? ["#9fb0ff", "#5b6cff"])
  const [firstMessage, setFirstMessage] = useState(preset?.firstMessage ?? "")
  const [prompt, setPrompt] = useState(preset?.prompt ?? "")

  // Re-apply when a capability deep-links a new preset in.
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
    if (firstMessage) a["override-first-message"] = firstMessage
    if (prompt) a["override-prompt"] = prompt
    return a
  }, [agentId, variant, placement, mode, colors, firstMessage, prompt])

  const key = JSON.stringify(attrs) // remount the embed when config changes
  useEffect(() => { logEvent("console.widget", "configured", { variant, placement, mode }) }, [variant, placement, mode])

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", gap: 18, alignItems: "start" }}>
      <div className="stage" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: 40 }}>
        <div className="stage-tag"><span className="dot" /> live · {agentId.slice(0, 18)}…</div>
        <div style={{ position: "relative", height: 180, width: 180 }}><SafeOrb colors={colors} agentState="listening" /></div>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>{mode === "voice" ? "Voice agent is live" : "Chat agent is live"}</div>
          <p style={{ color: "var(--text-dim)", fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>
            The real <code>&lt;elevenlabs-convai&gt;</code> widget is docked at <b style={{ color: "var(--text)" }}>{placement}</b>. Find the launcher in that corner and {mode === "voice" ? "click the orb to talk." : "start a chat."}
          </p>
        </div>
        {/* The embed positions itself fixed to the chosen viewport corner. */}
        <Convai key={key} {...attrs} />
      </div>

      <Card>
        <div className="card-h"><h3>Configuration</h3><span className="badge">live</span></div>
        <div className="card-b" style={{ display: "block" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="field"><label>Mode</label>
              <div className="seg">
                {(["voice", "text"] as const).map((m) => <button key={m} className={mode === m ? "sel" : ""} onClick={() => setMode(m)}>{m === "voice" ? "Voice" : "Text chat"}</button>)}
              </div>
            </div>
            <div className="field"><label>Variant</label>
              <div className="seg">{VARIANTS.map((v) => <button key={v} className={variant === v ? "sel" : ""} onClick={() => setVariant(v)}>{v}</button>)}</div>
            </div>
            <div className="field"><label>Placement</label>
              <select value={placement} onChange={(e) => setPlacement(e.target.value)}>{PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            </div>
            <div className="field"><label>Orb palette</label>
              <div style={{ display: "flex", gap: 8 }}>
                {PALETTES.map((p) => <button key={p.name} title={p.name} className={`swatch${colors[0] === p.c[0] ? " sel" : ""}`} style={{ background: `linear-gradient(135deg, ${p.c[0]}, ${p.c[1]})` }} onClick={() => setColors(p.c)} />)}
              </div>
            </div>
            <div className="field"><label>First message</label>
              <input type="text" value={firstMessage} placeholder="(agent default)" onChange={(e) => setFirstMessage(e.target.value)} />
            </div>
            <div className="field"><label>System prompt override</label>
              <textarea rows={3} value={prompt} placeholder="(agent default)" onChange={(e) => setPrompt(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="card-f" style={{ color: "var(--muted)" }}>Click the orb in the stage to start talking. Text mode turns it into a chat box.</div>
      </Card>
    </div>
  )
}
