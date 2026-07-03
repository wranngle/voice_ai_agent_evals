# ElevenLabs Widget & Native-UI Customization — Research Corpus

Captured: 2026-05-23

A downloaded, organized, and analyzed corpus of everything governing **ElevenAgents widget settings** and **native UI components**, for full control of the ElevenLabs agent UI experience. Triangulated across three source classes (official docs subset → ground-truth source repo → DeepWiki digests + community guides) per the no-single-source directive.

## Start here

- **`CAPABILITY-MAP.md`** — the analysis. Every control surface, attribute, config field, CSS variable, text key, hook, and event, with precedence, defaults, and gotchas. Read this first.
- **`external/SOURCES.md`** — provenance of non-official sources + divergences found (docs vs source).

## Layout

```
CAPABILITY-MAP.md            # the synthesis / deliverable
README.md                    # this index
llms.txt                     # full ElevenLabs doc index (724 lines) used for enumeration
urls.txt                     # curated UI-relevant page list (39)
manifest.tsv                 # download ledger: status, bytes, slug, path
pages.json                   # structured per-page metadata (tier, title, why)
pages/                       # 39 verbatim official .mdx pages (mirrors URL path)
  eleven-agents/customization/widget.mdx        # primary widget doc
  eleven-agents/api-reference/widget/{get,create}.mdx  # full config schema + avatar upload
  eleven-agents/libraries/{react,java-script,…}.mdx    # native UI SDKs
  eleven-agents/customization/events/*.mdx             # event protocol
  eleven-agents/guides/{chat-mode, no-code/*, integrations/live-avatar}.mdx
external/
  source/                    # ground-truth raw source from github.com/elevenlabs/packages
    types-attributes.ts      # exhaustive 44-attribute CustomAttributeList
    types-config.ts          # WidgetConfig, DefaultTextContents, DefaultStyles
    styles-index.css         # shadow-DOM CSS, --el-audio-tag, syntax tokens
    styles-Style.tsx         # proves --el-<key> emission to :host
    contexts-attributes.tsx  # attribute plumbing
    embed-index.ts           # widget bootstrap + tag registration
    orb-Orb.ts               # WebGL2 orb shader
    widget-core-index.ts     # widget-core package entry (event protocol)
  deepwiki-5.2-configuration-and-customization.md
  deepwiki-5.3-embedding-guide.md
  deepwiki-5.4-ui-components-and-markdown.md
  SOURCES.md
```

## Coverage

- 39/39 official `.mdx` pages downloaded clean (see `manifest.tsv`).
- 8 ground-truth source files from `elevenlabs/packages@main`.
- 3 DeepWiki digests + community-guide pointers.

## Key findings (full detail in CAPABILITY-MAP)

1. Three control surfaces with strict precedence; **SDK overrides beat server/UI config**.
2. **44 HTML attributes** exist in source — ~20 are undocumented on the official page (`override-llm`, `override-speed`, `collect-feedback`, `allow-events`, `environment`, `worklet-path-*`, …).
3. Visual styling = a **20-variable `--el-` token system** emitted into the shadow-DOM `:host`; set via the `styles` config object, not external CSS.
4. **~50 overridable text keys** + per-language `language_presets`.
5. Native UI = `@elevenlabs/react` `ConversationProvider` + granular hooks + `useConversationClientTool`; audio-reactive visualizers via `getInput/OutputByteFrequencyData`.
6. Avatar orb is a **live WebGL2 shader**; static image upload via `POST …/avatar`; full avatar video via LiveAvatar (HeyGen) at PCM 24kHz.
7. Text-only chat mode gets a separate ~25× concurrency pool.

## Refresh

```bash
# re-enumerate doc index
curl -sL https://elevenlabs.io/docs/llms.txt -o llms.txt
# re-download a page verbatim (note the .mdx suffix)
curl -sL https://elevenlabs.io/docs/eleven-agents/customization/widget.mdx -o pages/eleven-agents/customization/widget.mdx
# refresh ground-truth source
gh api repos/elevenlabs/packages/git/trees/main?recursive=1 --jq '.tree[].path'
curl -sL https://raw.githubusercontent.com/elevenlabs/packages/main/packages/convai-widget-core/src/types/attributes.ts
```

Scope: public docs + OSS source only. No credentials or private workspace data captured.
