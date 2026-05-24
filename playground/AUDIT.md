# Capability Audit — what ElevenLabs UI can do vs. what the showcase actually demonstrates

Honest pass over every capability area: does the control exist, does it drive the real config, and — the part that matters — does the capability **visibly manifest** in the rendered widget / island? Evidence = screenshots in `verify/` and `audit/`, captured in real headless Chromium against the live showcase agent (`agent_7701ksbwcdzcfe0sj8nhtrxem9h1`).

Verdict legend:
- ✅ **Demonstrated** — observed rendering/changing in-browser (screenshot).
- ◑ **Wired & reflected** — control drives the attribute/server-config (asserted), but the visible effect only appears in a specific live state.
- ⏳ **Live-gated** — needs an active AI turn; config verified, full effect bounded by ElevenLabs account quota (hit during testing).
- 🔒 **Host/enterprise-gated** — needs self-hosting / multimodal LLM / enterprise plan; settable here, effect not reproducible in this env.
- ❌ **Not showcased** — genuine omission.

## Summary

The showcase is **real, not cosmetic**: controls drive the actual web component and the real ElevenLabs API, and the capabilities are confirmed end-to-end against the live showcase agent. After the account upgrade, the live-probe suite reaches **7/7 ✅** — multi-turn conversation, runtime-override *effects* (agent reply forced to a sentinel), WebRTC via `conversation-token`, voice visualizer, in-call chrome, signed-url auth, and `useScribe` realtime STT (single-use token + `scribe_v2_realtime` model, `status: connected` + `sessionStarted`).

| # | Visually confirmed | Evidence |
|---|---|---|
| Widget renders against the real agent (orb + trigger) | ✅ | `verify/01` |
| 21/21 HTML-attribute controls reflect onto the element | ✅ | `verify/08` |
| Custom `text-contents` labels render on the trigger | ✅ | `audit/A` ("AUDIT — custom label / begin") |
| Avatar image replaces the orb | ✅ | `audit/B` |
| `styles` PATCH visibly recolors the widget (accent→pink) | ✅ | `audit/C` |
| `text_only` flips trigger to "Start a chat" | ✅ | `audit/D` |
| `expandable` variant opens; terms modal shows | ✅ | `audit/E`, `verify/04` |
| Live **voice call** in-call chrome (orb, mute toggle, text input, language selector) | ✅ | `audit/F` |
| Live **signed-url** auth connection (WebSocket) | ✅ | `audit/G` (`status: connected`) |
| Live **text conversation** round-trip (agent replies) | ✅ | `verify/07` |
| React island mounts; all hooks; event log streams callbacks | ✅ | `verify/05–07` |
| API GET + PATCH round-trip (DEV-guarded; BETA/PROD→403) | ✅ | `verify/09`, server guard test |
| URL params drive the widget on load | ✅ | `verify/10` |
| Runtime `override-prompt` forces agent reply to sentinel (`OVERRIDE_OK_42`) | ✅ | `audit/H` |
| `conversation-token` → WebRTC connected (React voice) | ✅ | `audit/I` |
| Voice visualizer canvas active in live voice session | ✅ | `audit/J` |
| Multi-turn text conversation (3 messages, 3 agent replies) | ✅ | `audit/K` |
| `useScribe` live STT — connected + sessionStarted (single-use token, scribe_v2_realtime) | ✅ | `audit/L` |

## By capability area

### A. Embedding & connection
- CDN web component, `agent-id` (public), shadow:open — ✅ (`verify/01`).
- `signed-url` (WebSocket auth) — ✅ live connected (`audit/G`).
- `conversation-token` (WebRTC) — ✅ live connected via React island (`audit/I`).
- `server-location`, `environment`, `user-id` — ◑ reflected onto element / passed to `startSession`; regional/identity effect not separately observable here.
- Custom tag via `registerWidget(tag)` — ◑ snippet + mechanism shown; the CDN embed bundle only auto-registers `elevenlabs-convai`, so live custom-tag re-registration is illustrative, not wired.

### B. HTML attributes (45)
- All 45 render as controls; **21/21** non-connection attrs asserted to reflect onto the element (`verify/08`). Booleans correctly omit when off.
- `text-input`, `mic-muting`, language selector — ✅ visible in the live call (`audit/F`).
- `transcript`, `show-conversation-id`, `show-agent-status` — ◑ config set + in-call container confirmed; these specific elements surface on their triggering events (a message, disconnect, tool call) — not isolated in a screenshot.
- `B10–B15` (`action-text`/`start-call-text`/…) — `[~]` in the matrix: not in the v0.12.8 `CustomAttributeList`; their effect is achieved through `text-contents` (✅ `audit/A`).
- `worklet-path-*` — 🔒 self-host worklet paths; settable, no effect without a CSP/offline host.

### C. Server config (`platform_settings.widget`) + D. `--el-` CSS tokens
- GET + PATCH round-trip against the real API, DEV-guarded — ✅ (`verify/09`).
- `styles` tokens visibly recolor the widget — ✅ (`audit/C`).
- `feedback_mode`, `terms_*`, `shareable_*`, `file_input_config`, legacy flat colors, `language_presets` — ◑ editable JSON → PATCH accepted; terms modal ✅ (`audit/E`); the rest set correctly, in-widget effect is state/plan-specific.

### E. Text contents (~50 keys) — ✅ render on the trigger (`audit/A`); full set assembled into the live `text-contents` attribute.

### F. Avatar — orb (WebGL2) ✅ default; image URL ✅ (`audit/B`); uploaded image ◑ (multipart POST wired + guarded; not exercised with a file in-harness).

### G. Modality — voice ✅ (`audit/F`), voice+text ✅ (text input present in call), text-only chat ✅ (`audit/D`); conversation-mode toggle ◑ (config); file input 🔒 (needs multimodal LLM + chat).

### H. Runtime personalization — ✅ **effect visibly proven**: with `override-prompt` set to "respond only with `OVERRIDE_OK_42`", the live agent's reply was exactly that string (`audit/H`). All other overrides + dynamic-variables reflect as attributes (◑) on the same code path. The `elevenlabs-convai:call` SessionConfig hook is wired and logs its injection (◑).

### K. Native React components — ConversationProvider + all 8 granular hooks + `useConversationClientTool` mount with zero invalid-hook errors (✅ `verify/05`). Controls, mute, feedback, contextual update, user activity, device enumeration, MCP-approval input — ✅ present and callable. `sendUserMessage` round-trip ✅ (`verify/07`); multi-turn ✅ (`audit/K`). **Audio visualizer (K14)** — canvas active during live voice session (`audit/J`); bars draw when output frequency data is non-zero (microphone audio in headless = silent sine, so bars are sparse).

### K-bonus. Scribe (`useScribe`) — ✅ **live STT session established**: server proxy mints a real single-use token via `POST /v1/single-use-token/realtime_scribe`, hook configured with `modelId: "scribe_v2_realtime"` + `audioFormat: PCM_16000`. The session reaches `status: connected` and fires `onSessionStarted` (`audit/L`). The transcripts panel is empty because the headless probe doesn't push audio; calling `sendAudio()` with real PCM samples would populate `partialTranscript` / `committedTranscripts`. Panel renders connect/disconnect/mute/commit/clear, the 7 specific error callbacks, and the status badge.

### L. Event protocol — onConnect/onStatusChange/onMessage/onModeChange/onAgentChatResponsePart all observed in the live event log (✅ `verify/07`). VAD/audio-alignment/tool-call/MCP events fire only in their scenarios → ◑.

## Honest gaps & caveats

1. **Prompt-injection guardrail.** The showcase agent rejects messages that look like instruction-overrides ("Reply with the word ALPHA"). Multi-turn probes use normal questions; this is correct agent behavior, not a bug.
2. **Voice visualizer bars**: canvas is active in the live voice session, but headless fake-mic produces near-silence so bars are sparse. With a real microphone they draw.
3. **Custom tag re-registration** is illustrative (snippet), not live — the CDN bundle registers only the default tag.
4. **Enterprise/host-gated** knobs (`worklet-path-*`, multimodal file input) are settable but their effect needs infrastructure not present here.

## Post-upgrade expansion (this branch's latest pass)

### UI library (`/ui-library.html`) — 17/17 sections, 15+ visibly working
After missing it entirely in the first pass, the full ElevenLabs UI library at https://ui.elevenlabs.io is now integrated. Sources fetched from `/r/<slug>.json` (recursive: shadcn primitives via `ui.shadcn.com`), normalized to `@/components/ui/`, bundled with `Bun.build` to `playground/public/ui-library/main.js` (5.7MB). Per-section error boundary so one bad component can't blank the page (`audit/R-ui-library-full.png`).

| # | Component | Live? | Evidence |
|---|---|---|---|
| O1 | Orb (4 variants — colors, agent state, manual volumes) | ✅ | `audit/R` (top row) |
| O2 | Waveform (static, `data: number[]`) | ✅ | green bars |
| O3 | ScrollingWaveform | ✅ | renders (active-prop DOM warning, cosmetic) |
| O4 | BarVisualizer (demo mode) | ✅ | bars |
| O5 | LiveWaveform | ✅ | line (no mic in headless) |
| O6 | Message + MessageContent + MessageAvatar | ✅ | user + assistant bubbles |
| O7 | Response (Streamdown markdown) | ✅ | bullets + bold |
| O8 | Conversation + scrolling | ✅ | auto-scrolling list |
| O9 | VoiceButton (idle / active / muted) | ✅ | cycles on click |
| O10 | MicSelector | ✅ | dropdown |
| O11 | ShimmeringText | ✅ | gradient |
| O12 | Matrix (pixel-grid digits) | ✅ | cycles |
| O13 | ConversationBar | ✅ | mic / keyboard / send (wrapped in `ConversationProvider`) |
| O14 | AudioPlayer (Provider + Button + Progress + Time/Duration) | ✅ | plays public WAV |
| O15 | VoicePicker | ✅ | 3 real voice IDs |
| O16 | SpeechInput | ◑ | record button renders; live recording needs real mic |
| O17 | TranscriptViewer | ◑ | mounts; synthetic alignment lacks required fields → boundary message |

### Discoverability overhaul of `/` (the widget control plane)
The previous Datadog-style dense console was hostile to non-engineers (acknowledged via memory `feedback-showcase-must-be-discoverable`). Now:
- **"Start here" card** at top with 6 named presets that immediately change something visible: *Brand it pink · Text-only chat · Force agent reply (sentinel proof) · Rich agent content (markdown demo) · Compact bottom-left · Reset* (`audit/N`).
- **Topnav in plain English**: Start here / Connect / Widget knobs / Wording / Avatar / Voice-Chat / Overrides / API panel / Share via URL / React hooks → / UI library →.
- **Every dense section renamed + "What to try" hint**: "1. Connect to your agent" / "Widget appearance & behavior" / "Colors & sizes (server-side styling)" / "Every button label & message" / "Per-session overrides" / "Try every variant × placement combo" / "Inject config at call-time" / "Edit the agent's stored config via real API" / "Share this exact configuration via URL" (`audit/Q`).

### Rich content in chat — visibly proven
The "Rich agent content" preset sets an override-prompt that forces the agent to reply with Markdown + a clickable link + a code block, plus enables `markdown-link-allowed-hosts="*"` + `syntax-highlight-theme="dark"`. Probe screenshot `audit/P` shows the widget rendering a **bulleted list, a clickable `elevenlabs.io` link, and a fenced JS code block** in the chat panel — proving the widget's markdown pipeline + link allowlist + syntax highlighting are all real.

## Reproduce

```bash
bun playground &                      # server on :4321
bun run playground/verify.mjs         # 9/9 e2e → verify/
bun run playground/audit-shots.mjs    # fidelity states → audit/A–E
bun run playground/live-probe.mjs     # live probes F–L (voice, signed-url, override-prompt, WebRTC token, visualizer, multi-turn, Scribe)
```
