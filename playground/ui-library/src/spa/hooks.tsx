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
// Sibling of #79/#81/#83/#85 in the catch-drops-stack chain. Every catch in
// this file emitted { msg } only, so JSONL log entries for client-side hook
// errors had no file/line. Stack added when present (DOM Event objects from
// useScribe's onError don't carry one — that path collapses to msg only).
const errFields = (e: unknown): Record<string, unknown> => {
  const msg = (e as Error)?.message || String(e)
  const stack = (e as Error)?.stack
  return stack ? { msg, stack } : { msg }
}

// Wrap the control inside the label so axe sees the accessible name without
// for/id plumbing (axe: label / select-name).
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="field"><span>{label}</span>{children}</label>
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
        // /api/conversation-token proxies the ElevenLabs wire response (raw
        // fetch, no SDK), so the snake_case field name reaches us as-is:
        // `{agent_id, conversation_token, expiration_time_unix_secs, ...}`.
        // The previous `d.token` check was reading an undefined field and
        // always emitting "no token" — broke live-probe step I and any user
        // who selected the "token" connection mode.
        const r = await fetch(`/api/conversation-token/${agentId}`); const d = await r.json()
        if (!d.conversation_token) return emit("error", { msg: "no conversation_token", body: d })
        opts.conversationToken = d.conversation_token; opts.connectionType = "webrtc"
      } else {
        opts.agentId = agentId
      }
      // startSession returns void per @elevenlabs/react types — it kicks off
      // an async connection whose outcome surfaces via the ConversationProvider
      // callbacks (onConnect / onError, wired below). Emit the INTENT here, not
      // success: the actual connected state is signaled by onConnect → "onConnect".
      c.startSession(opts as never)
      emit("startSession.requested", { conn })
    } catch (e: unknown) { emit("error", errFields(e)) }
  }
  const end = () => { try { c.endSession(); emit("endSession") } catch (e: unknown) { emit("error", errFields(e)) } }
  const send = () => {
    try { c.sendUserMessage(msg); emit("sendUserMessage", { len: msg.length }) }
    catch (e: unknown) { emit("error", errFields(e)) }
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
        <input id="hooks-input" type="text" aria-label="Message to send" disabled={!connected} value={msg} onChange={(e) => setMsg((e.target as HTMLInputElement).value)} style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 11px" }} />
        <button id="hooks-send" className="btn" disabled={!connected} onClick={send}>send</button>
      </div>
    </>
  )
}

function ScribePanel() {
  const [token, setToken] = useState<string>("")
  const [transcript, setTranscript] = useState<string>("")
  const armed = useRef(false)
  // Lazy connect: a single-use token + s.connect() are fetched on button click,
  // not on mount. Previously, every Hooks-view load burned a fresh token even
  // if the user never connected — log showed ~165× more tokenFetched events
  // than scribe.connect events. The wantConnect ref drives a useEffect that
  // fires s.connect() once the new token has flowed through useScribe's prop.
  const wantConnect = useRef(false)
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
    onError: (e: Error | Event) => emit("scribe.error", errFields(e)),
    onCommittedTranscript: ({ text }) => { if (text) setTranscript((t) => (t + " " + text).slice(-400)) },
    onPartialTranscript: ({ text }) => emit("scribe.partial", { len: text?.length || 0 }),
  })
  // Once the token arrives in response to a connect click, call s.connect().
  // Two-step is required because useScribe captures `token` via prop, so we
  // need a render with the new token to flow before connect can use it.
  useEffect(() => {
    if (!wantConnect.current || !token || armed.current) return
    armed.current = true
    wantConnect.current = false
    s.connect().catch((e: unknown) => {
      armed.current = false
      setToken("")
      emit("scribe.error", errFields(e))
    })
  }, [token, s])
  const connect = async () => {
    if (armed.current || wantConnect.current) return
    wantConnect.current = true
    try {
      const r = await fetch("/api/scribe-token")
      const d = await r.json()
      emit("scribe.tokenFetched", { has: !!d.token })
      if (!d.token) throw new Error("no token from /api/scribe-token")
      setToken(d.token)
    } catch (e: unknown) {
      wantConnect.current = false
      emit("scribe.tokenError", errFields(e))
    }
  }
  return (
    <div id="hooks-scribe" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span id="hooks-scribe-status" className="state-pill"><span className="dot" /> scribe: {s.status ?? "idle"}</span>
        <button id="hooks-scribe-connect" className="btn btn-sm" onClick={connect}>connect</button>
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
    <div className="hooks-grid">
      <Card>
        <div className="card-h"><h2>Hook settings</h2><span className="badge">@elevenlabs/react</span></div>
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
            <div className="card-h"><h2>Live conversation</h2><span className="badge">useConversation*</span></div>
            <div className="card-b" style={{ display: "block" }}>
              <Controls agentId={agentId} conn={conn} />
              <div style={{ font: "600 9.5px var(--mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--brand-accent)", borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 10, marginTop: 14 }}>Event log</div>
              <EventLog />
              <div style={{ font: "600 9.5px var(--mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--brand-accent)", borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 10, marginTop: 18 }}>Scribe (useScribe)</div>
              <ScribePanel />
            </div>
          </Card>
        </ConversationProvider>
      </div>
    </div>
  )
}
