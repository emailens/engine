# Contributing to @emailens/engine

Contributions are welcome! Please [open an issue](https://github.com/emailens/engine/issues) to discuss your idea before submitting a PR.

Have a question or want to share how you're using Emailens? Start a thread in [GitHub Discussions](https://github.com/emailens/engine/discussions).

## Getting Started

```bash
git clone https://github.com/emailens/engine.git
cd engine
bun install
bun test          # 574 tests
bun run build     # tsup → dist/
bun run typecheck # tsc --noEmit
```

## Architecture Overview

### Entry Points

The package ships three entry points (configured in `tsup.config.ts`):

| Import | Source | Description |
|---|---|---|
| `@emailens/engine` | `src/index.ts` | Core analysis — CSS, spam, a11y, links, images, inbox preview, size, templates, AI fix |
| `@emailens/engine/compile` | `src/compile/index.ts` | JSX / MJML / Maizzle → HTML compilers |
| `@emailens/engine/server` | `src/server.ts` | Node-only: `checkDeliverability` (DNS), `checkSpamAssassin` (child_process) |

### Module Map

```
src/
├── index.ts                  # Public re-exports for main entry point
├── audit.ts                  # auditEmail() — shared DOM parse, runs all 8 analyzers
├── session.ts                # createSession() — pre-parsed DOM, exposes all methods
├── analyze.ts                # CSS compatibility analysis (250+ properties × 15 clients)
├── spam-scorer.ts            # Heuristic spam scoring (45+ signals)
├── link-validator.ts         # Static link analysis (no network requests)
├── accessibility-checker.ts  # WCAG accessibility audit
├── image-analyzer.ts         # Image best-practice checks
├── inbox-preview.ts          # Subject/preheader extraction and truncation
├── size-checker.ts           # Gmail clipping detection
├── template-checker.ts       # Unresolved merge-tag detection
├── deliverability-checker.ts # DNS-based deliverability (SPF/DKIM/DMARC/MX/BIMI)
├── spamassassin.ts           # SpamAssassin integration (spamc/spamassassin)
├── transform.ts              # Per-client HTML transforms (strip/inline CSS)
├── dark-mode.ts              # Dark mode simulation (luminance-based)
├── ai-fix.ts                 # LLM-powered structural fix generation
├── token-utils.ts            # Token estimation for AI prompts
├── export-prompt.ts          # AI fix prompt builder
├── diff.ts                   # Before/after analysis comparison
├── style-utils.ts            # CSS parsing helpers
├── color-utils.ts            # Color math (luminance, contrast, WCAG)
├── clients.ts                # Email client definitions and metadata
├── constants.ts              # Shared constants (MAX_HTML_SIZE, empty reports)
├── types.ts                  # TypeScript type definitions
├── server.ts                 # Server entry point (re-exports Node-only APIs)
├── fix-snippets/             # Paste-ready code fixes, organized by framework
│   ├── index.ts              # getCodeFix() — tiered resolution (framework+client → generic)
│   ├── html-fixes.ts         # Generic HTML fix snippets
│   ├── jsx-fixes.ts          # React Email fix snippets
│   ├── mjml-fixes.ts         # MJML fix snippets
│   ├── maizzle-fixes.ts      # Maizzle fix snippets
│   ├── html-suggestions.ts   # Generic suggestion strings
│   ├── jsx-suggestions.ts    # React Email suggestion strings
│   ├── mjml-suggestions.ts   # MJML suggestion strings
│   └── maizzle-suggestions.ts# Maizzle suggestion strings
├── compile/                  # Template compilers
│   ├── index.ts              # compile(), detectFormat()
│   ├── react-email.ts        # JSX/TSX compiler (sucrase + sandbox)
│   ├── mjml.ts               # MJML compiler
│   ├── maizzle.ts            # Maizzle compiler (with PostHTML sandboxing)
│   └── errors.ts             # CompileError class
├── rules/                    # CSS support data
│   └── css-support.ts        # CSS_SUPPORT, HTML_ELEMENT_FEATURES, etc.
└── __tests__/                # Test files (one per module)
    ├── engine.test.ts        # Core CSS analysis tests
    ├── spam-scorer.test.ts   # Spam scoring tests
    ├── audit.test.ts         # auditEmail() integration tests
    ├── session.test.ts       # createSession() tests
    ├── accuracy.test.ts      # Real-world email accuracy benchmarks
    ├── battle.test.ts        # Edge-case battle tests
    └── ...                   # One test file per analyzer module
```

## How the Module System Works

### Shared DOM Parsing

Every analyzer has two variants:

- **Public function** (e.g., `analyzeSpam(html)`) — parses HTML internally, suitable for standalone use
- **`FromDom` variant** (e.g., `analyzeSpamFromDom($)`) — accepts a pre-parsed Cheerio instance

`auditEmail()` in `src/audit.ts` calls `cheerio.load(html)` once, then passes `$` to all `FromDom` variants. `createSession()` in `src/session.ts` does the same but exposes the shared DOM through method closures.

### Analyzer Pattern

Every analyzer follows this pattern:

1. Accept HTML string (or Cheerio `$` for `FromDom` variants)
2. Enforce `MAX_HTML_SIZE` limit (public functions only)
3. Walk the DOM (elements, attributes, style blocks)
4. Return a typed report interface

### Fix Snippet Resolution

`getCodeFix()` in `src/fix-snippets/index.ts` resolves fixes using a 4-tier cascade:

1. **`property::clientPrefix::framework`** — most specific (e.g., `display:flex::outlook::jsx`)
2. **`property::framework`** — framework-specific (e.g., `display:grid::jsx`)
3. **`property::clientPrefix`** — client-specific (e.g., `border-radius::outlook`)
4. **`property`** — generic HTML fallback

## Data Sources and Freshness

The engine relies on a mix of automated and manually-curated data. Run `bun run check:freshness` to see which data sources are due for review.

### Automated Data

| Data | Source | Script | Frequency |
|---|---|---|---|
| CSS support matrix (251 features × 15 clients) | [caniemail.com](https://www.caniemail.com/) API | `bun run sync:caniemail` | Before each release |

### Manually-Curated Data

These data sources have no public API and require periodic manual verification against authoritative references. Each file contains a `Last verified: YYYY-MM-DD` date stamp that `check:freshness` monitors.

| Data | File | Verify Against |
|---|---|---|
| Dark mode behavior per client | `src/dark-mode.ts` | [Litmus dark mode guide](https://www.litmus.com/blog/the-ultimate-guide-to-dark-mode-for-email-marketers), [Can I Email prefers-color-scheme](https://www.caniemail.com/features/css-at-media-prefers-color-scheme/), [Parcel dark mode guide](https://parcel.io/guides/dark-mode) |
| Subject/preheader display limits | `src/constants.ts` (`CLIENT_DISPLAY_LIMITS`) | [Email Tool Tester subject line limits](https://www.emailtooltester.com/en/blog/email-subject-lines-character-limit/), [Litmus preview text guide](https://www.litmus.com/blog/the-ultimate-guide-to-preview-text-support) |
| Superhuman CSS overrides | `scripts/superhuman-overrides.ts` | Manual testing in Superhuman app (no testing service covers Superhuman) |

**When updating manually-curated data**, always update the `Last verified: YYYY-MM-DD` date stamp in the file header. The freshness check flags anything older than 90 days.

### Freshness Check

```bash
bun run check:freshness
```

This script scans all data files for their verification dates and reports which ones are stale. It exits with code 1 if any data is overdue, making it suitable for CI or pre-release checks.

## How to Add a New CSS Property Rule

Adding support data for a new CSS property (e.g., `aspect-ratio`):

1. **Check caniemail.com** — look up the property's support across email clients
2. **Add the entry to `src/rules/css-support.ts`** — add a new key to `CSS_SUPPORT` with support levels for all 15 clients:
   ```typescript
   "aspect-ratio": {
     "gmail-web": "unsupported",
     "gmail-android": "unsupported",
     "gmail-ios": "unsupported",
     "outlook-web": "supported",
     "outlook-windows": "unsupported",
     "apple-mail-macos": "supported",
     "apple-mail-ios": "supported",
     "yahoo-mail": "unsupported",
     "samsung-mail": "supported",
     "thunderbird": "supported",
     "hey-mail": "supported",
     "superhuman": "supported",
   },
   ```
3. **Add a fix snippet** — if there's a workaround, add it to the relevant file in `src/fix-snippets/`:
   - `html-fixes.ts` — generic HTML fallback
   - `jsx-fixes.ts` — React Email specific
   - `html-suggestions.ts` / `jsx-suggestions.ts` — human-readable suggestion text
4. **Add a test** — add a test case in `src/__tests__/engine.test.ts` that uses the property in HTML and verifies the warning is generated for the right clients
5. **Run `bun test`** — verify all 574+ tests still pass

> **Note:** `css-support.ts` is auto-generated from caniemail.com via `bun run sync:caniemail`. For manual additions (properties not in caniemail), add them after the auto-generated block.

## How to Add a New Email Client

Adding a new email client (e.g., ProtonMail):

1. **Define the client in `src/clients.ts`**:
   ```typescript
   {
     id: "protonmail",
     name: "ProtonMail",
     category: "webmail",
     engine: "ProtonMail",
     darkModeSupport: true,
     icon: "mail",
   },
   ```
2. **Add support data** — add a `"protonmail"` key to every entry in `CSS_SUPPORT` in `src/rules/css-support.ts` (251 entries)
3. **Add dark mode behavior** — update `src/dark-mode.ts` with the client's dark mode inversion strategy (full, partial, or none)
4. **Add transform rules** — update `src/transform.ts` if the client has specific CSS stripping or inlining behavior
5. **Add inbox preview truncation** — if applicable, update `src/inbox-preview.ts` with subject/preheader length limits
6. **Add tests** — pattern-match against existing client tests in `src/__tests__/engine.test.ts`
7. **Run the full suite** — `bun test` to verify nothing regresses

## How to Add a New Analyzer

1. Create `src/my-analyzer.ts` with a public function and a `FromDom` variant
2. Define a report interface in `src/types.ts`
3. Add an empty report constant in `src/constants.ts`
4. Wire the `FromDom` variant into `src/audit.ts` and `src/session.ts`
5. Add a `skip` option key in `AuditOptions`
6. Export the public function from `src/index.ts`
7. Create `src/__tests__/my-analyzer.test.ts` with tests

## Good First Issues

Looking for a place to start? These are scoped, testable, and don't require understanding the full codebase. Browse the [good first issues](https://github.com/emailens/engine/labels/good%20first%20issue) label for current tickets, or pick from these areas:

### Fix Snippets
Add paste-ready code fixes for CSS properties that lack them. Each fix is a self-contained entry in one of the `src/fix-snippets/` files — no need to touch any analyzer code.

- Add JSX fix for `background-image` + Outlook (VML fill)
- Add MJML fix for `border-radius` + Outlook (`<mj-section>` with border-radius attribute)
- Add generic fallback suggestion for `text-decoration-color`
- Add Maizzle-specific suggestion for `@media` queries

### Spam Heuristics
Add new spam signal detections to `src/spam-scorer.ts`. Each signal is a function that inspects the DOM and returns an issue if triggered.

- Detect excessive use of different font sizes (a common spam pattern)
- Flag emails with no plain-text-friendly content structure
- Detect invisible spacer images used for tracking

### Accessibility Rules
Add WCAG checks to `src/accessibility-checker.ts`.

- Check for sufficient touch target sizes on mobile links
- Detect use of `title` attribute as sole accessible name
- Flag animated GIFs without `prefers-reduced-motion` consideration

### Test Coverage
Pattern-match against existing tests in `src/__tests__/` — each test file mirrors a source module.

- Add edge-case tests for inline styles with vendor prefixes
- Test `analyzeSpam` with non-English content
- Test `checkSize` with emails near the 102KB boundary

## PR Guidelines

1. **Open an issue first** — discuss the change before writing code
2. **Branch from `main`** — keep PRs focused on a single change
3. **Run tests** — `bun test` must pass before submitting
4. **Add tests** — new features and bug fixes should include tests
5. **Keep PRs focused** — one concern per PR; avoid mixing refactors with features

### Commit Convention

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — tooling, deps, CI

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
