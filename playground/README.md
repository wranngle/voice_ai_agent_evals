# ElevenLabs Widget & UI Component Showcase

A 5-page interactive playground that demos **every public ElevenLabs UI surface** — the embeddable chat/voice widget, the `@elevenlabs/react` hooks, the full ui.elevenlabs.io component library, the upstream component example demos, and all 11 upstream reference apps — wired to a real `[DEV]` ElevenLabs agent via a key-safe Bun proxy.

## Run

```bash
bun playground          # → http://localhost:4321   (alias for: bun run playground/server.ts)
```

The server reads `ELEVENLABS_API_KEY` from `./.env` or `~/.agents/.env`. **The key never reaches the browser** — every authenticated call goes through the proxy.

## Pages

| URL | What | Source |
|---|---|---|
| `/` | Widget control plane — every `<elevenlabs-convai>` knob live; presets at top; collapsible sections | `public/index.html` + `public/app.js` |
| `/react.html` | Native `@elevenlabs/react` island — provider, hooks, client tools, live event log, Scribe | `public/react.html` + `public/react.js` (htm + esm.sh) |
| `/ui-library.html` | Hand-curated component grid (my variants — multiple Orb states, etc.) | `ui-library/src/main.tsx` |
| `/examples.html` | **17 official upstream component demos** — `ui.elevenlabs.io/registry/examples/` mounted verbatim | `ui-library/src/examples-main.tsx` |
| `/blocks.html` | **11 full reference apps** with a switcher — Voice Chat × 3, Music Player × 2, Realtime Transcriber, Transcriber, Voice Form, Voice Nav, Speaker, Pong | `ui-library/src/blocks-main.tsx` |

The widget showcase (`/`) has a prominent "Start here" card with 6 named presets: Brand it pink · Text-only chat · Force agent reply (sentinel proof) · Rich agent content (markdown + link + code) · Compact bottom-left · Reset. Click any preset to see it apply instantly to the live widget preview on the right.

## Showcase agent

`[DEV] Widget Showcase Playground` — `agent_7701ksbwcdzcfe0sj8nhtrxem9h1` (recorded in `agent.json`). Public (auth disabled) so the widget renders unauthenticated; cloned from the inbound template so it has a working voice + prompt; runtime overrides (voice/prompt/llm/language/text_only) enabled. `[DEV]` phase, safe to mutate from the API panel.

## Architecture

```
playground/
  server.ts                  Bun: static host + key-safe API proxy (see endpoints below)
  agent.json                 the showcase agent id + provenance
  FEATURE-MATRIX.md          every feature / knob / combo, [x] / [~] / [ ]
  AUDIT.md                   honest fidelity audit with screenshot evidence
  verify.mjs                 Playwright e2e (9 steps, fails on any console error)
  live-probe.mjs             7 live capability probes (voice/signed-url/override-effect/...)
  audit-shots.mjs            fidelity capture (text-contents / avatar / styles / etc.)
  public/                    static (5 .html + the bundled .js files)
  audit/                     screenshots (verify/01-10, audit/A-Z)
  ui-library/src/            upstream elevenlabs/ui registry, vendored
    components/ui/   63      shadcn primitives + EL components (Orb, Conversation, etc.)
    hooks/            5      useScribe, useTranscriptViewer, etc.
    lib/              1      cn (tailwind-merge + clsx)
    examples/        17      one demo per EL component
    blocks/          11      full reference apps (Voice Chat / Pong / etc.)
    main.tsx                 entry → bundles /ui-library.html
    examples-main.tsx        entry → bundles /examples.html
    blocks-main.tsx          entry → bundles /blocks.html
```

### Proxy endpoints (all key-safe via the Bun server)

| Endpoint | Purpose |
|---|---|
| `GET /api/config` | showcase agent id |
| `GET /api/agents` | real roster with phase + `mutable` flag |
| `GET /api/widget/:id` | live widget config |
| `PATCH /api/widget/:id` | write `platform_settings.widget` — DEV-guarded |
| `GET /api/agent/:id` | full agent config |
| `POST /api/avatar/:id` | upload avatar (multipart) — DEV-guarded |
| `GET /api/signed-url/:id` | mint signed URL (WebSocket auth) |
| `GET /api/conversation-token/:id` | mint token (WebRTC) |
| `GET /api/scribe-token` | mint Scribe single-use token (`/v1/single-use-token/realtime_scribe`) |
| `POST /api/stt` | proxy ElevenLabs batch speech-to-text |
| `POST /api/extract-form` | STT → `llm.sh` structured extract → JSON (powers `voice-form-01`) |
| `POST /api/voice-nav` | STT → sitemap fetch → `llm.sh` URL match (powers `voice-nav-01`) |

**Governance guard:** PATCH/avatar succeed only for `[DEV]` or prefix-less agents; `[ALPHA|BETA|PROD|ARCHIVED]` return `403`. Mirrors the repo's ElevenLabs governance rule.

**LLM access:** every LLM call goes through `llm.sh` (Gemini provider chain) per the project's no-direct-REST-keys rule. The two upstream blocks that originally used `generateObject` from the Vercel `ai` SDK are re-wired through `/api/extract-form` and `/api/voice-nav`.

### Upstream provenance

Every file under `playground/ui-library/src/` was fetched verbatim from `github.com/elevenlabs/ui@main` (`apps/www/registry/elevenlabs-ui/`), with one rewrite applied: `@/registry/elevenlabs-ui/{ui,hooks,lib,blocks,examples}/X` → `@/{components/ui,hooks,lib,blocks,examples}/X` so the bundler resolves them in this layout. Server actions (`"use server"`) are swapped per-file for client shims that hit the proxies above. `next/link` is stubbed by `lib/next-link.tsx` (one block uses it).

## Verify

```bash
bun run playground/verify.mjs         # Playwright 9-step e2e (render → conversation → URL params) → audit/verify/
bun run playground/live-probe.mjs     # 7 live capability probes → audit/F-L
bun run playground/audit-shots.mjs    # fidelity capture → audit/A-E
```

Last green: `verify.mjs` 9/9 steps + 0 console errors, real agent reply confirmed.

## Extend

- **Add a new widget knob** → add a row to `ATTR_SPECS` in `public/app.js` with `{sec, key, label, type, ...}`. The control renders automatically.
- **Add a new component to the UI library** → drop the TSX in `ui-library/src/components/ui/` (path rewrites handled), import in `main.tsx`. Bun build picks it up.
- **Add a new block** → drop the upstream `page.tsx` in `ui-library/src/blocks/<name>/`, run the same path-rewrites, register in `blocks-main.tsx`. If it has `"use server"` actions, write a client shim that hits the proxy.

Build: `bun build playground/ui-library/src/{main,examples-main,blocks-main}.tsx --outdir playground/public/ui-library --target browser --format esm --define process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID='"agent_..."'`.

## Honest gaps

- `useScribe` panel in `/react.html` connects via single-use token but transcripts stay empty in headless because no real mic audio is sent. Works with real mic input.
- Custom-tag re-registration is illustrative only — the CDN bundle registers `elevenlabs-convai` by default.
- `worklet-path-*` widget attributes are settable but only have effect with a self-hosted worklet (CSP / offline).
- The Pong block uses an in-memory player-presence map (single-tab); real multiplayer would need the upstream Upstash Redis.
