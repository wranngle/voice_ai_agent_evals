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

## Reproduce

```bash
bun playground &                      # server on :4321
bun run playground/verify.mjs         # 9/9 e2e → verify/
bun run playground/audit-shots.mjs    # fidelity states → audit/A–E
bun run playground/live-probe.mjs     # live probes F–L (voice, signed-url, override-prompt, WebRTC token, visualizer, multi-turn, Scribe)
```
