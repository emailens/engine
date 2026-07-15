# Changelog

## 0.9.4

### Fixed

- **`analyzeSpam()` physical-address detection is no longer US-only.** The street-address pattern recognised only US suffixes (`St`, `Ave`, `Blvd`…), so a valid European address in the footer — `12 chemin du Beauregard, 93370 Montfermeil` — was reported as `missing-physical-address` (a CAN-SPAM warning), flagging legitimate mail from any non-US sender. Detection now covers the common street-word orders: Anglo type-last (incl. UK lettered house numbers like `221B`), French/Italian number→type, Spanish/Portuguese type→name→number, and German/Dutch/Nordic name+type→number, plus UK and Dutch postal-code formats. Bare-name streets with no type word (e.g. Dutch `Damrak 12`) are, as before, recognised via the semantic `<address>` element — the reliable signal that no content regex can replace.

## 0.9.3

### Fixed

- **`analyzeSpam()` no longer flags React Email preheaders as hidden text.** `isLikelyPreheader()` bailed out at `text.length > 200`, but React Email's `<Preview>` pads the preheader with hundreds of zero-width characters (U+200B–U+200F) so body copy does not leak into the inbox snippet. Those characters are invisible, yet they counted toward the ceiling — so the guard never fired and the standard preheader of every React Email was reported as `[error] hidden-text: Hidden text detected — major spam filter red flag` (-20 points). Visible length is now measured with the zero-width padding stripped. The 200-character ceiling is unchanged, because it is what stops keyword stuffing behind preheader-shaped CSS: long *visible* hidden text is still flagged.

## 0.9.2

### Documentation

- New **[ROADMAP.md](./ROADMAP.md)** — separates "shipped" / "considering" items from the issue tracker so the latter can host actual user bug reports.
- README: added Outlook iOS and Outlook Android to the supported-clients table (was missing despite being shipped in 0.9.0); refreshed the test count badge; added a new "vs other email libraries" comparison covering `juice`, `email-comb`, `mjml`, and `maizzle` with explicit "complementary, not competitor" framing; replaced the inline roadmap with a link to ROADMAP.md.

## 0.9.1

### Fixed

- **`toPlainText()` rewrite** — Rewrote HTML-to-plain-text conversion to walk the DOM tree node-by-node instead of using cheerio's `.text()`. Email HTML with deeply nested tables (10+ levels) no longer produces excessive whitespace. Block elements emit clean line breaks, inline siblings get proper spacing (e.g. `<span>15</span><span>Clients</span>` → `"15 Clients"`), and the output collapses to readable paragraphs.

## 0.9.0

### Added

- **Outlook iOS and Outlook Android** email clients — full CSS support matrix data (synced from caniemail.com), per-client transforms, and dark mode simulation with partial color inversion.
- **Outlook Windows Mail → Outlook Classic consolidation** — `outlook-windows-legacy` now maps the former Windows Mail client with `engine: "Microsoft Word"` and `deprecated: "2026-10"`.
- Dark mode simulation now gives **mobile-specific guidance** for Outlook iOS/Android instead of incorrectly suggesting `[data-ogsc]`/`[data-ogsb]` attribute overrides (which are Outlook.com web-only).
- New tests for `outlook-ios` and `outlook-android` covering transforms and dark mode behavior.

### Fixed

- Battle test matrix integrity check now validates all 15 client IDs (was 13, missing `outlook-ios` and `outlook-android`).
- API docs dark mode section corrected: Gmail iOS uses full inversion (not partial), Gmail Web and Yahoo Mail do not invert content, Apple Mail respects `prefers-color-scheme`.
- `transformForAllClients()` performance note corrected from 12 to 15 parses.

## 0.2.0

### Added

- **AI-powered fix generation** — `generateAiFix()` builds a structured prompt from the engine's analysis, sends it to any LLM via a provider callback, and extracts the fixed code. The engine stays provider-agnostic.
- **Token estimation** — `estimateAiFixTokens()` pre-flight estimates input/output tokens, with optional precise counter callback. Includes system prompt overhead (default 250 tokens for `AI_FIX_SYSTEM_PROMPT`).
- **Smart truncation** — When prompts exceed `maxInputTokens`, warnings are intelligently trimmed: dedup → remove info → remove CSS-only → trim snippets. Structural and error warnings are preserved.
- **`heuristicTokenCount()`** — Instant synchronous token estimate (~3.5 chars/token, within ~10-15% of real Claude tokenizer for HTML/CSS).
- **`AI_FIX_SYSTEM_PROMPT`** — Expert system prompt for email compatibility fixes, with structural fix patterns (table layouts, VML, MSO conditionals).
- **Fix type classification** — Every `CSSWarning` now includes `fixType: "css" | "structural"`. Structural warnings require HTML restructuring; CSS-only warnings can be fixed with property swaps.
- **`STRUCTURAL_FIX_PROPERTIES`** — Exported `Set<string>` of properties requiring HTML changes (flex, grid, word-break, overflow-wrap, position, border-radius, background-image, `<svg>`, `<form>`, `<video>`, etc.).
- **15 new CSS properties** in the support matrix: `word-break`, `overflow-wrap`, `white-space`, `text-overflow`, `vertical-align`, `border-spacing`, `min-width`, `min-height`, `max-height`, `text-shadow`, `background-size`, `background-position`.
- **Fix snippets** for new properties: `word-break` (html, jsx, mjml), `overflow-wrap` (html, jsx), `text-shadow`, `border-spacing`, `min-width`, `min-height`, `max-height`.
- **Client prefix support** for Yahoo Mail and Samsung Mail in fix snippet resolution.
- **71 new tests** covering fixType classification, new CSS properties, STRUCTURAL_FIX_PROPERTIES, fix snippets, token estimation, smart truncation, generateAiFix (with mock providers), and extractCode edge cases.

### Fixed

- Element-level warnings (`<style>`, `<link>`, `<svg>`, `<video>`, `<form>`, `@font-face`, `@media`) now include `fixType` — previously undefined.
- Warnings from `<style>` block CSS parsing (section 9 in analyzer) now include `fixType`.
- `extractCode()` now picks the largest code fence when multiple exist, instead of the first.
- Token estimates now account for system prompt overhead (250 tokens by default), configurable via `systemPromptTokens` option.
- Smart truncation output is now propagated to `generateAiFix()` prompt — previously the truncated list was discarded and the full warning set was used.

## 0.1.0

Initial release — CSS analysis, per-client transformation, compatibility scoring, dark mode simulation, framework-aware fix snippets, diff comparison, and fix prompt generation for 13 email clients.
