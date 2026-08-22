# Changelog

## Unreleased

### Added

- **Source positions on every issue (`loc`).** Pass `positions: true` to `auditEmail()`, `createSession()`, or any of the standalone analyzers and each finding that belongs to a specific node carries a `SourceLocation` — 1-based `line`/`column`, `endLine`/`endColumn`, plus a 0-based `offset` and `length` for consumers that prefer offsets. A CSS declaration in a `<style>` block resolves to the declaration itself, an inline style to its `style="…"` attribute, link/image/accessibility findings to the attribute or opening tag they are about, and a template variable to the variable in the text. Document-level findings (Gmail clipping, aggregate counts) leave `loc` undefined. This is what lets `@emailens/cli` print `file:line:col`, the GitHub Action post inline annotations, and an editor draw squiggles. Additive and opt-in — roughly +20% on the parse and +3–9% on a full audit (`bun run bench:positions`).

### Changed

- **`CSSWarning.line` is deprecated in favour of `loc`.** Its meaning is unchanged without `positions` (the line within the `<style>` block, absent for inline styles); with `positions: true` it reports the document line, i.e. `loc.line`.

## 0.10.1 — 2026-07-30

### Added

- **Dark-mode opt-in and coverage checks.** Two new analyzer warnings, both gated on the email actually shipping a `@media (prefers-color-scheme: dark)` block — emails with no dark styling are unaffected. `dark-mode-opt-in` fires when dark styles exist but neither `<meta name="color-scheme">` nor `<meta name="supported-color-schemes">` does, so Apple Mail and the other `prefers-color-scheme` clients may never enter dark mode and the media query silently never fires. `dark-mode-coverage` catches the **half-inverted render**: an element carrying a hardcoded light background (a `bgcolor` attribute or an inline `background`/`background-color`) that the dark block never overrides, so it stays white while the rest of the email inverts — the defect that leaves light text on a still-white card. Cascade-aware: an inline background needs an `!important` dark rule to be considered covered, a `bgcolor` attribute loses to any dark rule. Surfaced through `analyzeEmail()` and `auditEmail()` like every other compatibility warning; capped at 3 elements so a large email can't flood the report.

## 0.10.0 — 2026-07-29

### Added

- **Visual-bug detection with fixes (`checkVisual()`, and a `visual` section in `auditEmail()`).** Catches probable rendering bugs in stylized emails — a graceful-degradation class distinct from per-property support: background images/gradients with no solid `background-color` (they render as a blank area, and can hide overlaid text, in Outlook), and `font-family` stacks with no web-safe fallback (Gmail/Outlook fall back to Times New Roman). Each issue carries a concrete `fix` — for gradients the fallback color is computed from the first stop; for fonts a web-safe family is appended. Available standalone, via `EmailSession.checkVisual()`, and in the audit; skippable with `skip: ["visual"]`.

- **Content-overflow detection (`checkOverflow()`, and an `overflow` section in `auditEmail()`).** A client-agnostic layout check that flags content likely to force horizontal scrolling: fixed pixel widths wider than the email frame (with no `width:100%`/`max-width:100%` escape), and long unbreakable strings (raw URLs, tokens) that can't wrap. Available standalone, via `EmailSession.checkOverflow()`, and in the unified audit; skippable with `skip: ["overflow"]`.

- **`CSS_SUPPORT_NOTES` — the per-client caveat behind every partial/buggy/unsupported rating**, captured from caniemail (e.g. `margin` → "Negative values are not supported"; `position` → "Supports `sticky` but not `relative`, `absolute` and `fixed`"). Previously the sync discarded these. Warnings now cite the specific caveat instead of a generic "partial support" message.

- **Six new email clients: `outlook-macos` (Outlook for Mac), `yahoo-mail-android`, `yahoo-mail-ios`, `protonmail` (Proton Mail), `aol` (AOL Mail), and `fastmail`.** All are backed by verified caniemail.com data (242–306 features known each) and are first-class across the analyzer and `transformForClient()`/`transformForAllClients()`. Outlook for Mac uses the WebKit web-rendering engine (mirrors `outlook-web`, not the Word engine) and the Yahoo mobile apps mirror `yahoo-mail`; the three webmail additions get per-client transform behaviour derived directly from their caniemail data (e.g. Proton Mail strips `animation`, external stylesheets, and forms; AOL additionally drops `box-shadow`/`opacity`/`transform`). The support matrix now covers **21 clients**.

### Changed

- **`generateFixPrompt()` / `generateAiFix()` now fold in content-overflow and visual-bug findings.** New optional `overflow` and `visual` options (arrays from `checkOverflow()` / `checkVisual()`) render a "Layout & Visual Issues" section in the fix prompt, each with its concrete fix (computed gradient fallback, appended web-safe font, width constraint). This lets the AI fixer/builder repair these rendering bugs on an existing email, not just per-property CSS-compatibility warnings.

- **Refreshed the caniemail.com support data (synced 2026-07-20, up from 2026-02-16).** The matrix grows from 251 to **255 features**: adds `font-size-adjust`, `inert`, `:focus-visible`, and `:focus-within`, and updates 9 support cells — most notably `display: grid` is now recognised as supported in Gmail web, Outlook iOS/Android, and Yahoo Mail.

- **Partial-support warnings for `margin`, `position`, and `overflow` are now value-aware and per-client** — a precision fix. Previously every use of these near-universal properties produced an info warning across every partial client (e.g. `margin: 16px` warned in 12 clients). Now the warning fires only when the *value* actually hits that client's caveat: `margin` on negative/`auto` values (and `auto` only where the client's note flags it), `position` on the specific keyword each client doesn't support (Outlook drops `relative`/`absolute` but renders `sticky`; Yahoo supports only `relative`), and `overflow` only on scrollable values for the mobile clients with the "can't scroll to hidden content" bug (`overflow: hidden` no longer warns). This substantially cuts false-positive info warnings and makes the survivors specific. Warning *counts and messages change* — regenerate any cached/snapshotted analyzer output downstream.

## 0.9.6

### Added

- **`Severity` and `BaseIssue` exported types.** `Severity` is the shared `"error" | "warning" | "info"` union used across every report; `BaseIssue` is the `{ rule; severity; message }` shape that the analyzer issue types (`SpamIssue`, `LinkIssue`, `AccessibilityIssue`, …) now extend. Both are additive — the existing issue types keep the exact same structure.

### Changed

- **Internal cleanup, no behavior change.** The seven HTML analyzers now share one `fromHtml()` entry guard (empty-input + size-cap + parse) instead of repeating it; `auditEmail()` and `EmailSession.audit()` share a single `runAudit()` / `EMPTY_AUDIT` instead of duplicating the check list; removed unused type stubs, an unused `CSSRule` interface, and an unused `compile()` parameter. Public API and output are unchanged (all tests green).

## 0.9.5

### Added

- **`generateFixPrompt()`** — builds a paste-ready, provider-agnostic LLM prompt from the engine's analysis (original HTML, per-client warnings, and compatibility scores). Scope it to `all` clients or a single `selectedClientId`, pass the source `format` (`html`/`jsx`/`mjml`/`maizzle`) for framework-aware guidance, and an optional `intent` to steer the fix (e.g. "keep the gradient header"). Complements `generateAiFix()`, which sends a prompt to an actual provider callback.

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
