# Roadmap

This document tracks **non-committed** future work for `@emailens/engine`. None of these items have promised timelines. They're listed here so contributors and users can:

- See the direction the project may grow
- Open focused bug reports against specific gaps instead of broad "feature requests"
- Comment / 👍 to signal which items they'd actually use (signal helps prioritize)

For the issue tracker philosophy: **bugs and concrete requests go in [Issues](https://github.com/emailens/engine/issues). Open-ended ideas live here.** If a roadmap item gets enough interest to scope properly, it graduates to an issue.

---

## Shipped

- [x] Automated caniemail.com data sync (`bun run sync:caniemail`)
- [x] GitHub Actions integration: score-threshold CI via `@emailens/cli lint --fail-on-warning` + the [Emailens GitHub Action](https://github.com/marketplace/actions/emailens-email-preview-check)
- [x] AI-powered fix generation (`generateAiFix`, `AI_FIX_SYSTEM_PROMPT`)
- [x] Compile module (`@emailens/engine/compile`) for JSX, MJML, Maizzle

## Considering

### Outlook VML auto-generation

Auto-emit MSO conditional VML for `border-radius`, `box-shadow`, and gradient backgrounds when targeting `outlook-windows-legacy`. Today the engine flags these as warnings; the next step is generating the VML/MSO fallback inline.

**Why not now:** VML codegen is non-trivial and Outlook Classic usage is declining. Tracking in case it becomes load-bearing.

### Plugin system for custom analyzers

A public API for third-party analyzers to plug into `auditEmail()`. Would let teams add brand-specific checks (e.g., "all CTAs must use approved button styles") without forking.

**Why not now:** Designing a stable plugin API is a big commitment. Internal analyzers need to stabilize first.

### MJML / Maizzle source-level linting

Currently the engine compiles MJML/Maizzle to HTML, then lints the HTML. Warnings reference HTML positions, not source positions. Source-level linting would map warnings back to the original MJML/Maizzle file via source maps.

**Why not now:** Both MJML and Maizzle would need source-map output, which is upstream work.

### ESLint plugin (`@emailens/eslint-plugin-emailens`)

Write-time linting in editors via ESLint. Today `npx @emailens/cli lint` covers the same checks at build/CI time.

**Why not now:** Editor-time integration is valuable but requires a separate package and ESLint flat-config support work.

### Real-world spam corpus tuning

Spam scoring is currently rule-based (SpamAssassin/CAN-SPAM heuristics). Tuning thresholds against a labeled corpus of real promotional emails would improve accuracy.

**Why not now:** Needs a maintainer-led research effort and a legally-clean corpus.

### Dark mode rendering accuracy tests

Today's dark-mode simulator is a CSS transform. Validating its output against real client rendering (screenshots from Gmail/Outlook/Apple Mail dark mode) would catch divergence.

**Why not now:** Needs a methodology design, which clients, what threshold for "accurate," how to gather ground truth at scale.

---

## How to influence the roadmap

- **Found a specific bug?** Open an [issue](https://github.com/emailens/engine/issues/new) with a failing snippet. That's the highest-signal contribution.
- **Want a roadmap item to move up?** 👍 the corresponding section here, or comment with your use case in [Discussions](https://github.com/emailens/engine/discussions).
- **Want to implement one yourself?** Comment to claim it and we'll graduate it to a tracked issue with scoping help.
