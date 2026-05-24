// Native UI components island — exercises every @elevenlabs/react hook against
// the real showcase agent. No build step: React 18 + htm + SDK via import map.
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";
import {
  ConversationProvider, useConversation, useConversationControls, useConversationStatus,
  useConversationInput, useConversationMode, useConversationFeedback, useRawConversation,
  useConversationClientTool,
} from "@elevenlabs/react";

const html = htm.bind(React.createElement);

// ---------- shared event log (module-level pub/sub) ----------
const listeners = new Set();
let SEQ = 0;
const emit = (type, data) => { const e = { id: ++SEQ, ts: new Date().toLocaleTimeString(), type, data }; listeners.forEach((l) => l(e)); };
function useEventFeed() {
  const [events, setEvents] = useState([]);
  useEffect(() => { const l = (e) => setEvents((p) => [e, ...p].slice(0, 250)); listeners.add(l); return () => listeners.delete(l); }, []);
  return events;
}
const short = (v) => { try { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > 160 ? s.slice(0, 160) + "…" : s; } catch { return String(v); } };

// ---------- small UI atoms ----------
const Card = ({ id, title, sec, children }) => html`
  <section class="card" id=${id}><h2>${title} ${sec && html`<span class="sec">${sec}</span>`}</h2>
  <div class="card-body">${children}</div></section>`;
const Badge = ({ tone, children }) => html`<span class=${"badge " + (tone || "")}>${children}</span>`;

// ---------- controls (uses most of useConversationControls) ----------
function Controls({ agentId, settings }) {
  const c = useConversationControls();
  const { status } = useConversationStatus();
  const [msg, setMsg] = useState("Hi! What can you do?");
  const [vol, setVol] = useState(1);
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [convId, setConvId] = useState("");
  const connected = status === "connected";

  const start = useCallback(async () => {
    try {
      const opts = { userId: settings.userId || undefined };
      if (settings.conn === "signed-url") {
        const r = await fetch(`/api/signed-url/${agentId}`); const d = await r.json();
        if (!d.signed_url) return emit("error", "no signed_url: " + short(d));
        opts.signedUrl = d.signed_url;
      } else if (settings.conn === "token") {
        const r = await fetch(`/api/conversation-token/${agentId}`); const d = await r.json();
        if (!d.token) return emit("error", "no token: " + short(d));
        opts.conversationToken = d.token; opts.connectionType = "webrtc";
      } else {
        opts.agentId = agentId;
        if (settings.textOnly) opts.connectionType = "websocket";
      }
      if (!settings.textOnly && settings.conn === "agent-id") {
        try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch { emit("error", "mic permission denied — voice needs it"); }
      }
      const id = await c.startSession(opts);
      setConvId(id || ""); emit("startSession", { id, opts: { ...opts, signedUrl: opts.signedUrl ? "(set)" : undefined, conversationToken: opts.conversationToken ? "(set)" : undefined } });
    } catch (e) { emit("error", "startSession: " + (e?.message || e)); }
  }, [agentId, settings, c]);

  const loadDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({ inputs: list.filter((d) => d.kind === "audioinput"), outputs: list.filter((d) => d.kind === "audiooutput") });
    } catch (e) { emit("error", "enumerateDevices: " + e.message); }
  }, []);

  return html`
    <div class="row">
      ${!connected
        ? html`<button class="primary" onClick=${start}>▶ startSession (${settings.textOnly ? "text" : settings.conn})</button>`
        : html`<button class="danger" onClick=${() => { c.endSession(); emit("endSession", {}); }}>■ endSession</button>`}
      <span class="kv">conv: ${convId || "—"}</span>
    </div>

    <div class="row" style="margin-top:10px">
      <input type="text" value=${msg} onInput=${(e) => setMsg(e.target.value)} style="flex:1;min-width:200px"/>
      <button disabled=${!connected} onClick=${() => { c.sendUserMessage(msg); emit("sendUserMessage", msg); }}>send</button>
      <button class="sm" disabled=${!connected} onClick=${() => { c.sendContextualUpdate("User is viewing the controls panel."); emit("sendContextualUpdate", "ctx"); }}>contextual update</button>
      <button class="sm" disabled=${!connected} onClick=${() => { c.sendUserActivity(); emit("sendUserActivity", "ping"); }}>user activity</button>
    </div>

    <div class="row" style="margin-top:10px">
      <span class="kv">volume</span>
      <input type="range" min="0" max="1" step="0.05" value=${vol} onInput=${(e) => { const v = +e.target.value; setVol(v); c.setVolume({ volume: v }); }}/>
      <button class="sm" onClick=${() => emit("volumes", { in: c.getInputVolume?.(), out: c.getOutputVolume?.() })}>read in/out volume</button>
      <button class="sm" onClick=${() => emit("getId", c.getId?.())}>getId</button>
    </div>

    <div class="row" style="margin-top:10px">
      <button class="sm" onClick=${loadDevices}>enumerate devices</button>
      <select onChange=${(e) => { c.changeInputDevice?.({ sampleRate: 16000, format: "pcm", inputDeviceId: e.target.value }); emit("changeInputDevice", e.target.value); }}>
        <option>input device…</option>${devices.inputs.map((d) => html`<option value=${d.deviceId}>${d.label || d.deviceId.slice(0, 8)}</option>`)}
      </select>
      <select onChange=${(e) => { c.changeOutputDevice?.({ sampleRate: 16000, format: "pcm", outputDeviceId: e.target.value }); emit("changeOutputDevice", e.target.value); }}>
        <option>output device…</option>${devices.outputs.map((d) => html`<option value=${d.deviceId}>${d.label || d.deviceId.slice(0, 8)}</option>`)}
      </select>
    </div>
    <div class="row" style="margin-top:10px">
      <span class="kv">MCP approval</span>
      <input type="text" id="mcpId" placeholder="tool_call_id" style="min-width:160px"/>
      <button class="sm" disabled=${!connected} onClick=${() => { const id = document.getElementById("mcpId").value; c.sendMCPToolApprovalResult?.(id, true); emit("sendMCPToolApprovalResult", { id, approve: true }); }}>approve</button>
      <button class="sm" disabled=${!connected} onClick=${() => { const id = document.getElementById("mcpId").value; c.sendMCPToolApprovalResult?.(id, false); emit("sendMCPToolApprovalResult", { id, approve: false }); }}>reject</button>
    </div>
    <p class="hint" style="margin-top:8px">Hooks: <code>useConversationControls</code> — startSession · endSession · sendUserMessage · sendContextualUpdate · sendUserActivity · setVolume · getInput/OutputVolume · getId · changeInput/OutputDevice · sendMCPToolApprovalResult.</p>`;
}

function StatusMode() {
  const { status, message } = useConversationStatus();
  const { mode, isSpeaking, isListening } = useConversationMode();
  const tone = status === "connected" ? "ok" : status === "connecting" ? "warn" : "";
  return html`<div class="row">
    <${Badge} tone=${tone}>status: ${status}${message ? ` (${message})` : ""}<//>
    <${Badge} tone=${isSpeaking ? "warn" : ""}>mode: ${mode || "—"}<//>
    <span class="kv">${isSpeaking ? "🔊 speaking" : isListening ? "🎙 listening" : "idle"}</span>
  </div>`;
}

function MuteFeedback() {
  const { isMuted, setMuted } = useConversationInput();
  const { canSendFeedback, sendFeedback } = useConversationFeedback();
  const raw = useRawConversation();
  return html`<div class="row" style="margin-top:10px">
    <button onClick=${() => setMuted(!isMuted)}>${isMuted ? "🔇 unmute" : "🎙 mute"} (useConversationInput)</button>
    <button class="sm" disabled=${!canSendFeedback} onClick=${() => { sendFeedback(true); emit("sendFeedback", true); }}>👍 like</button>
    <button class="sm" disabled=${!canSendFeedback} onClick=${() => { sendFeedback(false); emit("sendFeedback", false); }}>👎 dislike</button>
    <span class="kv">useRawConversation → ${raw ? typeof raw === "object" ? "instance" : typeof raw : "null"}</span>
  </div>`;
}

// ---------- audio-reactive visualizer ----------
function Visualizer() {
  const c = useConversationControls();
  const { status } = useConversationStatus();
  const ref = useRef(null);
  useEffect(() => {
    if (status !== "connected") return;
    let raf; const ctx = ref.current?.getContext("2d");
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!ctx) return;
      const out = c.getOutputByteFrequencyData?.(); const inp = c.getInputByteFrequencyData?.();
      const W = ref.current.width, H = ref.current.height;
      ctx.clearRect(0, 0, W, H);
      const bars = (data, color, base) => {
        if (!data || !data.length) return;
        const n = Math.min(48, data.length); const bw = W / n;
        ctx.fillStyle = color;
        for (let i = 0; i < n; i++) { const h = (data[i] / 255) * (H / 2); ctx.fillRect(i * bw, base - h, bw - 1, h); }
      };
      bars(out, "#6db035", H / 2);           // agent output (top, downward)
      bars(inp, "#2792dc", H);               // mic input (bottom)
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [status, c]);
  return html`<div>
    <canvas ref=${ref} width="640" height="120" style="width:100%;height:120px;background:#0b0e14;border:1px solid var(--line);border-radius:6px"></canvas>
    <p class="hint" style="margin-top:6px">Live FFT from <code>getOutputByteFrequencyData</code> (green = agent) / <code>getInputByteFrequencyData</code> (blue = mic). Voice sessions only (WebRTC uses pcm_48000).</p>
  </div>`;
}

// ---------- client tool registered from a component ----------
function ClientToolDemo() {
  const [flash, setFlash] = useState("#11151f");
  const [last, setLast] = useState("—");
  useConversationClientTool("highlight_panel", (params) => {
    const color = params?.color || "#6db035";
    setFlash(color); setLast(JSON.stringify(params)); emit("clientTool:highlight_panel", params);
    setTimeout(() => setFlash("#11151f"), 1200);
    return "panel highlighted " + color;
  });
  return html`<div style=${`transition:.3s;background:${flash};border:1px solid var(--line);border-radius:8px;padding:12px`}>
    <p class="hint" style="margin:0">Registered <code>useConversationClientTool("highlight_panel")</code>. Configure a matching client tool on the agent, then ask it to “highlight the panel green”. Last call: <strong>${last}</strong></p>
  </div>`;
}

// ---------- event log ----------
function EventLog() {
  const events = useEventFeed();
  return html`<pre class="out" style="max-height:340px">${events.length === 0 ? "// callbacks stream here once a session starts" : events.map((e) => `[${e.ts}] ${e.type}  ${short(e.data)}`).join("\n")}</pre>`;
}

// ---------- inner app (inside provider) ----------
function Inner({ agentId, settings }) {
  // useConversation combined hook — proof it coexists with granular hooks
  const combined = useConversation();
  useEffect(() => { emit("useConversation", { status: combined.status, isSpeaking: combined.isSpeaking }); }, [combined.status, combined.isSpeaking]);
  return html`
    <${Card} id="session" title="Session status" sec="K2·K4·K6">
      <${StatusMode}/>
      <${MuteFeedback}/>
    <//>
    <${Card} id="controls" title="Conversation controls" sec="K3·K10-K13·H7·H8">
      <${Controls} agentId=${agentId} settings=${settings}/>
    <//>
    <${Card} id="viz" title="Audio-reactive visualizer" sec="K14"><${Visualizer}/><//>
    <${Card} id="tools" title="Client tools (agent-invoked)" sec="K8·K18"><${ClientToolDemo}/><//>
    <${Card} id="events" title="Live event log (all callbacks)" sec="L1-L9"><${EventLog}/><//>`;
}

// ---------- app shell + provider ----------
function App() {
  const [agentId, setAgentId] = useState("");
  const [settings, setSettings] = useState({ textOnly: true, conn: "agent-id", serverLocation: "us", userId: "" });
  const [muted, setMuted] = useState(false);
  const [ver, setVer] = useState(0); // bump to remount provider

  useEffect(() => { fetch("/api/config").then((r) => r.json()).then((d) => { setAgentId(d.showcaseAgentId); document.getElementById("agentChip").textContent = "agent: " + d.showcaseAgentId; }); }, []);

  const providerProps = useMemo(() => ({
    serverLocation: settings.serverLocation,
    textOnly: settings.textOnly,
    isMuted: muted, onMutedChange: setMuted,
    clientTools: {
      // provider-level tool; component-level one added via useConversationClientTool
      open_url: ({ url }) => { emit("clientTool:open_url", url); window.open(url, "_blank", "noopener"); return "opened"; },
    },
    onConnect: (x) => emit("onConnect", x), onDisconnect: (x) => emit("onDisconnect", x),
    onError: (e) => emit("onError", e?.message || e), onStatusChange: (s) => emit("onStatusChange", s?.status ?? s),
    onModeChange: (m) => emit("onModeChange", m?.mode ?? m), onMessage: (m) => emit("onMessage", m),
    onCanSendFeedbackChange: (x) => emit("onCanSendFeedbackChange", x), onDebug: (d) => emit("onDebug", d),
    onUnhandledClientToolCall: (t) => emit("onUnhandledClientToolCall", t), onVadScore: (v) => emit("onVadScore", v?.vadScore ?? v),
    onAudioAlignment: (a) => emit("onAudioAlignment", { chars: a?.chars?.length }), onAgentChatResponsePart: (p) => emit("onAgentChatResponsePart", p?.type ?? p),
  }), [settings.serverLocation, settings.textOnly, muted]);

  if (!agentId) return html`<p class="hint">loading showcase agent…</p>`;

  const set = (k, v) => { setSettings((s) => ({ ...s, [k]: v })); setVer((n) => n + 1); };
  return html`
    <${Card} id="settings" title="Provider settings" sec="K1·K17">
      <p class="hint">All hooks below run inside one <code>ConversationProvider</code>. Changing connection settings remounts the provider.</p>
      <div class="grid">
        <div class="ctrl"><label>Mode</label>
          <label class="toggle"><input type="checkbox" checked=${settings.textOnly} onChange=${(e) => set("textOnly", e.target.checked)}/> text-only (chat)</label></div>
        <div class="ctrl"><label>Connection</label>
          <select value=${settings.conn} onChange=${(e) => set("conn", e.target.value)}>
            <option value="agent-id">agent-id (public)</option>
            <option value="signed-url">signed-url (WebSocket auth)</option>
            <option value="token">conversation-token (WebRTC)</option>
          </select></div>
        <div class="ctrl"><label>Server location</label>
          <select value=${settings.serverLocation} onChange=${(e) => set("serverLocation", e.target.value)}>
            ${["us", "global", "eu-residency", "in-residency"].map((o) => html`<option value=${o}>${o}</option>`)}
          </select></div>
        <div class="ctrl"><label>End-user ID</label><input type="text" value=${settings.userId} onInput=${(e) => set("userId", e.target.value)}/></div>
      </div>
    <//>
    ${html`<${ConversationProvider} ...${providerProps} key=${ver}><${Inner} agentId=${agentId} settings=${settings}/><//>`}`;
}

createRoot(document.getElementById("root")).render(html`<${App}/>`);
