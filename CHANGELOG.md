# Changelog

## 0.10.2 — 2026-08-23

### Added

- **Source positions on every issue (`loc`).** Pass `positions: true` to `auditEmail()`, `createSession()`, or any of the standalone analyzers and each finding that belongs to a specific node carries a `SourceLocation` — 1-based `line`/`column`, `endLine`/`endColumn`, plus a 0-based `offset` and `length` for consumers that prefer offsets. A CSS declaration in a `<style>` block resolves to the declaration itself, an inline style to its `style="…"` attribute, link/image/accessibility findings to the attribute or opening tag they are about, and a template variable to the variable in the text. Document-level findings (Gmail clipping, aggregate counts) leave `loc` undefined. This is what lets `@emailens/cli` print `file:line:col`, the GitHub Action post inline annotations, and an editor draw squiggles. Additive and opt-in; the cost grows with document size — about +6–14% on a full audit at typical email size, +30% at Gmail's ~102KB clip limit (`bun run bench:positions`, which now includes scaled-up inputs).

- **Positions on the layout and visual analyzers.** Content overflow, visual bugs, dark-mode coverage and at-rule warnings each describe a specific element or declaration, and each now carries one: a fixed width points at the `width` attribute or the `style` that set it, a gradient with no fallback at the declaration that caused it, an unbreakable string at the string, `@media`/`@font-face` at the rule, and a light background the dark block misses at the `bgcolor` keeping it light. These carry a concrete `fix`, so they are the findings an editor is most likely to offer to apply.

- **`CSSWarning.locs` — every place a property breaks, not just the first.** One warning covers a property, and one property can break in a dozen elements; `loc` is the first occurrence and `locs` lists them all in document order, so an editor can flag each one and a fix can be applied everywhere. Capped at 100 occurrences with `locsTruncated: true` when the list is partial, rather than silently dropping the rest. Purely additive — warning counts and compatibility scores are unchanged, which is asserted by test.

- **`caveatApplies()`, `VALUE_CAVEAT_PROPS` and `CSS_SUPPORT_NOTES` are exported.** The gate the analyzer uses to decide whether a client's partial-support caveat is about the value in front of it. A consumer that renders the support table — an editor hover, a docs page — needs the same answer the analyzer gives, or it will tell a reader a property is partial in seven clients on a line the linter deliberately left alone.

### Changed

- **Value-aware partial support for eight more properties, cutting partial-support info findings by 61%.** 0.10.0 made `margin`, `position` and `overflow` fire only on the values that actually break; every other "partial" property still warned on every use. But almost every partial rating in caniemail is value-level: `font-size` is partial in Outlook Classic because `rem` is dropped, not because `14px` is; `background` because Outlook keeps only the colour; `font-weight` because Outlook snaps numbers to normal or bold. The result was 982 info findings across this repo's three fixtures, 62% of everything the analyzer said, and `font-size: 14px`, `display: block`, `background: #ffffff` and `text-align: center` were among the loudest. `background`, `border-radius`, `display`, `font-size`, `font-weight`, `letter-spacing`, `text-align` and `transition` are now gated the same way, each against its own per-client caniemail note. So `font-size: 1rem` still reports in the seven clients whose note names `rem` or relative sizes, while `font-size: 90%` reports only in the two whose note names percentages; `font-weight: 700` is silent in Outlook and `font-weight: 350` is not; `border-radius` no longer reports *partial* support for anything but the elliptical `/` shorthand, though the clients that drop it outright still warn on every value; and `transition` counts an omitted property name as `all`, because that is what CSS says it means. Notes that are not about the value at all — Samsung's "not supported with Outlook accounts", Hey's forced `transition-duration: 0` — still report on every use, and a note the parser cannot read reports rather than staying quiet. Across the fixtures info drops 982 → 387. **Warning counts and messages change** — the "partial support in …" half of a merged finding disappears wherever the value is fine — so regenerate any cached or snapshotted analyzer output downstream. Errors (14) and warnings (587) are unchanged, and so are compatibility scores, which never counted partial support; `ClientScore.info` does move.

- **A finding points at the declarations that caused it.** One warning covers a property across a whole stylesheet, and it used to carry every location that property appeared at. Now that a caveat can be about one value and not another, that meant underlining `font-size: 14px` under the message "`rem` values are not supported" — a worse position than none. Locations are filtered per client to the declarations that triggered that client's caveat.

- **Each declaration is judged on its own value.** The `<style>`-block path joined every value a property was given into one string before gating, so a sheet setting `position: relative` in one rule and `position: fixed` in another was gated on `relative` alone and Yahoo's caveat was lost. Inline styles read only the first of a repeated declaration, so `style="display:block;display:flex"` — the progressive-enhancement idiom — was judged on the value the client discards. Both paths now see every value, and the caveat applies if any of them triggers it.

- **Positions resolve against the original source, so character references and mixed line endings no longer shift them.** parse5 hands analyzers decoded text — `&amp;` collapsed to `&`, CRLF to LF — so an index into that text is not an index into the file. Previously a template variable in a text node containing `&nbsp;` anchored to the start of the node (an editor would have underlined the wrong words), and a `<style>` block mixing CRLF and LF produced a zero-length position at the block start. Both are now exact. The only remaining fallback is a token that was itself encoded (`{{a&amp;b}}`).

- **The template-variable scan no longer clones the DOM.** It walked `$.root().clone()` and recursed once per level, so a deeply nested email (tables inside tables) could exhaust the stack before the checker ran; it now walks text nodes iteratively and reuses that walk for both the per-node and whole-document passes. Same findings, no second copy of the DOM.

- **`CSSWarning.line` is deprecated in favour of `loc`.** Its meaning is unchanged without `positions` (the line within the `<style>` block, absent for inline styles); with `positions: true` it reports the document line, i.e. `loc.line`.

### Fixed

- **`display: None` was invisible to every check.** Outlook's caveats for `display:none` (it does not inherit into nested tables, and does not work on an `<img>`) hang off a compound `display:none` feature key that was matched case-sensitively, so any spelling but lowercase reached neither it nor the property-level check. Present since 0.10.0.

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
