# ElevenLabs Agent UI Customization — Capability Map

> The complete surface for customizing the ElevenAgents **chat/voice widget** and **native UI components**, reconciled from official `.mdx` docs (`pages/`), the `elevenlabs/packages` source (`external/source/`), and DeepWiki digests (`external/`). Captured 2026-05-23.
>
> One-sentence orientation: you customize the agent UI through **three control surfaces** — the stored server config (`platform_settings.widget`), the embed element's HTML attributes, and the SDK at runtime — and the SDK always wins.

---

## 0. The three control surfaces (precedence: top wins)

1. **Runtime custom event** `elevenlabs-convai:call` → mutate `detail.config` (`SessionConfig`) before connect.
2. **Dynamic mode switch** — auto text-only when a conversation starts from a typed message.
3. **HTML attributes** on `<elevenlabs-convai>`.
4. **`override-config`** — a JSON blob attribute that bypasses individual attrs.
5. **Server config** — `GET /v1/convai/agents/{id}/widget`, set via `platform_settings.widget`.
6. **Built-in defaults.**

SDK overrides (`@elevenlabs/react`, `@elevenlabs/client`) take priority over UI/server customization. Pick the lowest surface that satisfies the need: brand-level look → server config; per-page text/colors → HTML attrs; per-user/session → runtime event or SDK.

---

## 1. Embedding methods

| Method | Use when | Snippet entry |
|---|---|---|
| **CDN web component** | Any site, fastest path | `<elevenlabs-convai agent-id="…"></elevenlabs-convai>` + `<script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async>` |
| **NPM `@elevenlabs/convai-widget-embed`** | Bundled apps wanting the prebuilt widget | import the package; same custom element |
| **`@elevenlabs/react`** | React/Next.js, full control over rendering | `ConversationProvider` + hooks (§7) |
| **`@elevenlabs/client`** | Vanilla JS / framework-agnostic | `Conversation.startSession({...})` |
| **`@elevenlabs/react-native`, Swift, Kotlin, Python** | Mobile / server | per-platform SDK (`pages/eleven-agents/libraries/`) |
| **No-code** | Framer, Webflow, Wix, Squarespace, Ghost, WordPress | paste embed in a code/HTML block (`pages/.../guides/no-code/`) |

The element registers via `registerWidget(tagName = "elevenlabs-convai")` with `{ shadow: true, mode: "open" }` and observes exactly the `CustomAttributeList` attributes (§2) — so you can mount it under a **custom tag name** and the open shadow root is inspectable. Embed bundle version at capture: **`@elevenlabs/convai-widget-embed@0.12.8`**.

Prereqs: widget requires a **public agent with auth disabled** (Advanced tab). Lock down with the **Allowlist** (Security tab) — `AllowlistItem.hostname`. For authed agents use a server-minted **signed URL** (WebSocket) or **conversation token** (WebRTC).

---

## 2. Web component — complete HTML attribute reference

Source of truth: `external/source/types-attributes.ts` (`CustomAttributeList`, 45 entries). ✅ = documented on official page; ⚠️ = present in source, undocumented (use with care).

### Identity / connection
| Attribute | Notes |
|---|---|
| `agent-id` ✅ | Required (or `signed-url`). |
| `signed-url` ✅ | Authed agents; alternative to `agent-id`. |
| `user-id` ⚠️ | Map conversations to your end user. |
| `server-location` ✅ | `us` (default) · `global` · `eu-residency` · `in-residency`. |
| `environment` ⚠️ | Agent environment selector. |

### Layout / display
| Attribute | Notes |
|---|---|
| `variant` ✅ | Stored enum `tiny·compact·full·expandable` (API). Source type only knows `tiny·compact·full`. |
| `placement` ⚠️(impl) | `top-left·top·top-right·bottom-left·bottom·bottom-right` (default `bottom-right`). Set via config/attr. |
| `default-expanded` ⚠️ | Start expanded once. |
| `always-expanded` ⚠️ | Never collapse. |
| `dismissible` ✅ | User can minimize. |
| `show-avatar-when-collapsed` ⚠️ | Show avatar on the collapsed bubble. |

### Avatar
| Attribute | Notes |
|---|---|
| `avatar-image-url` ✅ | Custom avatar image. |
| `avatar-orb-color-1` ✅ | Orb gradient color 1 (default `#2792dc`). |
| `avatar-orb-color-2` ✅ | Orb gradient color 2 (default `#9ce6e6`). |

### Text / labels
| Attribute | Notes |
|---|---|
| `action-text` ✅ | CTA before start. |
| `start-call-text` ✅ | Start-call button. |
| `end-call-text` ✅ | End-call button. |
| `expand-text` ✅ | Expand control. |
| `listening-text` ✅ | Listening status. |
| `speaking-text` ✅ | Speaking status. |
| `text-contents` ⚠️ | JSON blob overriding **all** text keys (§5). |

> The `*-text` attributes are convenience shortcuts; the full text surface (40+ keys) is set via `text-contents` / server `text_contents`.

### Modality / features
| Attribute | Config field | Notes |
|---|---|---|
| `text-input` | `text_input_enabled` | Allow typed messages. |
| `override-text-only` | `text_only` | Force text-only. |
| `mic-muting` | `mic_muting_enabled` | Show mute button. |
| `transcript` | `transcript_enabled` | Show live transcript. |
| `use-rtc` | `use_rtc` | WebRTC instead of WebSocket. |
| `collect-feedback` ⚠️ | `feedback_mode` | Enable feedback UI. |
| `strip-audio-tags` | `strip_audio_tags` | Strip `[audio]` markup from text. |
| `show-agent-status` | `show_agent_status` | Show working/done/error during tool calls. |
| `show-conversation-id` | `show_conversation_id` | Show conv ID after disconnect. |

### Markdown / code rendering
| Attribute | Notes |
|---|---|
| `markdown-link-allowed-hosts` ✅ | Hosts where links are clickable; `*` = all, empty = none. |
| `markdown-link-include-www` ✅ | Auto-allow `www.` variants (default `true`). |
| `markdown-link-allow-http` ✅ | Allow `http://` (default `true`). |
| `syntax-highlight-theme` ✅ | `light·dark·auto` (auto-detects from `base_active`). |

### Runtime personalization
| Attribute | Notes |
|---|---|
| `dynamic-variables` ✅ | JSON injected into prompt/messages/tools, e.g. `{"user_name":"John"}`. |
| `override-prompt` ✅ | Per-session system prompt. |
| `override-first-message` ✅ | Per-session greeting. |
| `override-language` ✅ | e.g. `es`. |
| `override-voice-id` ✅ | Per-session voice. |
| `override-llm` ⚠️ | Per-session model. |
| `override-speed` ⚠️ | TTS speed. |
| `override-stability` ⚠️ | Voice stability. |
| `override-similarity-boost` ⚠️ | Voice similarity boost. |
| `language` ⚠️ | Initial language. |
| `terms-key` ⚠️ | localStorage key for accepted terms. |
| `allow-events` ⚠️ | Enable extra client events. |
| `override-config` ⚠️ | Whole-config JSON bypass. |
| `worklet-path-raw-audio-processor` / `worklet-path-audio-concat-processor` / `worklet-path-libsamplerate` ⚠️ | Self-host audio worklets (CSP / offline). |

> Overrides must be **enabled per-field** in the agent's Security tab before they take effect.

---

## 3. Stored widget config — `platform_settings.widget`

Set via `elevenlabs agents pull/push`, the SDK `agents.update`, or `PATCH`. Read via `GET /v1/convai/agents/{id}/widget` → `WidgetConfigResponseModel`. Full schema: `pages/.../api-reference/widget/get.mdx`; types: `external/source/types-config.ts`.

```json
{ "platform_settings": { "widget": {
  "variant": "full", "placement": "bottom-right", "expandable": "never",
  "avatar": { "type": "orb", "color_1": "#6DB035", "color_2": "#F5CABB" },
  "bg_color": "#ffffff", "text_color": "#000000",
  "btn_color": "#000000", "btn_text_color": "#ffffff",
  "border_color": "#e1e1e1", "focus_color": "#000000",
  "border_radius": 12, "btn_radius": 8,
  "feedback_mode": "during", "end_feedback": { "type": "rating" },
  "text_input_enabled": true, "transcript_enabled": false,
  "mic_muting_enabled": false, "conversation_mode_toggle_enabled": false,
  "default_expanded": false, "always_expanded": false, "dismissible": false,
  "show_avatar_when_collapsed": false, "show_agent_status": false,
  "show_conversation_id": true, "strip_audio_tags": true, "disable_banner": false,
  "text_only": false, "supports_text_only": false, "use_rtc": null,
  "syntax_highlight_theme": "dark",
  "markdown_link_allowed_hosts": [{ "hostname": "*" }],
  "markdown_link_include_www": true, "markdown_link_allow_http": true,
  "shareable_page_text": "…", "shareable_page_show_terms": true,
  "terms_html": "…", "terms_text": "…", "terms_key": "terms_accepted",
  "first_message": "…", "override_link": "…",
  "language": "en", "supported_language_overrides": ["es","fr"],
  "language_presets": { "es": { "first_message": "¡Hola!", "text_contents": { … }, "terms_text": "…" } },
  "file_input_config": { "enabled": true, "max_files_per_conversation": 10 },
  "text_contents": { … },  "styles": { … }
}}}
```

Enums: `EmbedVariant tiny·compact·full·expandable` · `WidgetPlacement` (6) · `WidgetExpandable never·mobile·desktop·always` · `WidgetFeedbackMode none·during·end` · `WidgetEndFeedbackType rating`.

PATCH discipline (project rule): send the **full** object; one-of per property; strip conflicting keys. See repo `CLAUDE.md` "ElevenLabs PATCH /agents semantics".

---

## 4. Visual styling — `styles` object + `--el-` CSS variables

The widget lives in a **shadow DOM**. The `styles` config object is emitted as `--el-<key>` custom properties onto `:host, :root` (numbers → `px`; see `external/source/styles-Style.tsx`). This is the reliable styling path — external CSS variable overrides are fragile because the widget writes its own `:host` rule.

Complete variable set (key → `--el-var`, default from `DefaultStyles`):

| `styles` key | CSS var | Default |
|---|---|---|
| `base` | `--el-base` | `#ffffff` |
| `base_hover` | `--el-base-hover` | `#f9fafb` |
| `base_active` | `--el-base-active` | `#f3f4f6` |
| `base_border` | `--el-base-border` | `#e5e7eb` |
| `base_subtle` | `--el-base-subtle` | `#6b7280` |
| `base_primary` | `--el-base-primary` | `#000000` |
| `base_error` | `--el-base-error` | `#ef4444` |
| `accent` | `--el-accent` | `#000000` |
| `accent_hover` | `--el-accent-hover` | `#1f2937` |
| `accent_active` | `--el-accent-active` | `#374151` |
| `accent_border` | `--el-accent-border` | `#4b5563` |
| `accent_subtle` | `--el-accent-subtle` | `#6b7280` |
| `accent_primary` | `--el-accent-primary` | `#ffffff` |
| `overlay_padding` | `--el-overlay-padding` | `32` (px) |
| `button_radius` | `--el-button-radius` | `18` (px) |
| `input_radius` | `--el-input-radius` | `10` (px) |
| `bubble_radius` | `--el-bubble-radius` | `15` (px) |
| `sheet_radius` | `--el-sheet-radius` | `calc(var(--el-button-radius) + 6px)` |
| `compact_sheet_radius` | `--el-compact-sheet-radius` | `calc(var(--el-button-radius) + 12px)` |
| `dropdown_sheet_radius` | `--el-dropdown-sheet-radius` | `calc(var(--el-input-radius) + 6px)` |

Plus hardcoded `--el-audio-tag: 293 53% 52%` (HSL). Tailwind utilities map `bg-base-hover → var(--el-base-hover)`, `rounded-button → var(--el-button-radius)`, etc.

The **legacy flat color fields** on `WidgetConfigResponseModel` (`bg_color`, `text_color`, `btn_color`, `btn_text_color`, `border_color`, `focus_color`, `border_radius`, `btn_radius`) are the dashboard-level simple controls; the `styles` object is the granular token system. Prefer `styles` for fine control.

Syntax-highlight token colors (GitHub Light / `[data-syntax-theme="dark"]`): full palette in `external/source/styles-index.css` (`.tok-keyword`, `.tok-string`, `.tok-number`, `.tok-typeName`, …).

---

## 5. Text content & localization

`text_contents` (server) / `text-contents` (attr) overrides any of ~50 keys. Defaults in `external/source/types-config.ts` (`DefaultTextContents`). Groups:

- **Buttons/CTAs**: `main_label` ("Need help?"), `start_call`, `start_chat`, `send_message`, `new_call`, `end_call`, `submit`, `go_back`, `copy`, `download`, `wrap`, `copy_id`.
- **Status**: `listening_status`, `speaking_status` ("Talk to interrupt"), `connecting_status`, `chatting_status`, `agent_working`/`agent_done`/`agent_error` (tool-call status).
- **Inputs**: `input_label`, `input_placeholder`, `input_placeholder_text_only`, `input_placeholder_new_conversation`.
- **Mode toggle**: `text_mode`, `voice_mode`, `switched_to_text_mode`, `switched_to_voice_mode`.
- **Terms**: `accept_terms`, `dismiss_terms`.
- **Conversation end / errors**: `user_ended_conversation`, `agent_ended_conversation`, `conversation_id` ("ID"), `error_occurred`.
- **Feedback**: `initiate_feedback`, `request_follow_up_feedback`, `thanks_for_feedback`(+`_details`), `follow_up_feedback_placeholder`.
- **File upload** (source-only, multimodal): `attach_file`, `remove_file`, `file_upload_error`, `file_type_unsupported`, `file_too_large`, `file_limit_reached`.
- **a11y**: `mute_microphone`, `change_language`, `collapse`, `expand`, `copied`.

**Localization**: add languages to the agent first (`voice/customization/language`), set `supported_language_overrides`, then `language_presets[lang] = { first_message, text_contents, terms_html/text/key }`. The widget shows a language dropdown (`LanguageSelect`).

---

## 6. Avatar, orb, terms, feedback, shareable page

- **Avatar** (`AvatarConfig` one-of): `orb {color_1,color_2}` · `url {custom_url}` · `image {url}`. The orb is a live **WebGL2 fragment shader** (two gradient colors + Perlin-noise texture from `eleven-public-cdn`), not a static asset — `external/source/orb-Orb.ts`.
- **Upload avatar image**: `POST /v1/convai/agents/{id}/avatar` (multipart `avatar_file`) → `{ avatar_url }`. `pages/.../api-reference/widget/create.mdx`.
- **Terms modal**: Markdown `terms_text`/`terms_html`; `terms_key` stores acceptance in localStorage so returning users aren't re-prompted.
- **Feedback**: `feedback_mode none·during·end`; `during` collects the triggering agent response as metadata; SDK path → `sendFeedback(true|false)`. Programmatic feedback via conversations API.
- **Shareable landing page**: `shareable_page_text` (description), `shareable_page_show_terms`; `override_link` customizes the share URL.
- **Mute button**: enable via `interface` card → `mic_muting_enabled`.
- **File input** (multimodal LLMs): `file_input_config.{enabled,max_files_per_conversation}`.

---

## 7. Native UI components — `@elevenlabs/react` (build your own UI)

`@elevenlabs/react` re-exports `@elevenlabs/client`. Wrap in `<ConversationProvider>` (accepts the same options as `useConversation`: callbacks, `clientTools`, `overrides`, `serverLocation`, controlled `isMuted`/`onMutedChange`).

**`useConversation()`** — everything in one hook (re-renders on any change). **Granular hooks** (render only on their slice):
- `useConversationControls()` — `startSession`, `endSession`, `sendUserMessage`, `sendContextualUpdate`, `sendUserActivity`, `setVolume`, `changeInputDevice`, `changeOutputDevice`, `sendMCPToolApprovalResult`, `getId`, `getInput/OutputVolume`, `getInput/OutputByteFrequencyData` (for audio-reactive visualizers).
- `useConversationStatus()` → `{ status, message }`.
- `useConversationInput()` → `{ isMuted, setMuted }`.
- `useConversationMode()` → `{ mode, isSpeaking, isListening }`.
- `useConversationFeedback()` → `{ canSendFeedback, sendFeedback }`.
- `useRawConversation()` — escape hatch to the raw `Voice/TextConversation`.
- `useConversationClientTool(name, handler)` — register a client tool scoped to a component (auto-unregisters on unmount; always latest closure).

**`startSession({ agentId | signedUrl | conversationToken, userId?, connectionType? })`** — voice→WebRTC, text→WebSocket inferred. **Overrides** object: `{ agent: { prompt, firstMessage, language }, tts: { voiceId }, conversation: { textOnly } }`. **`textOnly: true`** skips mic permission + audio context.

**Callbacks**: `onConnect`, `onDisconnect`, `onMessage`, `onError`, `onAudio`, `onModeChange`, `onStatusChange`, `onCanSendFeedbackChange`, `onDebug`, `onUnhandledClientToolCall`, `onVadScore`, `onAudioAlignment` (char-level timing → karaoke text), `onAgentChatResponsePart` (streaming text deltas), `onAgentToolResponse`/`…FullPayload`, `onGuardrailTriggered`.

**Client tools** = agent-invoked client-side functions (open modal, redirect, call your API). Names/params must match the agent's UI tool config; mark "blocking" in the UI if the agent must await the return value. Widget path: listen for `elevenlabs-convai:call`, set `event.detail.config.clientTools`.

---

## 8. Event protocol (advanced / debugging)

Client events (server→client, WebSocket; auto-handled by SDKs): `conversation_initiation_metadata`, `ping`/`pong`, `audio` (base64 + char `alignment`), `user_transcript`, `agent_response`, `agent_response_correction` (on interruption), `agent_response_metadata` (custom-LLM), `client_tool_call` → `client_tool_result`, `agent_tool_response`(+`_full_payload`, ≤64KB, opt-in), `vad_score`, `mcp_tool_call` (`loading·awaiting_approval·success·failure`), `agent_chat_response_part` (text streaming), `agent_response_complete` (needs `turn_timeout` off), `guardrail_triggered`. Several require enabling in the agent's `client_events` config. Full reference + `client-to-server-events`: `pages/.../customization/events/`.

**Runtime widget hook**: `elevenlabs-convai:call` (bubbles, composed, mutable `detail.config: SessionConfig`) — the single seam to inject per-session client tools, dynamic variables, auth tokens, A/B config from the embedding page.

---

## 9. Chat (text-only) mode & concurrency

Enable at agent level (`conversation_config.conversation.text_only=true`, Advanced tab) or at runtime (`overrides.conversation.textOnly`). Must wire the `agent_response` callback or nothing renders. Text-only gets a **separate, ~25× higher concurrency pool** (e.g. Pro: 20 voice vs 500 chat) and a 10-min idle auto-disconnect in the widget. Use for chat UIs, automated eval harnesses, accessibility. `pages/.../guides/chat-mode.mdx`.

---

## 10. Avatar video / visual agents

**LiveAvatar (HeyGen)** LITE mode: ElevenLabs orchestrates audio + LLM, LiveAvatar renders lip-synced video. Requires agent audio I/O at **PCM 24000 Hz** (Voice settings → TTS output format; Advanced → user input format), API key with `convai_read`/`user_read`/`voices_read`, key registered via LiveAvatar secrets → `secret_id`; start a LITE session with `elevenlabs_agent_config`. Events flow over LiveKit rooms. Billed separately. `pages/.../guides/integrations/live-avatar.mdx`.

---

## 11. Gotchas & governance notes

- **Variant enum drift** — store config with the API enum (`tiny·compact·full·expandable`); the doc snippet's `variant="expanded"` is not in the source `Variant` type. `expandable` (the `WidgetExpandable never·mobile·desktop·always` field) controls responsive expansion; don't conflate with `variant`.
- **Shadow DOM** — style via the `styles` config / `--el-` vars, not arbitrary descendant selectors (encapsulated). Icons are overridable via named `<slot name="icon-{name}">`.
- **Public-agent requirement** — widget needs auth disabled; for protected agents mint signed-url/token server-side (never ship `xi-api-key` to the client).
- **Overrides are opt-in** — enable each override field in the Security tab or runtime overrides silently no-op.
- **Undocumented attributes** (⚠️ in §2) work in the shipped bundle but aren't in official docs — pin the embed version if you depend on them.
- **Project model gate** — new agents default to `gemini-3-flash-preview`; `override-llm` is gated against `config/model-rankings.json` (repo `CLAUDE.md`).
- **Governance** — agent phase lives in the `[PHASE]` name prefix; only `[DEV]` is auto-modifiable. Widget config is part of the agent object, so editing it on a non-`[DEV]` agent needs explicit approval.

---

## 12. Where each fact is filed

| Need | File |
|---|---|
| Full stored config schema (every field + default + enum) | `pages/eleven-agents/api-reference/widget/get.mdx` |
| Exhaustive HTML attribute list | `external/source/types-attributes.ts` |
| Config types, text defaults, `--el-` style defaults | `external/source/types-config.ts` |
| CSS-var emission mechanism | `external/source/styles-Style.tsx` |
| Base CSS + syntax tokens | `external/source/styles-index.css` |
| Orb shader | `external/source/orb-Orb.ts` |
| Precedence + runtime event + hooks | `external/deepwiki-5.2-configuration-and-customization.md` |
| Transcript model + lifecycle + components | `external/deepwiki-5.3-embedding-guide.md` |
| Icons/slots, buttons, markdown pipeline, theme tokens | `external/deepwiki-5.4-ui-components-and-markdown.md` |
| React hooks / client tools | `pages/eleven-agents/libraries/react.mdx` |
| Event protocol | `pages/eleven-agents/customization/events/client-events.mdx` |
| Text-only mode | `pages/eleven-agents/guides/chat-mode.mdx` |
| Avatar video | `pages/eleven-agents/guides/integrations/live-avatar.mdx` |
| No-code embeds | `pages/eleven-agents/guides/no-code/*.mdx` |
| External / community sources | `external/SOURCES.md` |
