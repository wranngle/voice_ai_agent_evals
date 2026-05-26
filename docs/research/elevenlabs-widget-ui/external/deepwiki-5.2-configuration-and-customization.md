# DeepWiki digest — elevenlabs/packages §5.2 Configuration and Customization

> Source: https://deepwiki.com/elevenlabs/packages/5.2-configuration-and-customization
> Captured: 2026-05-23 via WebFetch (model-summarized; cross-checked against raw source in `source/`).

## Widget HTML attributes (attribute → config field)

| HTML attribute | Config field | Type |
|---|---|---|
| `variant` | `variant` | string |
| `placement` | `placement` | string |
| `terms-key` | `terms_key` | string |
| `mic-muting` | `mic_muting_enabled` | boolean |
| `transcript` | `transcript_enabled` | boolean |
| `text-input` | `text_input_enabled` | boolean |
| `default-expanded` | `default_expanded` | boolean |
| `always-expanded` | `always_expanded` | boolean |
| `dismissible` | `dismissible` | boolean |
| `strip-audio-tags` | `strip_audio_tags` | boolean |
| `override-text-only` | `text_only` | boolean |
| `use-rtc` | `use_rtc` | boolean |
| `show-agent-status` | `show_agent_status` | boolean |
| `show-conversation-id` | `show_conversation_id` | boolean |
| `override-config` | (JSON bypass — whole config) | object |

When `text_only` is `true`: `mic_muting_enabled` is forced `false`; `transcript_enabled` and `text_input_enabled` forced `true`.

## Configuration precedence (highest → lowest)

1. **Runtime custom event** — `elevenlabs-convai:call` handler mutates `detail.config` (`SessionConfig`)
2. **Dynamic mode switching** — auto text-only based on initial message
3. **HTML attributes** — direct attribute overrides
4. **`override-config`** — JSON via the `override-config` attribute
5. **Server configuration** — `GET /v1/convai/agents/{agentId}/widget`
6. **Built-in defaults**

## Runtime event

`elevenlabs-convai:call`: `bubbles: true`, `composed: true` (crosses shadow DOM), `detail.config` is a mutable `SessionConfig`. Handlers mutate config before the connection is established.

Client metadata auto-attached: `overrides.client.source = "widget"`, `overrides.client.version = PACKAGE_VERSION`.

## Connection-type selection (SessionConfig)

| Condition | Connection type |
|---|---|
| `use_rtc: true` + `agentId` | `webrtc` |
| `agentId` only | `websocket` |
| `signedUrl` | `websocket` |

## Config hooks (Preact, `contexts/widget-config.tsx`)

`useWidgetConfig`, `useTextOnly`, `useIsConversationTextOnly`, `useFirstMessage`, `useTextInputEnabled`, `useLocalizedTerms`, `useWebRTC`, `useEndFeedbackType`, `useMarkdownLinkConfig`, `useSyntaxTheme` (auto-detects from `base_active` color).

## Packages

`@elevenlabs/client`, `@elevenlabs/react`, `@elevenlabs/react-native`, `convai-widget-core` (internal), `@elevenlabs/convai-widget-embed` (CDN bundle).
