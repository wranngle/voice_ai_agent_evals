# ElevenLabs Widget & UI Component Showcase

An interactive playground that demos **every knob** the ElevenLabs agent UI exposes — the embeddable widget *and* the native React components — wired to a **real ElevenLabs agent** via the real API. Built from the capability research in `../docs/research/elevenlabs-widget-ui/`.

## Run

```bash
bun playground          # → http://localhost:4321   (alias for: bun run playground/server.ts)
```

The server reads `ELEVENLABS_API_KEY` from `./.env` or `~/.agents/.env`. The key **never reaches the browser** — every authenticated call goes through the proxy.

Two pages:
- **`/`** — widget control plane (HTML attributes, CSS tokens, text, avatar, modality, runtime overrides, combos, server-config PATCH, URL params).
- **`/react.html`** — native components island (`@elevenlabs/react` hooks, client tools, audio visualizer, live event log).

## Showcase agent

`[DEV] Widget Showcase Playground` — `agent_7701ksbwcdzcfe0sj8nhtrxem9h1` (recorded in `agent.json`). Public (auth disabled) so the widget renders unauthenticated; cloned from the inbound template so it has a working voice + prompt, with runtime overrides (voice/prompt/llm/language/text_only) enabled. It is `[DEV]`, so the API panel may mutate it freely.

## Architecture

```
playground/
  server.ts            Bun: static host + key-safe proxy to api.elevenlabs.io
  agent.json           the showcase agent id + provenance
  FEATURE-MATRIX.md    every feature/knob/combo, checked off as wired
  public/
    index.html app.js styles.css   widget control plane (data-driven from spec arrays)
    react.html react.js            native @elevenlabs/react island (React+htm via esm.sh import map)
```

### Server proxy endpoints (key-safe)
| Endpoint | Purpose |
|---|---|
| `GET /api/config` | showcase agent id |
| `GET /api/agents` | real roster with phase + `mutable` flag |
| `GET /api/widget/:id` | live widget config |
| `PATCH /api/widget/:id` | write `platform_settings.widget` — **governance-guarded** |
| `GET /api/agent/:id` | full agent config |
| `POST /api/avatar/:id` | upload avatar (multipart) — guarded |
| `GET /api/signed-url/:id` | mint signed URL (WebSocket auth) |
| `GET /api/conversation-token/:id` | mint token (WebRTC) |

**Governance guard:** PATCH/avatar succeed only for `[DEV]` or prefix-less (implicit DEV) agents; `[ALPHA|BETA|PROD|ARCHIVED]` return `403`. Mirrors the repo's ElevenLabs governance rule.

## What's covered

See `FEATURE-MATRIX.md` for the checklist (120+ items). Highlights:
- **45 HTML attributes** (full source `CustomAttributeList`), each a live control; booleans omit the attribute when off.
- **20 `--el-` CSS tokens** + legacy flat colors, edited and PATCHed to server config (shadow-DOM styling is server-side, not external CSS).
- **~50 text-content keys** in a live editor → `text-contents` JSON attribute.
- **Avatar**: live WebGL2 orb (2 colors), image URL, uploaded image via API.
- **Modality**: voice / voice+text / text-only chat / file input, with the `text_only` forcing rules annotated.
- **Runtime**: dynamic variables + all overrides; the `elevenlabs-convai:call` SessionConfig-mutation hook.
- **URL params**: every knob round-trips through the query string; presets + copy-shareable-URL.
- **Native React**: `ConversationProvider` + all granular hooks, component-scoped client tools, device switching, audio-reactive FFT visualizer, and a live event log of every callback.
- **Combos grid**: variant × placement (24 cells) + related-knob truth tables.

## Verification

End-to-end browser verification via Playwright + headless Chromium — `playground/verify.mjs` (the central-promise e2e). With the server running:

```bash
bun run playground/verify.mjs    # screenshots → playground/verify/
```

It fails on any console error / pageerror and asserts, in real Chromium:
1. Widget page loads and the `<elevenlabs-convai>` **shadow root populates** (43 nodes) — the embed actually registers and renders.
2. Driving controls reflects onto the element (variant/placement/text-input).
3. The variant×placement **combo grid** applies.
4. The widget **opens** (trigger click pierces the shadow root).
5. The **React island mounts** with all 6 cards and **zero invalid-hook / render errors**.
6. A **real text-only conversation** against the showcase agent: `startSession` → `connected` → send → the agent replies (`onMessage` `source:ai`), proving the live round-trip end to end.

Last run: **6/6 steps, 0 console errors.** Screenshots in `playground/verify/` (widget home, controls, combo grid, terms modal on open, React island connected, live conversation). Bugs this caught and fixed: missing embed `<script>`, unmapped `react/jsx-runtime`, string `style` props + `class` (→ `className`) in htm, and controlled-mute throwing in text-only mode.
