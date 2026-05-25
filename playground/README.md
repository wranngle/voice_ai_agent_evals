# ElevenLabs Widget & UI Component Showcase

A **one-page Agent Console** that demos **every public ElevenLabs UI surface** — the embeddable chat/voice widget, the `@elevenlabs/react` hooks, the full ui.elevenlabs.io component library, the upstream component example demos, and all 11 upstream reference apps — wired to a real `[DEV]` ElevenLabs agent via a key-safe Bun proxy. `/` is a single React app (`gallery.html` + `ui-library/src/gallery-main.tsx` + `ui-library/src/spa/*`) with two client-side views — **Showcase** (auto-playing looks · capabilities · components) and **Control plane** (the live `<elevenlabs-convai>` widget + its full knob set) — plus a docked JSONL terminal. The earlier standalone pages are retained but 302 → `/`.

## Run

```bash
bun playground          # → http://localhost:4321   (alias for: bun run playground/server.ts)
```

The server reads `ELEVENLABS_API_KEY` from `./.env` or `~/.agents/.env`. **The key never reaches the browser** — every authenticated call goes through the proxy.

## The one page

`/` (`gallery.html`) is the whole product. Sidebar switches two client-side views (no page loads); a docked JSONL terminal logs every action to `logs/voice-evals-<date>.jsonl`.

| View | What | Source |
|---|---|---|
| **Showcase** | Hero orb + three auto-playing rails: Looks (8 live Orbs cycling agent states), Capabilities (8 tiles that deep-link into the control plane with a preset), Components (17 native ui.elevenlabs.io demos, mounted live) | `ui-library/src/spa/showcase.tsx` |
| **Control plane** | The real `<elevenlabs-convai>` widget wired to the `[DEV]` agent + its config: mode / variant / placement / orb palette, 6 behavior toggles, runtime overrides (first message, prompt, language, speed, voice id, llm), server location | `ui-library/src/spa/control-plane.tsx` |

Retained but redirected (302 → `/`): `index.html`+`app.js` (old knob control plane), `react.html`+`react.js` (hooks island), `ui-library.html` / `examples.html` / `blocks.html` (the `main` / `examples-main` / `blocks-main` bundles), `components.html`. Their bundles still build; the deep-dive demos they hosted are now imported directly into the Showcase.

## Showcase agent

`[DEV] Widget Showcase Playground` — `agent_7701ksbwcdzcfe0sj8nhtrxem9h1` (recorded in `agent.json`). Public (auth disabled) so the widget renders unauthenticated; cloned from the inbound template so it has a working voice + prompt; runtime overrides (voice/prompt/llm/language/text_only) enabled. `[DEV]` phase, safe to mutate from the API panel.

## Architecture

```
playground/
  server.ts                  Bun: static host + key-safe API proxy (see endpoints below)
  agent.json                 the showcase agent id + provenance
  FEATURE-MATRIX.md          every feature / knob / combo, [x] / [~] / [ ]
  AUDIT.md                   honest fidelity audit with screenshot evidence
  verify.mjs                 Playwright e2e (11 steps, fails on any console error)
  live-probe.mjs             7 live capability probes (voice/signed-url/override-effect/...)
  verify-all.mjs             single command: verify.mjs + live-probe.mjs = 18 assertions
  public/                    static: gallery.html (the page) + spa.css + textures/ + bundled .js; retained legacy .html
  audit/                     screenshots (verify/01-10, audit/A-Z)
  ui-library/src/            upstream elevenlabs/ui registry, vendored
    components/ui/   63      shadcn primitives + EL components (Orb, Conversation, etc.)
    hooks/            5      useScribe, useTranscriptViewer, etc.
    lib/              1      cn (tailwind-merge + clsx)
    examples/        17      one demo per EL component
    blocks/          11      full reference apps (Voice Chat / Pong / etc.)
    spa/                     the one-page console: log.ts · ui.tsx · showcase.tsx · control-plane.tsx
    gallery-main.tsx         entry → bundles the console at /
    main.tsx                 entry → /ui-library.html bundle (retained)
    examples-main.tsx        entry → /examples.html bundle (retained)
    blocks-main.tsx          entry → /blocks.html bundle (retained)
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
bun run playground/verify-all.mjs     # the gate: 11-step e2e + 7 live capabilities = 18 assertions
bun run playground/verify.mjs         # Playwright e2e against the one-page console → playground/verify/
bun run playground/live-probe.mjs     # 7 live capabilities (real agent + signed-url + WebRTC + Scribe) → playground/audit/
```

Last green: `verify-all.mjs` 11/11 + 7/7 = 18 assertions, 0 console errors, real agent + signed-url + WebRTC + Scribe all reached.

## Extend

- **Add a new control-plane knob** → add it to `ui-library/src/spa/control-plane.tsx` (a `TOGGLES` entry for a boolean attribute, or a field + `attrs` mapping for a value). The live `<elevenlabs-convai>` remounts on change.
- **Add a new component to the Showcase** → import its demo in `ui-library/src/spa/showcase.tsx` and add it to the `COMPONENTS` list (set `contain: true` if its root is `position:absolute`). Bun build picks it up.
- **Add a new block** → drop the upstream `page.tsx` in `ui-library/src/blocks/<name>/`, run the same path-rewrites, register in `blocks-main.tsx`. If it has `"use server"` actions, write a client shim that hits the proxy.

Build: `bun build playground/ui-library/src/{main,examples-main,blocks-main,gallery-main}.tsx --outdir playground/public/ui-library --target browser --format esm --define process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID='"agent_..."'`. `gallery-main` is the live one-page console (`/`); the other three back the retained deep-dive bundles.

## Honest gaps

- `useScribe` panel in `/react.html` connects via single-use token but transcripts stay empty in headless because no real mic audio is sent. Works with real mic input.
- Custom-tag re-registration is illustrative only — the CDN bundle registers `elevenlabs-convai` by default.
- `worklet-path-*` widget attributes are settable but only have effect with a self-hosted worklet (CSP / offline).
- The Pong block uses an in-memory player-presence map (single-tab); real multiplayer would need the upstream Upstash Redis.
