# External sources beyond the official docs

Per the directive not to rely on a single source, the corpus triangulates three classes of source. Official `.mdx` pages curate a *subset*; the source repo is ground truth; DeepWiki digests the source; community guides cover no-code embed surfaces.

## 1. Ground-truth source — `elevenlabs/packages` (GitHub)

Raw files downloaded into `source/` (commit `main`, fetched 2026-05-23):

| File | Repo path | What it proves |
|---|---|---|
| `types-attributes.ts` | `packages/convai-widget-core/src/types/attributes.ts` | **Exhaustive 44-entry `CustomAttributeList`** — the complete HTML attribute surface (docs show ~20). |
| `types-config.ts` | `packages/convai-widget-core/src/types/config.ts` | `WidgetConfig` interface, `DefaultTextContents` (all text keys + defaults), `DefaultStyles` (every `--el-` var default), `Variants`/`Placements`/`Location` enums. |
| `styles-index.css` | `packages/convai-widget-core/src/styles/index.css` | Shadow-DOM base CSS, `--el-audio-tag`, syntax-highlight token colors, `.sheet` variant sizing. |
| `styles-Style.tsx` | `packages/convai-widget-core/src/styles/Style.tsx` | Proves `--el-<key>` vars are emitted into `:host, :root` from the `styles` config (numbers → `px`). |
| `contexts-attributes.tsx` | `packages/convai-widget-core/src/contexts/attributes.tsx` | Attribute → signal plumbing. |
| `orb-Orb.ts` | `packages/convai-widget-core/src/orb/Orb.ts` | Orb is a **WebGL2 fragment-shader** (two gradient colors + Perlin-noise texture from `eleven-public-cdn`), not an image/lottie. |
| `widget-core-index.ts` | `packages/convai-widget-core/src/index.ts` | `registerWidget(tagName="elevenlabs-convai")` → `register(ConvAIWidget, tag, [...CustomAttributeList], {shadow:true, mode:"open"})`. Custom tag allowed; observed attrs == `CustomAttributeList`. |
| `embed-index.ts` | `packages/convai-widget-embed/src/index.ts` | CDN bundle = just `registerWidget()`. Published `@elevenlabs/convai-widget-embed@0.12.8` (capture date). |

Repo: https://github.com/elevenlabs/packages — `packages/convai-widget-core/src/` (web component internals), `packages/convai-widget-embed/` (CDN bundle), `packages/react/`, `packages/client/`.

Refresh: `gh api repos/elevenlabs/packages/git/trees/main?recursive=1 --jq '.tree[].path'` then `curl raw.githubusercontent.com/elevenlabs/packages/main/<path>`.

## 2. DeepWiki digests (LLM-indexed source)

- §5.2 Configuration and Customization → `deepwiki-5.2-configuration-and-customization.md` (attribute map, **precedence order**, runtime event, hooks).
- §5.3 Embedding Guide / conversation state → `deepwiki-5.3-embedding-guide.md` (transcript model, session lifecycle, display pipeline, component tree).
- §5.4 UI Components and Markdown Rendering → `deepwiki-5.4-ui-components-and-markdown.md` (icon registry + **slot overrides**, button variants, markdown/rehype chain, `--el-` Tailwind mapping, shadow-DOM fix).

## 3. Community / no-code embed guides (verify before citing — third-party)

- MindStudio — "Embed an AI Voice Agent Widget with ElevenLabs": https://www.mindstudio.ai/blog/embed-ai-voice-agent-widget-website-elevenlabs
- Discover eLearning — widget inside Articulate Storyline 360: https://discoverelearning.com/insights/how-to-set-up-elevenlabs-conversational-ai-widget-in-articulate-storyline-360/
- Webfuse — "Website-Controlling Voice Agent with ElevenLabs and Webfuse" (client-tools-driven page control): https://www.webfuse.com/blog/building-a-website-controlling-voice-agent-with-elevenlabs-and-webfuse
- npm bundle (README 403s to WebFetch; inspect via `npm view`): https://www.npmjs.com/package/@elevenlabs/convai-widget-embed
- Community Rust port (attribute reference cross-check): https://docs.rs/elevenlabs-convai/latest/elevenlabs_convai/widget/index.html
- Forks worth diffing for custom UI: `askbenny/convai-widget-core`, `@ainnov8/convai-widget-embed`.

## Divergences found (docs vs source) — see CAPABILITY-MAP §"Gotchas"

- Variant enum mismatch: source `Variant = tiny|compact|full`; widget API `EmbedVariant = tiny|compact|full|expandable`; widget doc snippet uses `variant="expanded"`. Use the **API enum** for the stored config; the doc's `expanded` maps to runtime expansion flags.
- ~20 attributes are **undocumented** on the official page but present in source (e.g. `override-llm`, `override-speed`, `override-stability`, `override-similarity-boost`, `collect-feedback`, `allow-events`, `environment`, `show-avatar-when-collapsed`, `worklet-path-*`).
