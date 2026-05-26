# DeepWiki digest — elevenlabs/packages §5.3 Embedding Guide / §conversation state

> Sources: https://deepwiki.com/elevenlabs/packages/5.3-embedding-guide
> Captured: 2026-05-23 via WebFetch (model-summarized).

## Conversation state (convai-widget-core)

Preact context in `conversation.tsx`; `useConversationSetup` builds the value, `ConversationProvider` wraps with a **10-minute idle timeout for text-only** conversations.

Signals: `status` (`disconnected|connecting|connected`), `mode` (`listening|speaking`), `transcript[]`, `conversationIndex` (increments per disconnect → namespaces entries), `conversationTextOnly`.

Methods: `startSession(element, initialMessage?)`, `endSession()`, `sendUserMessage(text)`, `setMicMuted(muted)`, `setVolume(volume)`.

## TranscriptEntry (discriminated union, 6 types)

`message` (`{role, message, isText, ...}`), `agent_tool_request`, `agent_tool_response` (`isError`), `disconnection`, `error`, `mode_toggle`. Each carries `conversationIndex`. `isText` distinguishes voice transcription (`false`) from text/streaming (`true`).

## Session lifecycle

- `lockRef` prevents duplicate concurrent sessions.
- `triggerCallEvent` dispatches `elevenlabs-convai:call` on the shadow host before starting → page mutates `SessionConfig`.
- Streaming text via `onAgentChatResponsePart`: `start` creates empty entry, `delta` mutates in place, `stop` clears streaming index; final `onMessage` replaces the streaming entry.
- `endSession` resets streaming, appends disconnection/error entry, increments `conversationIndex`, auto-cleans on unmount.

## Display pipeline

`buildDisplayTranscript()` → `DisplayTranscriptEntry[]`. `agent_tool_request`/`agent_tool_response` merge into a `toolStatus` field (`loading|success|error`). Non-text voice messages hidden unless `transcript_enabled`. Config passed: `showAgentStatus`, `transcriptEnabled (isTextOnly || transcript_enabled)`, `firstMessage`, `firstMessageConversationIndex`.

## Component hierarchy

`Sheet` (transcript + controls + feedback) → `Transcript` (scrollable, `useStickToBottom` auto-scroll, keyed `${index}-${conversationIndex}`) → `TranscriptMessage` dispatch: `DisconnectionMessage` (optional `lastId` if `show_conversation_id`), `ErrorMessage` (always shows conv ID), `AgentMessageBubble` (markdown via `WidgetStreamdown` + `ToolCallMessage` badge), `UserMessageBubble` (`dir="auto"`, whitespace preserved), `ToolCallMessage` (pill: spinner/check/X).

## Text-only first message

If `text_only`: `first_message` shows immediately without waiting; on `startSession` an `initialMessage` is added as a user message; backend's first agent response suppressed (`receivedFirstMessageRef`); after 100ms `sendUserMessage(initialMessage)`.
