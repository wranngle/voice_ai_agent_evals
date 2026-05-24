# DeepWiki digest — elevenlabs/packages §5.4 UI Components and Markdown Rendering

> Source: https://deepwiki.com/elevenlabs/packages/5.4-ui-components-and-markdown-rendering
> Captured: 2026-05-23 via WebFetch (model-summarized; theme tokens cross-checked vs `source/styles-index.css`).

## Icon registry (`ICON_MAP`)

`phone`, `phone-off`, `chat`, `mic`, `mic-off`, `soundwave`, `check`, `chevron-down`, `chevron-up`, `send`, `star`, `copy`, `download`, `wrap`, `maximize`, `minimize`, `loader`, `x`.

`Icon` uses slot rendering `<slot name="icon-{name}">` with SVG fallbacks → **host pages can override icons via named slots**. `FeedbackIcon` accepts `orbColor`, `circleBackgroundColor`, `starColor`.

## Button variants

`primary` (accent bg / accent-primary text), `secondary` (base bg + border), `ghost` (minimal), `md-button` (inline markdown, `h-6`). Props: `icon`, `variant`, `children`, `aria-label`, `iconClassName`, `truncate`, `disabledStyle`.

## Layout / widget components

`Wrapper`, `Sheet`, `Transcript`, `StatusLabel`, `ExpandableTriggerActions`, `SheetActions`, `LanguageSelect`, `PoweredBy`, `TermsModal`, `ErrorModal`, streaming message bubbles. (Source dir adds: `CallButton`, `Compact/Full[Expandable]Trigger`, `ConversationModeToggleButton`, `AvatarOverlay`, `DismissButton`, `ExpandButton`, `Rating`, `Feedback*`, `EventBridge`.)

## Markdown pipeline (`WidgetStreamdown`)

1. Block split on `---`
2. remark: `remarkGfm`, `remarkCjkFriendly`, `remarkCjkFriendlyGfmStrikethrough`
3. rehype: `rehypeRaw` → `rehypeSanitize` → `rehypeHarden`
4. Link security: allowlist via `allowedDomainsToLinkPrefixes()`
Props: `children`, `parseIncompleteMarkdown` (default `true`), `isAnimating`, `linkConfig`, `className`. Contexts: `StreamdownRuntimeContext` (`isAnimating`), `ParsersContext`.

## Syntax highlighting (GitHub Light default; `[data-syntax-theme="dark"]` for dark)

Token classes: `.tok-comment .tok-keyword .tok-string .tok-variableName .tok-typeName .tok-className .tok-number .tok-operator .tok-punctuation .tok-inserted .tok-deleted .tok-heading .tok-emphasis .tok-strong …` (full color values in `source/styles-index.css`).

## Tailwind theme → CSS custom properties (`--el-` prefix)

Color cross-product: `{base,accent} × {"",hover,active,border,subtle,primary,error}` → `bg-base-hover` → `var(--el-base-hover)`.

Radius tokens: `rounded-button`→`--el-button-radius`, `rounded-input`→`--el-input-radius`, `rounded-bubble`→`--el-bubble-radius`, `rounded-sheet`→`--el-sheet-radius`, `rounded-compact-sheet`→`--el-compact-sheet-radius`, `rounded-dropdown-sheet`→`--el-dropdown-sheet-radius`.

Font scale: xs 12/16, sm 14/20, md 16/24, lg 18/26, xl 20/28, 2xl 24/30.

## Shadow-DOM Tailwind fix (`tailwindFixShadowDOM` Vite plugin)

Converts `@supports` → `@media all`; replaces `:root` selectors with `:host` so Tailwind utilities apply inside the shadow root.

## Utility classes

`.overlay`, `.focus-ring`, `.animate-text`, `.animate-spin`, `.terms` (h1–h6), `[data-variant="compact|expanded|fullscreen"] .sheet` responsive sizing.
