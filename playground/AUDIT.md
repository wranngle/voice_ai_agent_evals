# Capability Audit — what ElevenLabs UI can do vs. what the showcase actually demonstrates

Honest pass over every capability area: does the control exist, does it drive the real config, and — the part that matters — does the capability **visibly manifest** in the rendered widget / island? Evidence = screenshots in `verify/` and `audit/`, captured in real headless Chromium against the live showcase agent (`agent_7701ksbwcdzcfe0sj8nhtrxem9h1`).

Verdict legend:
- ✅ **Demonstrated** — observed rendering/changing in-browser (screenshot).
- ◑ **Wired & reflected** — control drives the attribute/server-config (asserted), but the visible effect only appears in a specific live state.
- ⏳ **Live-gated** — needs an active AI turn; config verified, full effect bounded by ElevenLabs account quota (hit during testing).
- 🔒 **Host/enterprise-gated** — needs self-hosting / multimodal LLM / enterprise plan; settable here, effect not reproducible in this env.
- ❌ **Not showcased** — genuine omission.

## Summary

The showcase is **real, not cosmetic**: controls drive the actual web component and the real ElevenLabs API, and the capabilities that can be seen without a billed conversation were all confirmed rendering. A live signed-url conversation and a live voice call both connected during the audit. The honest boundary is that some in-call chrome and all runtime-override *effects* only fully manifest mid-conversation, and repeated test calls hit the account's quota limit.

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

## By capability area

### A. Embedding & connection
- CDN web component, `agent-id` (public), shadow:open — ✅ (`verify/01`).
- `signed-url` (WebSocket auth) — ✅ live connected (`audit/G`).
- `conversation-token` (WebRTC) — ◑ minted via real API (`verify`); token→WebRTC session not driven to "connected" in-harness (voice/quota). SDK-standard path.
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

### H. Runtime personalization — dynamic-variables + all overrides reflect as attributes (◑). Their **effect** (different first message/voice/prompt/llm) only manifests inside a conversation turn → ⏳ live-gated (quota). The `elevenlabs-convai:call` SessionConfig hook is wired and logs its injection (◑).

### K. Native React components — ConversationProvider + all 8 granular hooks + `useConversationClientTool` mount with zero invalid-hook errors (✅ `verify/05`). Controls, mute, feedback, contextual update, user activity, device enumeration, MCP-approval input — ✅ present and callable. `sendUserMessage` round-trip ✅ (`verify/07`). **Audio visualizer (K14)** — canvas renders; draws bars only with live voice audio (blank in text mode, by design) → ◑.

### L. Event protocol — onConnect/onStatusChange/onMessage/onModeChange/onAgentChatResponsePart all observed in the live event log (✅ `verify/07`). VAD/audio-alignment/tool-call/MCP events fire only in their scenarios → ◑.

## Honest gaps & caveats

1. **Account quota.** Repeated live calls hit `"This request exceeds your quota limit"`. Initial connects + first agent turn work (proven), but sustained multi-turn / many concurrent runs are capped. Runtime-override *effects* (H) and multi-turn transcript are therefore ⏳, not ✅.
2. **Voice visualizer bars** need a real voice session with audio flowing; the canvas is present and null-safe but shows nothing in text mode.
3. **`conversation-token` → WebRTC "connected"** wasn't driven to completion in-harness (signed-url WebSocket was). Same SDK entry point.
4. **`useScribe`** (standalone speech-to-text hook exported by `@elevenlabs/react`) is **❌ not showcased** — it's STT, adjacent to but not part of agent-conversation UI. Deliberate scope boundary, noted here for completeness.
5. **Custom tag re-registration** is illustrative (snippet), not live — the CDN bundle registers only the default tag.
6. **Enterprise/host-gated** knobs (`worklet-path-*`, multimodal file input) are settable but their effect needs infrastructure not present here.

## Reproduce

```bash
bun playground &                      # server on :4321
bun run playground/verify.mjs         # 9/9 e2e → verify/
bun run playground/audit-shots.mjs    # fidelity states → audit/A–E
bun run playground/live-probe.mjs     # live call + signed-url → audit/F–G
```
