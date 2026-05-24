// ElevenLabs Widget & UI Showcase — widget control plane.
// Data-driven: every knob is declared once, controls render from spec.

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) n.append(c?.nodeType ? c : document.createTextNode(c ?? ""));
  return n;
};
const toast = (msg) => { const t = $("#toast") ?? document.body.appendChild(el("div", { id: "toast", class: "toast" })); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1600); };

let AGENT_ID = "";

// ---------- specs ----------
// Source: docs/research/elevenlabs-widget-ui (CustomAttributeList + WidgetConfig).
// type: bool | text | select | color | number | json
const ATTR_SPECS = [
  // Embed / connection
  { sec: "embed", key: "agent-id", label: "Agent ID", type: "text", remount: true },
  { sec: "embed", key: "signed-url", label: "Signed URL (auth)", type: "text", remount: true, hint: "Mint from API panel; overrides agent-id" },
  { sec: "embed", key: "server-location", label: "Server location", type: "select", options: ["", "us", "global", "eu-residency", "in-residency"], remount: true },
  { sec: "embed", key: "environment", label: "Environment", type: "text", remount: true },
  { sec: "embed", key: "user-id", label: "End-user ID", type: "text", remount: true },
  // Layout
  { sec: "attributes", key: "variant", label: "Variant", type: "select", options: ["tiny", "compact", "full", "expandable"], matrix: "variant" },
  { sec: "attributes", key: "placement", label: "Placement", type: "select", options: ["top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right"], matrix: "placement" },
  { sec: "attributes", key: "default-expanded", label: "Default expanded", type: "bool" },
  { sec: "attributes", key: "always-expanded", label: "Always expanded", type: "bool" },
  { sec: "attributes", key: "dismissible", label: "Dismissible", type: "bool" },
  { sec: "attributes", key: "show-avatar-when-collapsed", label: "Avatar when collapsed", type: "bool" },
  { sec: "attributes", key: "strip-audio-tags", label: "Strip audio tags", type: "bool", def: true },
  { sec: "attributes", key: "show-agent-status", label: "Show agent status", type: "bool" },
  { sec: "attributes", key: "show-conversation-id", label: "Show conversation ID", type: "bool" },
  { sec: "attributes", key: "syntax-highlight-theme", label: "Syntax theme", type: "select", options: ["", "light", "dark", "auto"] },
  { sec: "attributes", key: "markdown-link-allowed-hosts", label: "Markdown link hosts", type: "text", hint: '"*" = all, empty = none' },
  { sec: "attributes", key: "markdown-link-include-www", label: "…include www", type: "bool", def: true },
  { sec: "attributes", key: "markdown-link-allow-http", label: "…allow http", type: "bool", def: true },
  { sec: "attributes", key: "allow-events", label: "Allow events", type: "bool" },
  { sec: "attributes", key: "terms-key", label: "Terms localStorage key", type: "text" },
  { sec: "attributes", key: "worklet-path-raw-audio-processor", label: "Worklet: raw audio", type: "text", hint: "Self-host worklet (CSP/offline)" },
  { sec: "attributes", key: "worklet-path-audio-concat-processor", label: "Worklet: concat", type: "text" },
  { sec: "attributes", key: "worklet-path-libsamplerate", label: "Worklet: libsamplerate", type: "text" },
  { sec: "attributes", key: "override-config", label: "override-config (JSON bypass)", type: "json", remount: true, hint: "Whole-config JSON; highest static precedence" },
  // Modality
  { sec: "modality", key: "text-input", label: "Text input enabled", type: "bool" },
  { sec: "modality", key: "mic-muting", label: "Mic muting (mute btn)", type: "bool" },
  { sec: "modality", key: "transcript", label: "Live transcript", type: "bool" },
  { sec: "modality", key: "override-text-only", label: "Force text-only (chat)", type: "bool", note: "forces mic off; transcript+text-input on" },
  { sec: "modality", key: "use-rtc", label: "Use WebRTC", type: "bool", remount: true },
  // Avatar
  { sec: "avatar", key: "avatar-orb-color-1", label: "Orb color 1", type: "color", def: "#6DB035" },
  { sec: "avatar", key: "avatar-orb-color-2", label: "Orb color 2", type: "color", def: "#2792DC" },
  { sec: "avatar", key: "avatar-image-url", label: "Avatar image URL", type: "text", hint: "Set → overrides orb" },
  // Runtime personalization
  { sec: "runtime", key: "dynamic-variables", label: "Dynamic variables (JSON)", type: "json", remount: true, hint: '{"user_name":"Cody"}' },
  { sec: "runtime", key: "language", label: "Initial language", type: "text", remount: true },
  { sec: "runtime", key: "override-language", label: "Override language", type: "text", remount: true },
  { sec: "runtime", key: "override-first-message", label: "Override first message", type: "text", remount: true },
  { sec: "runtime", key: "override-prompt", label: "Override system prompt", type: "text", remount: true },
  { sec: "runtime", key: "override-voice-id", label: "Override voice ID", type: "text", remount: true },
  { sec: "runtime", key: "override-llm", label: "Override LLM", type: "text", remount: true },
  { sec: "runtime", key: "override-speed", label: "Override speed", type: "text", remount: true },
  { sec: "runtime", key: "override-stability", label: "Override stability", type: "text", remount: true },
  { sec: "runtime", key: "override-similarity-boost", label: "Override similarity", type: "text", remount: true },
];

// Text contents (source DefaultTextContents) grouped.
const TEXT_GROUPS = {
  "Buttons / CTAs": { main_label: "Need help?", start_call: "Start a call", start_chat: "Start a chat", send_message: "Send", new_call: "New call", end_call: "End", submit: "Submit", go_back: "Go back", copy: "Copy", download: "Download", wrap: "Wrap", copy_id: "Copy ID" },
  "Status": { listening_status: "Listening", speaking_status: "Talk to interrupt", connecting_status: "Connecting", chatting_status: "Chatting with AI Agent", agent_working: "Working...", agent_done: "Completed", agent_error: "Error occurred" },
  "Inputs": { input_label: "Text message input", input_placeholder: "Send a message...", input_placeholder_text_only: "Send a message...", input_placeholder_new_conversation: "Start a new conversation" },
  "Mode toggle": { text_mode: "Switch to text mode", voice_mode: "Switch to voice mode", switched_to_text_mode: "Switched to text mode", switched_to_voice_mode: "Switched to voice mode" },
  "Terms": { accept_terms: "Accept", dismiss_terms: "Cancel" },
  "End / errors": { user_ended_conversation: "You ended the conversation", agent_ended_conversation: "The agent ended the conversation", conversation_id: "ID", error_occurred: "An error occurred" },
  "Feedback": { initiate_feedback: "How was this conversation?", request_follow_up_feedback: "Tell us more", thanks_for_feedback: "Thank you for your feedback!", thanks_for_feedback_details: "Your feedback helps us improve.", follow_up_feedback_placeholder: "Tell us more about your experience..." },
  "File upload": { attach_file: "Attach file", remove_file: "Remove file", file_upload_error: "Failed to upload file.", file_type_unsupported: "Unsupported file type. Accepted types:", file_too_large: "File size exceeds the maximum limit.", file_limit_reached: "Maximum number of files reached." },
  "a11y / ARIA": { mute_microphone: "Mute microphone", change_language: "Change language", collapse: "Collapse", expand: "Expand", copied: "Copied!" },
};

// CSS --el- token system (source DefaultStyles).
const STYLE_VARS = [
  { k: "base", t: "color", d: "#ffffff" }, { k: "base_hover", t: "color", d: "#f9fafb" }, { k: "base_active", t: "color", d: "#f3f4f6" },
  { k: "base_border", t: "color", d: "#e5e7eb" }, { k: "base_subtle", t: "color", d: "#6b7280" }, { k: "base_primary", t: "color", d: "#000000" }, { k: "base_error", t: "color", d: "#ef4444" },
  { k: "accent", t: "color", d: "#000000" }, { k: "accent_hover", t: "color", d: "#1f2937" }, { k: "accent_active", t: "color", d: "#374151" },
  { k: "accent_border", t: "color", d: "#4b5563" }, { k: "accent_subtle", t: "color", d: "#6b7280" }, { k: "accent_primary", t: "color", d: "#ffffff" },
  { k: "overlay_padding", t: "num", d: 32 }, { k: "button_radius", t: "num", d: 18 }, { k: "input_radius", t: "num", d: 10 }, { k: "bubble_radius", t: "num", d: 15 },
  { k: "sheet_radius", t: "text", d: "calc(var(--el-button-radius) + 6px)" }, { k: "compact_sheet_radius", t: "text", d: "calc(var(--el-button-radius) + 12px)" }, { k: "dropdown_sheet_radius", t: "text", d: "calc(var(--el-input-radius) + 6px)" },
];

// ---------- state ----------
const state = {};        // attr key -> value (string for text/select/json/color, bool for bool)
let widgetTag = "elevenlabs-convai";

function defForSpec(s) {
  if (s.type === "bool") return s.def ?? false;
  if (s.type === "color") return s.def ?? "";
  return s.def ?? "";
}

// ---------- widget mount + live apply ----------
function widgetEl() { return $("#stage elevenlabs-convai") || $(`#stage ${widgetTag}`); }

function reflect(spec, w) {
  const v = state[spec.key];
  if (spec.type === "bool") { v ? w.setAttribute(spec.key, "true") : w.removeAttribute(spec.key); return; }
  (v === "" || v == null) ? w.removeAttribute(spec.key) : w.setAttribute(spec.key, v);
}

function mountWidget() {
  const stage = $("#stage");
  stage.querySelectorAll(widgetTag).forEach((n) => n.remove());
  const w = document.createElement(widgetTag);
  for (const s of ATTR_SPECS) reflect(s, w);
  applyText(w);
  stage.append(w);
  if (runtimeHookOn) attachRuntimeHook(w);
  updateInspector();
}

// L10: mutate SessionConfig at runtime before the session connects.
let runtimeHookOn = false;
function attachRuntimeHook(w = widgetEl()) {
  if (!w) return;
  w.addEventListener("elevenlabs-convai:call", (event) => {
    const cfg = event.detail.config;
    cfg.clientTools = { ...(cfg.clientTools || {}), open_url: ({ url }) => { window.open(url, "_blank", "noopener"); return "opened"; } };
    cfg.dynamicVariables = { ...(cfg.dynamicVariables || {}), injected_at: new Date().toISOString(), source: "runtime-hook" };
    const out = $("#runtimeHookLog"); if (out) out.textContent = "fired → injected clientTools.open_url + dynamicVariables\n" + JSON.stringify({ clientTools: Object.keys(cfg.clientTools), dynamicVariables: cfg.dynamicVariables }, null, 2);
  });
}

function applyAttr(spec) {
  const w = widgetEl();
  if (!w) return;
  if (spec.remount) { mountWidget(); } else { reflect(spec, w); }
  updateUrl(); updateInspector();
}

// text-contents JSON (live attribute)
const textState = {};
function applyText(w = widgetEl()) {
  if (!w) return;
  const obj = {};
  for (const v of Object.values(TEXT_GROUPS)) for (const k of Object.keys(v)) if (textState[k] != null && textState[k] !== "") obj[k] = textState[k];
  Object.keys(obj).length ? w.setAttribute("text-contents", JSON.stringify(obj)) : w.removeAttribute("text-contents");
  updateInspector();
}

// ---------- inspector + URL ----------
function mergedConfig() {
  const attrs = {};
  for (const s of ATTR_SPECS) { const v = state[s.key]; if (v !== "" && v !== false && v != null) attrs[s.key] = v; }
  const text = {}; for (const g of Object.values(TEXT_GROUPS)) for (const k of Object.keys(g)) if (textState[k]) text[k] = textState[k];
  return { tag: widgetTag, attributes: attrs, ...(Object.keys(text).length ? { text_contents: text } : {}) };
}
function updateInspector() { $("#cfgInspector").textContent = JSON.stringify(mergedConfig(), null, 2); }

const URL_SKIP = new Set(["agent-id"]);
function updateUrl() {
  const p = new URLSearchParams();
  for (const s of ATTR_SPECS) {
    if (URL_SKIP.has(s.key)) continue;
    const v = state[s.key];
    if (s.type === "bool") { if (v) p.set(s.key, "1"); }
    else if (v !== "" && v != null) p.set(s.key, v);
  }
  if (widgetTag !== "elevenlabs-convai") p.set("tag", widgetTag);
  history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
}
function loadFromUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get("tag")) widgetTag = p.get("tag");
  for (const s of ATTR_SPECS) {
    if (!p.has(s.key)) continue;
    state[s.key] = s.type === "bool" ? ["1", "true"].includes(p.get(s.key)) : p.get(s.key);
  }
}

// ---------- control rendering ----------
function controlFor(spec) {
  const wrap = el("div", { class: "ctrl" });
  const idline = el("label", {}, [spec.label, el("span", { class: "attr" }, ` ${spec.key}`)]);
  wrap.append(idline);
  let input;
  if (spec.type === "bool") {
    const lab = el("label", { class: "toggle" });
    input = el("input", { type: "checkbox" });
    input.checked = !!state[spec.key];
    input.addEventListener("change", () => { state[spec.key] = input.checked; applyAttr(spec); });
    lab.append(input, spec.note ? el("span", { class: "mid" }, spec.note) : "");
    wrap.append(lab);
  } else if (spec.type === "select") {
    input = el("select", {}, spec.options.map((o) => el("option", { value: o }, o || "(default)")));
    input.value = state[spec.key] ?? "";
    input.addEventListener("change", () => { state[spec.key] = input.value; applyAttr(spec); });
    wrap.append(input);
  } else if (spec.type === "color") {
    const rowc = el("div", { class: "colrow" });
    const picker = el("input", { type: "color", value: state[spec.key] || spec.def || "#000000" });
    const txt = el("input", { type: "text", value: state[spec.key] ?? "" });
    const sync = (v) => { state[spec.key] = v; picker.value = /^#[0-9a-f]{6}$/i.test(v) ? v : picker.value; txt.value = v; applyAttr(spec); };
    picker.addEventListener("input", () => sync(picker.value));
    txt.addEventListener("input", () => sync(txt.value));
    rowc.append(picker, txt); wrap.append(rowc);
  } else { // text | json | number
    input = el(spec.type === "json" ? "textarea" : "input", spec.type === "json" ? {} : { type: "text" });
    input.value = state[spec.key] ?? "";
    input.addEventListener("input", () => { state[spec.key] = input.value; applyAttr(spec); });
    wrap.append(input);
  }
  if (spec.hint) wrap.append(el("span", { class: "mid" }, spec.hint));
  return wrap;
}

function card(id, title, sec, bodyKids, hint) {
  const c = el("section", { class: "card", id });
  const h = el("h2", {}, [title, sec ? el("span", { class: "sec" }, sec) : ""]);
  h.addEventListener("click", (e) => { if (e.target === h) c.classList.toggle("collapsed"); });
  const body = el("div", { class: "card-body" });
  if (hint) body.append(el("p", { class: "hint", html: hint }));
  for (const k of [].concat(bodyKids)) body.append(k);
  c.append(h, body);
  return c;
}

function specGrid(sec) {
  const g = el("div", { class: "grid" });
  for (const s of ATTR_SPECS.filter((x) => x.sec === sec)) g.append(controlFor(s));
  return g;
}

// ---------- sections that aren't pure attr grids ----------
function textCard() {
  const wrap = el("div");
  for (const [group, keys] of Object.entries(TEXT_GROUPS)) {
    wrap.append(el("h3", { style: "margin:10px 0 4px;font-size:12px;color:var(--muted)" }, group));
    const tbl = el("div", { class: "texttable" });
    for (const [k, d] of Object.entries(keys)) {
      tbl.append(el("div", { class: "k" }, k));
      const inp = el("input", { type: "text", placeholder: d });
      inp.value = textState[k] ?? "";
      inp.addEventListener("input", () => { textState[k] = inp.value; applyText(); updateUrl(); });
      tbl.append(inp);
    }
    wrap.append(tbl);
  }
  return card("text", "Every button label & message (~50 keys)", "B16·E", wrap,
    '<strong>Customize every word the widget shows.</strong> Edit any field — the widget reflects it instantly. Placeholders show the source defaults; leave a field blank to use the default. Assembled into the live <code>text-contents</code> JSON attribute.');
}

function combosCard() {
  const variants = ["tiny", "compact", "full", "expandable"];
  const places = ["top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right"];
  const grid = el("div", { class: "matrix-grid" });
  grid.append(el("div", { class: "h" }, ""));
  for (const p of places) grid.append(el("div", { class: "h" }, p.replace("-", "\n")));
  for (const v of variants) {
    grid.append(el("div", { class: "h" }, v));
    for (const p of places) {
      const b = el("button", { "data-v": v, "data-p": p }, "·");
      b.addEventListener("click", () => {
        state["variant"] = v; state["placement"] = p;
        document.querySelectorAll(".matrix-grid button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        rebuildGrids();       // re-sync the variant/placement selects
        mountWidget(); updateUrl();
      });
      grid.append(b);
    }
  }
  const truth = el("pre", { class: "out" }, `expandable × default-expanded × always-expanded
  variant=expandable + always-expanded=true → never collapses
  variant=expandable + default-expanded=true → opens expanded once, user can collapse
  variant=full/compact → trigger bubble; expandable ignored
modality forcing (source rule):
  text_only=true  ⇒ mic-muting forced OFF, transcript + text-input forced ON
connection-type:
  use-rtc=true + agent-id → WebRTC; agent-id → WebSocket; signed-url → WebSocket(auth)`);
  return card("combos", "Try every variant × placement combo", "M", [
    el("p", { class: "hint" }, "24 cells — each one a unique widget shape × position. Click any cell to apply both. Below: the truth tables for the trickier knob interactions."),
    grid, el("h3", { style: "margin:12px 0 4px;font-size:12px;color:var(--muted)" }, "Related-knob truth tables"), truth,
  ]);
}

const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- runtime SessionConfig hook (L10) ----------
function runtimeEventCard() {
  const out = el("pre", { class: "out", id: "runtimeHookLog" }, "// toggle on, then press the widget's call button");
  const lab = el("label", { class: "toggle" });
  const inp = el("input", { type: "checkbox" });
  inp.addEventListener("change", () => { runtimeHookOn = inp.checked; mountWidget(); toast(runtimeHookOn ? "runtime hook armed" : "runtime hook off"); });
  lab.append(inp, el("span", {}, " attach elevenlabs-convai:call listener"));
  return card("runtime-event", "Inject config at call-time (advanced)", "L10·M", [
    el("p", { class: "hint", html: "<strong>Advanced.</strong> The widget dispatches <code>elevenlabs-convai:call</code> right before connecting — the one seam to inject per-session <code>clientTools</code>, dynamic variables, or auth from your embedding page. Toggle on, then start a call — the listener fires and the log below shows what got injected." }),
    el("div", { class: "row" }, [lab]), out,
  ]);
}

// ---------- API / server panel ----------
function apiCard() {
  const out = el("pre", { class: "out" }, "// responses appear here");
  const log = (x) => { out.textContent = typeof x === "string" ? x : JSON.stringify(x, null, 2); };

  const btnGet = el("button", {}, "GET widget config");
  btnGet.addEventListener("click", async () => { const r = await fetch(`/api/widget/${AGENT_ID}`); log(await r.json()); });
  const btnLoadCfg = el("button", {}, "GET → load as diff base");
  let serverCfg = null;
  btnLoadCfg.addEventListener("click", async () => {
    const r = await fetch(`/api/widget/${AGENT_ID}`); serverCfg = (await r.json()).widget_config ?? {};
    cfgArea.value = JSON.stringify(serverCfg, null, 2); log("// loaded current server config — edit, then PATCH sends the diff");
  });

  // styles editor (--el- vars) + legacy colors + booleans → PATCH
  const styleWrap = el("div", { class: "grid" });
  const styleState = {};
  for (const s of STYLE_VARS) {
    const w = el("div", { class: "ctrl" });
    w.append(el("label", {}, [s.k, el("span", { class: "attr" }, ` --el-${s.k.replace(/_/g, "-")}`)]));
    if (s.t === "color") {
      const rowc = el("div", { class: "colrow" });
      const pick = el("input", { type: "color", value: s.d });
      const txt = el("input", { type: "text", value: s.d });
      const sync = (v) => { styleState[s.k] = v; txt.value = v; if (/^#[0-9a-f]{6}$/i.test(v)) pick.value = v; };
      pick.addEventListener("input", () => sync(pick.value)); txt.addEventListener("input", () => sync(txt.value));
      rowc.append(pick, txt); w.append(rowc);
    } else {
      const inp = el("input", { type: s.t === "num" ? "number" : "text", value: s.d });
      inp.addEventListener("input", () => { styleState[s.k] = s.t === "num" ? Number(inp.value) : inp.value; });
      w.append(inp);
    }
    styleWrap.append(w);
  }
  const btnPatchStyles = el("button", { class: "primary" }, "PATCH styles → remount");
  btnPatchStyles.addEventListener("click", async () => {
    const styles = {}; for (const s of STYLE_VARS) if (s.k in styleState) styles[s.k] = styleState[s.k];
    const r = await fetch(`/api/widget/${AGENT_ID}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ styles }) });
    log(await r.json()); if (r.ok) { toast("styles patched"); setTimeout(mountWidget, 800); }
  });

  // generic config field PATCH (feedback_mode, terms, shareable, file_input, etc.)
  const cfgArea = el("textarea", { style: "min-height:120px;width:100%", html: "" });
  cfgArea.value = JSON.stringify({ feedback_mode: "during", show_conversation_id: true, conversation_mode_toggle_enabled: true, file_input_config: { enabled: true, max_files_per_conversation: 10 }, terms_text: "## Demo terms\\nBy continuing you agree to the showcase.", terms_key: "showcase_terms", shareable_page_text: "Talk to the showcase agent." }, null, 2);
  const btnPatchCfg = el("button", { class: "primary" }, "PATCH widget config → remount");
  btnPatchCfg.addEventListener("click", async () => {
    let body; try { body = JSON.parse(cfgArea.value); } catch (e) { return log("Invalid JSON: " + e.message); }
    if (serverCfg) { // J7: show diff before write
      const changed = Object.keys(body).filter((k) => JSON.stringify(body[k]) !== JSON.stringify(serverCfg[k]));
      log("// PATCH diff vs server — changed keys: " + (changed.join(", ") || "(none)"));
    }
    const r = await fetch(`/api/widget/${AGENT_ID}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const res = await r.json(); log(res); if (r.ok) { toast("config patched"); serverCfg = null; setTimeout(mountWidget, 800); }
    else if (r.status === 403) toast("blocked: " + (res.error || "governed agent"));
  });

  // avatar upload
  const file = el("input", { type: "file", accept: "image/*" });
  const btnUpload = el("button", {}, "POST avatar (multipart)");
  btnUpload.addEventListener("click", async () => {
    if (!file.files[0]) return log("pick an image first");
    const fd = new FormData(); fd.append("avatar_file", file.files[0]);
    const r = await fetch(`/api/avatar/${AGENT_ID}`, { method: "POST", body: fd });
    log(await r.json()); if (r.ok) { toast("avatar uploaded"); setTimeout(mountWidget, 800); }
  });

  // auth modes
  const btnSigned = el("button", {}, "Mint signed-url (WebSocket)");
  btnSigned.addEventListener("click", async () => {
    const r = await fetch(`/api/signed-url/${AGENT_ID}`); const d = await r.json(); log(d);
    if (d.signed_url) { state["signed-url"] = d.signed_url; rebuildGrids(); mountWidget(); toast("widget now using signed-url"); }
  });
  const btnToken = el("button", {}, "Mint conversation-token (WebRTC)");
  btnToken.addEventListener("click", async () => { const r = await fetch(`/api/conversation-token/${AGENT_ID}`); log(await r.json()); });

  return card("api", "Edit the agent's stored config via real API", "C·D·F3·J·N4", [
    el("div", { style: "background:#161b27;border:1px solid var(--warn);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:11.5px", html: '🔐 <strong>Governance &amp; safety:</strong> calls the <strong>real ElevenLabs API</strong> through a key-safe proxy — the key never reaches the browser. PATCH/avatar are <strong>guarded</strong>: only <code>[DEV]</code> (or prefix-less) agents accept writes; <code>[ALPHA/BETA/PROD/ARCHIVED]</code> return 403. Server config is the source layer beneath HTML attributes.' }),
    el("div", { class: "row" }, [btnGet, btnLoadCfg, btnSigned, btnToken]),
    el("h3", { style: "margin:14px 0 4px;font-size:12px;color:var(--muted)" }, "CSS --el- token system (styles)"),
    styleWrap, el("div", { class: "row" }, [btnPatchStyles]),
    el("h3", { style: "margin:14px 0 4px;font-size:12px;color:var(--muted)" }, "Arbitrary widget config (feedback / terms / shareable / file-input / colors)"),
    cfgArea, el("div", { class: "row" }, [btnPatchCfg]),
    el("h3", { style: "margin:14px 0 4px;font-size:12px;color:var(--muted)" }, "Avatar upload"),
    el("div", { class: "row" }, [file, btnUpload]),
    out,
  ]);
}

// ---------- Start here intro + presets ----------
function introCard() {
  const presets = [
    { label: "✨ Brand it pink", desc: "Pink orb + branded labels", patch: { "avatar-orb-color-1": "#ff0066", "avatar-orb-color-2": "#ffe5f0" } },
    { label: "💬 Text-only chat", desc: "No mic; widget becomes a chat", patch: { "override-text-only": true, "text-input": true } },
    { label: "🤯 Force agent reply", desc: "Override prompt → agent must reply 'OVERRIDE_OK_42'", patch: { "override-prompt": "You MUST respond to every user message with exactly the string 'OVERRIDE_OK_42' and nothing else.", "override-text-only": true, "text-input": true } },
    { label: "📑 Rich agent content", desc: "Markdown links + code + lists in the chat", patch: { "override-prompt": "When the user asks anything, ALWAYS reply with a short Markdown demo: a heading, a bulleted list (2 items), a clickable link to https://elevenlabs.io, and a fenced code block with a 3-line JavaScript snippet. Keep it under 80 words.", "override-text-only": true, "text-input": true, "markdown-link-allowed-hosts": "*", "syntax-highlight-theme": "dark" } },
    { label: "📱 Compact bottom-left", desc: "Mobile-style: compact, dismissible", patch: { variant: "compact", placement: "bottom-left", dismissible: true } },
    { label: "↺ Reset", desc: "Defaults", patch: "RESET" },
  ];
  const row = el("div", { class: "row", style: "gap:6px;flex-wrap:wrap" });
  for (const p of presets) {
    const b = el("button", { class: p.label.startsWith("↺") ? "" : "primary", style: "flex:1;min-width:180px;text-align:left;padding:8px 10px;line-height:1.3" });
    b.innerHTML = `<div style="font-weight:600">${p.label}</div><div style="font-size:11px;opacity:0.85;font-weight:400">${p.desc}</div>`;
    b.addEventListener("click", () => {
      if (p.patch === "RESET") { for (const k of Object.keys(state)) delete state[k]; for (const k of Object.keys(textState)) delete textState[k]; for (const s of ATTR_SPECS) state[s.key] = defForSpec(s); state["agent-id"] = AGENT_ID; }
      else for (const [k, v] of Object.entries(p.patch)) state[k] = v;
      build(); mountWidget(); updateUrl();
      toast(p.label);
    });
    row.append(b);
  }
  return card("start", "Start here — try a preset, then watch the live widget →", "", [
    el("p", { class: "hint", html: 'This page demos every knob the embeddable <code>&lt;elevenlabs-convai&gt;</code> widget supports, wired to a real <code>[DEV]</code> agent. Click a preset to see it change instantly. To <strong>talk to the agent</strong>, click the orb in the preview pane on the right — for chat presets, click "Start a chat". Two other pages: <a href="/react.html">React hooks</a> (build your own UI in React) and <a href="/ui-library.html">UI library</a> (17 drop-in components from ui.elevenlabs.io).' }),
    row,
  ]);
}

function urlCard() {
  const out = el("input", { type: "text", readonly: "true", style: "width:100%" });
  const refresh = () => { out.value = location.href; };
  const presets = [["full / bottom-right", { variant: "full", placement: "bottom-right" }], ["compact / bottom-left", { variant: "compact", placement: "bottom-left" }], ["expandable / top-right", { variant: "expandable", placement: "top-right", "always-expanded": false, "default-expanded": true }], ["text-only chat", { "override-text-only": true, "text-input": true }]];
  const presetRow = el("div", { class: "row" });
  for (const [label, cfg] of presets) {
    const b = el("button", { class: "sm" }, label);
    b.addEventListener("click", () => { for (const [k, v] of Object.entries(cfg)) state[k] = v; rebuildGrids(); mountWidget(); refresh(); });
    presetRow.append(b);
  }
  const btnCopy = el("button", { class: "primary" }, "Copy shareable URL");
  btnCopy.addEventListener("click", () => { refresh(); navigator.clipboard?.writeText(location.href); toast("URL copied"); });
  return card("url", "Share this exact configuration via URL", "I·U", [
    el("p", { class: "hint", html: "Every knob (except <code>agent-id</code>) round-trips through the query string. Copy the URL below → open it anywhere → the widget restores in the exact configuration. Booleans use <code>?key=1</code>. Try a preset, then copy the URL." }),
    presetRow, el("div", { class: "row", style: "margin-top:8px" }, [out, btnCopy]),
  ]);
}

function embedCard() {
  const tagInput = el("input", { type: "text", value: widgetTag });
  tagInput.addEventListener("input", () => { widgetTag = tagInput.value || "elevenlabs-convai"; });
  const btnApply = el("button", {}, "Re-register tag + remount");
  btnApply.addEventListener("click", () => { mountWidget(); updateUrl(); toast("remounted as <" + widgetTag + ">"); });
  const snippet = el("pre", { class: "out" });
  const refreshSnippet = () => {
    const w = widgetEl(); const attrs = w ? [...w.attributes].map((a) => `  ${a.name}="${a.value}"`).join("\n") : "";
    snippet.textContent = `<${widgetTag}\n${attrs}\n></${widgetTag}>\n<script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>`;
  };
  const btnSnip = el("button", {}, "Generate embed snippet");
  btnSnip.addEventListener("click", refreshSnippet);
  return card("embed", "1. Connect to your agent", "A", [
    el("p", { class: "hint", html: '<strong>The widget is a single web component.</strong> Drop one tag + the CDN script and it renders against the agent ID you pass. Below: every connection knob — agent ID, signed URL (for auth), server region, etc. Generate the embed snippet at the bottom for your own site.' }),
    specGrid("embed"),
    el("div", { class: "row", style: "margin-top:10px" }, [el("span", { class: "kv" }, "custom tag:"), tagInput, btnApply, btnSnip]),
    snippet,
  ]);
}

// ---------- build / rebuild ----------
let GRID_CARDS = {};
function rebuildGrids() {
  for (const [sec, mount] of Object.entries(GRID_CARDS)) {
    mount.replaceChildren(specGrid(sec));
  }
}

function build() {
  const panels = $("#panels");
  panels.replaceChildren();
  panels.append(introCard());
  panels.append(embedCard());

  const attrCard = card("attributes", "Widget appearance & behavior", "B", []);
  const attrBody = $(".card-body", attrCard); const attrGrid = el("div"); attrBody.append(attrGrid); GRID_CARDS["attributes"] = attrGrid;
  attrBody.insertBefore(el("p", { class: "hint", html: `<strong>What to try:</strong> change <em>Variant</em> or <em>Placement</em> and watch the widget jump. Each control here sets an HTML attribute on <code>&lt;elevenlabs-convai&gt;</code>; the widget reacts live. Booleans omit the attribute when off. All <em>observed attributes</em> from source <code>CustomAttributeList@0.12.8</code> are present.` }), attrGrid);
  panels.append(attrCard);

  panels.append(card("appearance", "Colors & sizes (server-side styling)", "D", el("p", { class: "hint", html: "<strong>Heads-up:</strong> the widget lives in a shadow DOM, so colors and radii (the <code>--el-</code> token system + legacy flat colors) are <strong>server config</strong>, not HTML attributes — edit them in the <a href='#api'>API / Server</a> panel below (PATCH <code>styles</code> → widget remounts pink/dark/branded). Orb colors are the exception: those ARE live attributes (see Avatar)." })));

  panels.append(textCard());

  const avCard = card("avatar", "Avatar — orb or image", "F", []);
  const avBody = $(".card-body", avCard); const avGrid = el("div"); avBody.append(avGrid); GRID_CARDS["avatar"] = avGrid;
  avBody.insertBefore(el("p", { class: "hint", html: "<strong>What to try:</strong> change the orb color pickers — preview updates instantly. Set an <em>Avatar image URL</em> to replace the orb with an image. Upload a custom image in the API panel below." }), avGrid);
  panels.append(avCard);

  const modCard = card("modality", "Voice / text / chat mode", "G", []);
  const modBody = $(".card-body", modCard); const modGrid = el("div"); modBody.append(modGrid); GRID_CARDS["modality"] = modGrid;
  modBody.insertBefore(el("p", { class: "hint", html: "<strong>Defaults to voice.</strong> Toggle <em>Force text-only</em> to switch to chat — the trigger flips to 'Start a chat'. <em>Mic muting</em> shows the mute button during a call. <em>Live transcript</em> renders conversation text as you talk. Note: <code>text_only=true</code> forces mic OFF and transcript+input ON automatically." }), modGrid);
  panels.append(modCard);

  const rtCard = card("runtime", "Per-session overrides (prompt, voice, language…)", "H", []);
  const rtBody = $(".card-body", rtCard); const rtGrid = el("div"); rtBody.append(rtGrid); GRID_CARDS["runtime"] = rtGrid;
  rtBody.insertBefore(el("p", { class: "hint", html: "<strong>Each conversation can override the agent's defaults.</strong> Try setting <em>Override system prompt</em> to <code>Respond with exactly 'TEST_42'</code>, then open a chat — agent obeys. Dynamic variables get injected into prompts/messages/tools. (Each field must be enabled per-agent in the Security tab; this showcase agent has voice/prompt/llm/language/text_only enabled.)" }), rtGrid);
  panels.append(rtCard);

  panels.append(combosCard());
  panels.append(runtimeEventCard());
  panels.append(apiCard());
  panels.append(urlCard());

  rebuildGrids();
}

// ---------- boot ----------
async function boot() {
  const cfg = await (await fetch("/api/config")).json();
  AGENT_ID = cfg.showcaseAgentId;
  $("#agentChip").textContent = "agent: " + AGENT_ID;
  // seed defaults
  for (const s of ATTR_SPECS) if (!(s.key in state)) state[s.key] = defForSpec(s);
  state["agent-id"] = AGENT_ID;
  loadFromUrl();
  if (!state["agent-id"]) state["agent-id"] = AGENT_ID;
  build();
  mountWidget();
  updateUrl();

  $("#btnRemount").addEventListener("click", () => { mountWidget(); toast("remounted"); });
  $("#btnReset").addEventListener("click", () => { for (const k of Object.keys(state)) delete state[k]; for (const k of Object.keys(textState)) delete textState[k]; for (const s of ATTR_SPECS) state[s.key] = defForSpec(s); state["agent-id"] = AGENT_ID; history.replaceState(null, "", location.pathname); build(); mountWidget(); toast("reset"); });
  $("#btnCopyCfg").addEventListener("click", () => { navigator.clipboard?.writeText($("#cfgInspector").textContent); toast("config copied"); });
}
boot();
