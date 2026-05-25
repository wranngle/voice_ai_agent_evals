import React, { useEffect, useRef, useState } from "react"
import { ConversationProvider, useConversationControls, useConversationStatus, useScribe } from "@elevenlabs/react"
import { Card } from "./ui"
import { logEvent } from "./log"

// Module-level event ring so the EventLog can re-render on every callback
// without coupling to a Context.
const listeners = new Set<() => void>()
const ring: { id: number; ts: string; type: string; data: unknown }[] = []
let SEQ = 0
const emit = (type: string, data?: unknown) => {
  ring.unshift({ id: ++SEQ, ts: new Date().toLocaleTimeString(), type, data })
  if (ring.length > 80) ring.length = 80
  listeners.forEach((f) => f())
  logEvent("hooks." + type, type, data && typeof data === "object" ? (data as Record<string, unknown>) : { value: String(data) })
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="field"><label>{label}</label>{children}</div>
)

function EventLog() {
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump((n) => n + 1); listeners.add(f); return () => { listeners.delete(f) } }, [])
  return (
    <pre id="hooks-events" style={{ margin: 0, font: "400 11px/1.55 var(--mono)", color: "var(--text-dim)", maxHeight: 220, overflow: "auto", padding: 12, background: "#04060a", borderRadius: 8 }}>
      {ring.length === 0 ? "(no events yet — start a session)" : ring.map((e) => `${e.ts}  ${e.type}${e.data ? "  " + JSON.stringify(e.data).slice(0, 140) : ""}`).join("\n")}
    </pre>
  )
}

function Controls({ agentId, conn }: { agentId: string; conn: "agent-id" | "signed-url" | "token" }) {
  // startSession / endSession / sendUserMessage all live on useConversationControls.
  const c = useConversationControls()
  const { status } = useConversationStatus()
  const [msg, setMsg] = useState("Hi! What can you help with?")
  const connected = status === "connected"

  const start = async () => {
    try {
      const opts: Record<string, unknown> = {}
      if (conn === "signed-url") {
        const r = await fetch(`/api/signed-url/${agentId}`); const d = await r.json()
        if (!d.signed_url) return emit("error", { msg: "no signed_url", body: d })
        opts.signedUrl = d.signed_url
      } else if (conn === "token") {
        const r = await fetch(`/api/conversation-token/${agentId}`); const d = await r.json()
        if (!d.token) return emit("error", { msg: "no token", body: d })
        opts.conversationToken = d.token; opts.connectionType = "webrtc"
      } else {
        opts.agentId = agentId
      }
      c.startSession(opts as never)
      emit("startSession", { conn })
    } catch (e: unknown) { emit("error", { msg: (e as Error)?.message || String(e) }) }
  }
  const end = () => { try { c.endSession(); emit("endSession") } catch (e: unknown) { emit("error", { msg: (e as Error)?.message || String(e) }) } }
  const send = () => {
    try { c.sendUserMessage(msg); emit("sendUserMessage", { len: msg.length }) }
    catch (e: unknown) { emit("error", { msg: (e as Error)?.message || String(e) }) }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span id="hooks-status" className="state-pill"><span className="dot" /> status: {status}</span>
        <span style={{ flex: 1 }} />
        {!connected
          ? <button id="hooks-start" className="btn primary" onClick={start}>▶ startSession</button>
          : <button id="hooks-end" className="btn" onClick={end}>■ endSession</button>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input id="hooks-input" type="text" disabled={!connected} value={msg} onChange={(e) => setMsg((e.target as HTMLInputElement).value)} style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 11px" }} />
        <button id="hooks-send" className="btn" disabled={!connected} onClick={send}>send</button>
      </div>
    </>
  )
}

function ScribePanel() {
  const [token, setToken] = useState<string>("")
  const [transcript, setTranscript] = useState<string>("")
  const armed = useRef(false)
  useEffect(() => {
    fetch("/api/scribe-token").then((r) => r.json()).then((d) => { setToken(d.token || ""); emit("scribe.tokenFetched", { has: !!d.token }) }).catch((e) => emit("scribe.tokenError", { msg: e?.message }))
  }, [])
  const s = useScribe({
    token,
    modelId: "scribe_v1",
    // Pass an explicit (empty) microphone object so the underlying client
    // streams from getUserMedia rather than rejecting with "microphone options
    // or (audioFormat + sampleRate) must be provided".
    microphone: {},
    autoConnect: false,
    onConnect: () => emit("scribe.connect"),
    onDisconnect: () => emit("scribe.disconnect"),
    onError: (e: Error | Event) => emit("scribe.error", { msg: (e as Error)?.message || String(e) }),
    onCommittedTranscript: ({ text }) => { if (text) setTranscript((t) => (t + " " + text).slice(-400)) },
    onPartialTranscript: ({ text }) => emit("scribe.partial", { len: text?.length || 0 }),
  })
  const connect = async () => { if (armed.current) return; armed.current = true; try { await s.connect() } catch (e: unknown) { emit("scribe.error", { msg: (e as Error)?.message || String(e) }) } }
  return (
    <div id="hooks-scribe" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span id="hooks-scribe-status" className="state-pill"><span className="dot" /> scribe: {s.status ?? "idle"}</span>
        <button id="hooks-scribe-connect" className="btn btn-sm" onClick={connect} disabled={!token}>connect</button>
      </div>
      {transcript && <div style={{ font: "400 12px var(--sans)", color: "var(--text-dim)", padding: 10, background: "#04060a", borderRadius: 8, minHeight: 40 }}>{transcript}</div>}
    </div>
  )
}

export function HooksView({ agentId }: { agentId: string }) {
  const [conn, setConn] = useState<"agent-id" | "signed-url" | "token">("agent-id")
  const [textOnly, setTextOnly] = useState(true)
  const [ver, setVer] = useState(0)

  // textOnly is provider-level — remount on change.
  useEffect(() => { setVer((n) => n + 1) }, [textOnly])

  return (
    <div className="grid" style={{ gridTemplateColumns: "320px minmax(0,1fr)", gap: 18, alignItems: "start" }}>
      <Card>
        <div className="card-h"><h3>Hook settings</h3><span className="badge">@elevenlabs/react</span></div>
        <div className="card-b" style={{ display: "block" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Connection">
              <select id="hooks-connection" value={conn} onChange={(e) => setConn((e.target as HTMLSelectElement).value as "agent-id" | "signed-url" | "token")}>
                <option value="agent-id">agent-id (public)</option>
                <option value="signed-url">signed-url (WebSocket auth)</option>
                <option value="token">conversation-token (WebRTC)</option>
              </select>
            </Field>
            <Field label="Mode">
              <div className="seg" id="hooks-mode-seg">
                <button className={textOnly ? "sel" : ""} onClick={() => setTextOnly(true)}>Text</button>
                <button className={!textOnly ? "sel" : ""} onClick={() => setTextOnly(false)}>Voice</button>
              </div>
            </Field>
          </div>
        </div>
        <div className="card-f" style={{ color: "var(--muted)" }}>ConversationProvider remounts when Mode flips; connection mode resolves at startSession() time.</div>
      </Card>

      <div>
        <ConversationProvider
          key={ver}
          textOnly={textOnly}
          onConnect={() => emit("onConnect")}
          onDisconnect={() => emit("onDisconnect")}
          onError={(message: string) => emit("onError", { msg: message })}
          onMessage={(m: { source?: string; message?: string }) => emit("onMessage", { source: m?.source, len: (m?.message || "").length })}
          onStatusChange={(s: { status?: string } | string) => emit("onStatusChange", { status: typeof s === "string" ? s : s?.status })}
        >
          <Card>
            <div className="card-h"><h3>Live conversation</h3><span className="badge">useConversation*</span></div>
            <div className="card-b" style={{ display: "block" }}>
              <Controls agentId={agentId} conn={conn} />
              <div style={{ font: "600 9.5px var(--mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 10, marginTop: 14 }}>Event log</div>
              <EventLog />
              <div style={{ font: "600 9.5px var(--mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 10, marginTop: 18 }}>Scribe (useScribe)</div>
              <ScribePanel />
            </div>
          </Card>
        </ConversationProvider>
      </div>
    </div>
  )
}
