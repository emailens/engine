# Changelog

## 0.11.7 - unreleased

### Fixed

- **Both spellings of a downlevel-revealed opener now resolve.** The block that hides markup *from* Outlook has two forms in the wild and no canonical one:

  ```
  <!--[if !mso]><!-->       the shorthand, `<!--` closed by a bare `>`
  <!--[if !mso]><!-- -->    an ordinary empty comment
  ```

  Only the first was matched. Outlook evaluates `[if !mso]` false and skips to `[endif]` whichever spelling closed the opener, so an email using the second kept its fallback in the Word-engine render: the preview drew the VML button *and* the HTML button written to replace it, stacked. A preview that invents a second call to action reports our failure as the email's, which is worse than reporting nothing.

  Found in our own landing-page demo, whose template uses the second form. Any email written that way has been getting a doubled CTA in the Outlook Classic preview since the renderer learned to resolve conditional comments in 0.11.2.

  Two further corrections in the same pass. The condition is now matched by *containing* a negated mso/vml term rather than starting with one, because `[if (!mso)&(!IE)]` is as common in real email as the bare `[if !mso]` and the paren defeated a pattern anchored on `!` directly after `[if`. And the downlevel-*hidden* pass now refuses any condition carrying a negation: without that, a revealed block whose opener we failed to match would be un-hidden by the second pass, turning a missed deletion into markup shown to the one client written never to see it. Failing towards "left the fallback in" is recoverable; failing towards "revealed the hidden branch" is not.


## 0.11.6 - 2026-08-29

> Published as a patch. The note here said it had to go out as 0.12.0, because
> `no-responsive-rules` changes answers on real email and flags 30 of our own
> 70 gallery templates. It shipped as 0.11.6 anyway, so consumers pinned to
> `^0.11` picked up a new rule without asking for it. Recorded rather than
> quietly corrected: the next rule that changes answers gets a minor.
>
> The renderer hold this block described is still open. 0.11.5 draws a nested
> `<v:roundrect>` that Outlook Classic does not render at all, photographed on
> 29 Aug. Two observations of that failure disagree on the inner shape's fate,
> so there is still not enough evidence to write the fix.

### Added

- **`ghost-table-unbalanced`: the Outlook wrapper that never closes.** Outlook ignores `max-width`, so a layout is constrained for it with a plain HTML table opened in one conditional block and closed in another, with the whole email between. Balanced across the pair, and invisible to a DOM parser, which sees only comment nodes. Lose the closing block in an edit and Outlook is left with a table that never ends, swallowing the rest of the message, while every other client renders normally, which is why it survives review.

  Counts balance across the conditional blocks rather than within one, since the halves are always separated. Reports only *unbalanced* wrappers, never the pattern itself, which is the recommended technique. Runs whether or not the email contains any VML: a ghost table is plain HTML, and gating it behind `hasVml` would miss every email that wraps without shapes.

  Silent across 76 real emails, and on MJML's own output, which emits ghost tables natively.

- **`no-responsive-rules`: the email has no instructions for a narrow screen.** Every other layout rule asks whether something is *wider* than the frame. This one asks whether there is a breakpoint at all, because a fixed-width design is not broken on any single client: it is broken across them, since each mobile client then invents its own behaviour.

  Found by photographing one of our own templates. Outlook Android stretched a fixed 600px table to fill the viewport while the hero image, correctly written as `width:100%; max-width:600px`, held at 600 and left grey gutters down both sides. Outlook Classic rendered the same file edge to edge. The image markup was textbook, every existing check passed the file clean, and the missing `@media` block was the fault.

  Fires only when a layout-bearing element carries a fixed pixel width (at least 320px, so spacers and narrow columns are ignored), it has no fluid escape, and the document contains no `@media` rule anywhere. Across our 70-template gallery it flags 30 and stays silent on the 4 that have no media queries but are fluid.

### Fixed

- **The Word engine is graded on the branch it reads.** 0.11.2 taught the renderer to resolve `<!--[if mso]>`; the analyzer kept reading the fallback, so the preview and the findings described two different emails. CSS inside a conditional `<style>` was invisible to every rule: the same declarations produced several findings in a plain `<style>` and none at all inside a conditional one, which meant the highest-leverage rules in a file were the only ones never checked.

  `analyzeEmail`, `auditEmail` and `createSession().analyze()` now share `analyzeAllBranches`, which runs the existing rules a second time over the resolved Outlook branch and takes only Word-engine findings from it. No other client can move, because no other client reads conditional comments. `analyzeEmailFromDom` stays DOM-only and is no longer the right entry point: a DOM is precisely the thing that has already discarded the comments.

  **Measured impact on real email is nil**, which is why this is a patch. Across 76 emails (the 70-template public gallery plus the engine fixtures), comparing 0.11.5 against this: zero Word-engine findings gained, zero lost, and no other client moved. Conditional blocks in practice hold DPI xml, VML and the mso font-width hack, none of which carry declarations the rules grade. Even the fixtures that do put CSS there put `font-family` there, whose only Word-engine finding is a `<style>` warning those files already have.

  So the release fixes a real structural inconsistency without changing any current answer. It matters for what it makes possible rather than what it moves today: an email that *does* put graded CSS behind `[if mso]` was previously ungraded for the one client that reads it, silently.

  Positions come from the first pass, which is the only one anchored to the source the caller holds. A finding unique to the branch carries no `loc` rather than a position into rewritten markup.


## 0.11.5 - 2026-08-28

### Added

- **End-to-end tests for the Outlook branch, after two releases shipped broken behind a green suite.** Neither 0.11.2 nor 0.11.3 was a missing unit test: both were tests that asserted on the function being changed rather than on the bytes a client finally receives. The new suite works only on the final `html` of the real pipeline, and runs every assertion against all three entry points (`transformForClient`, `transformForAllClients`, `createSession`) rather than a chosen one.

  The load-bearing test names no behaviour at all: it asserts the three entry points produce byte-identical output for all 21 clients, so any future change that wires one path and forgets another fails immediately. Verified by reintroducing each shipped bug: wiring only the singular function fails 14 tests, translating before the strip pass fails 5, keying the Word engine on the `outlook` substring fails 4, and inventing a height for a shape whose dimension never resolved fails 4.

  The real showcase pair ships as fixtures (`outlook-branch-broken.html`, `outlook-branch-clean.html`) so the assertions run on an email someone would actually send, not a fragment.

### Fixed

- **A pre-existing divergence is now pinned rather than silent.** `createSession('').transformForAllClients()` returns an empty array while the standalone function returns one empty result per client, so a caller iterating the session gets zero rows where the other gives 21. Not introduced here, and not changed here either, since callers may rely on it: it now has a test naming it as known behaviour.


## 0.11.4 - 2026-08-28

### Fixed

- **Translated shapes were square, because the strip pass ran after them.** VML was being translated into CSS before `applyTransform`, which then removed `border-radius` and `display:inline-flex` as properties the Word engine does not support. That is true of author CSS and precisely wrong for a translated shape: the CSS a `<v:roundrect>` becomes *is* the rounded corner Outlook draws. Every button in an Outlook preview came out square with its label unaligned. Translation now runs after the strip pass in both entry points, and a test asserts a 120% arcsize still yields the 25px pill it draws in Outlook Classic.


## 0.11.3 - 2026-08-28

### Fixed

- **The Outlook branch reached only one of the two transform entry points.** 0.11.2 wired `transformForClient`, but `transformForAllClients` does not route through it: it downlevels once and maps `applyTransform` over every client directly. That is the function the web app and the landing-page generator actually call, so the feature shipped inert in the product while its tests passed against the singular function. Both paths now take the Outlook branch, and the Outlook source is derived once per call and only when the email has conditional comments to resolve. Tests assert `transformForAllClients` and `createSession` alongside `transformForClient`, since testing the function that was changed rather than the path the caller uses is what hid this.


## 0.11.2 - 2026-08-28

### Changed

- **The Word-engine preview renders the branch Outlook actually sees.** Until now every preview of `outlook-windows-legacy` was built from the wrong half of the email: the `<!--[if mso]>` blocks stayed commented and the `<!--[if !mso]>` fallback stayed live, so the render showed precisely what Outlook does *not* draw and hid what it does. `transformForClient` now resolves the Outlook branch for that one client and translates its VML into CSS a browser can draw.

  Resolution and translation ship together because neither is useful alone: VML has been dead in browsers since IE9, so an activated `<v:rect>` parses as an `HTMLUnknownElement` with no box and no fill, and its contents would render as bare inline text. `renderOutlookBranch`, `resolveMsoBranch`, `vmlToCss` and `arcsizeToRadius` are exported for callers that want the pieces.

  The mapping covers `roundrect` and `rect` with solid, framed, tiled and gradient fills, which measurement across a reported production email and MJML's own output shows to be the whole surface in practice. `arcsize` uses the verified clamp, so 120% draws the same corner as 100%. A malformed dimension is deliberately left unset rather than guessed at, which means a shape whose `height:px` never resolved collapses in the preview the way it collapses in Outlook, instead of the preview quietly inventing a size the email never asked for.

  **Not emulated:** how Word *mis*-renders a nested shape. That failure is confirmed (the container disappears, and text stops drawing in every VML shape after it), but reproducing it means perturbing layout into a picture wrong in a third way, different from both the correct render and Outlook's. `checkVml` reports it with a line number instead.

  **Only `outlook-windows-legacy` changes.** Every other client, including Outlook Web, New Outlook and Outlook for Mac, still renders the fallback, because none of them read conditional comments.


## 0.11.1 - 2026-08-27

### Added

- **`checkVml(html)`: the branch of the email nothing else could see.** VML lives inside `<!--[if mso]>` conditional comments, so to every HTML parser it is a comment node and to a headless-Chromium screenshot it does not exist. An email could therefore lint clean, preview perfectly, and still be broken in the one client the VML was written for. The analyzer had a standing blind spot exactly where Outlook advice mattered most: it recommended VML for border-radius and background images without ever reading the VML already in front of it.

  Four rules, each grounded in a reported breakage rather than a style preference.

  `vml-nested-shape` is the one this was built for: a shape inside another shape's `<v:textbox>`, typically a `<v:roundrect>` button inside a `<v:rect>` hero. Outlook does not support nesting, and it does not fail loudly. The inner shape draws against the container's positioning frame instead of its own and lands detached from the content it belongs to, while every other client renders the HTML fallback correctly. `<v:group>` is exempt, being the one container VML defines for the purpose.

  `vml-invalid-dimension` catches a dimension whose number went missing (`height:px`, `width:`), which is what a template variable resolving to an empty string leaves behind. Outlook cannot size the shape, so a framed `<v:fill>` collapses and anything positioned against it moves.

  `vml-arcsize-range` flags an `arcsize` outside the documented 0%–100%, where the corner radius stops being a value you chose and becomes whatever the renderer clamps to.

  `vml-unbalanced-tag` catches a shape opened and never closed, or closed and never opened.

  `vml-unrendered-text` catches label text sitting loose inside a shape with no element around it. Outlook draws the fill and the geometry and none of the text, so the reader gets a blank coloured block where the button label should be; wrapping the same text in `<center>` or `<v:textbox>` renders it. Only flagged when the shape holds visible text and no element whatsoever, so the patterns people actually copy never trip it.

  All three rules are now verified against Outlook Classic (the Word engine) rather than inferred, and two of the messages were rewritten because the real behaviour is worse than the documented folklore. A nested shape does not merely misplace the inner shape. Three things happen, and the last was the surprise: the *containing* shape fails to render entirely; the table structure around it terminates early, so content after the shape falls out of the email frame; and every VML shape further down the email stops drawing its text, shipping buttons and headings as blank coloured blocks. That last one was confirmed with byte-identical probes placed either side of a single nested shape, the one before it rendering its labels and the one after it not. One bad shape near the top of an email degrades every shape below it. An invalid dimension does not collapse the shape: it draws at a size Outlook picks and silently clips the content inside, with no gap or broken image to notice. An out-of-range `arcsize` is clamped, so 120% draws the identical corner to 100%, which is why it stays a warning.

  Tags are read as a document-order sequence rather than a parsed fragment, because one shape routinely opens in one conditional block and closes in another with ordinary HTML in between: there is no single fragment to hand a parser, but the open/close sequence is what the structural rules need. `auditEmail` gains `vml`.

## 0.11.0 - 2026-08-26

### Added

- **`checkDesignConsistency(html)`: the small incoherences nothing else looks at.** A scorer answers "does this render", never "does this look like one person made it". Two rules, both countable rather than a matter of taste.

  `colour-drift` reports colours that are different values but the same colour to a reader. Distance is measured in OKLab, which is built so that Euclidean distance tracks perception, at a threshold of 0.02: under the point where a side-by-side pair becomes tellable apart. On real templates it finds the warm off-white pasted next to a slightly different warm off-white, and the near-black that picked up a hue cast on the way in. `#fff`, `#FFFFFF` and `white` are one colour and are never reported.

  `too-many-values` reports runaway cardinality in font sizes, typefaces and corner radii. Both normalisations matter more than the caps: a `border-radius` shorthand is a shape, so `12px 12px 0 0` and `0 0 12px 12px` are one 12px system, and fully round values (`50%`, pill buttons) are a deliberate shape rather than a fourth corner size; a font stack counts as its first family, so `'Inter', sans-serif` and `"Inter"` are one typeface. Without those, a consistent design reports as drift.

- **`checkDarkModeContrast(html)` and `checkMobileContrast(html)`: contrast in the two renders nobody looks at.** The desktop light palette is the one render a designer has already checked.

  There are two ways an email goes wrong in dark mode, and they need separate passes. `checkDarkModeContrast` grades the clients that force an inversion (Gmail Android's partial, Gmail iOS's full) and runs both, because they disagree: a `#f0ece4` heading sits just under Android's lightness threshold and is left alone while the surface behind it is repainted, landing at 1.3:1. `checkDarkStylesContrastFromDom` grades the email's *own* `@media (prefers-color-scheme: dark)` block as Apple Mail, Superhuman and Thunderbird would apply it; on a receipt fixture that block repaints the card to `#141519 !important` while ten text nodes carrying no class keep `#1a1714`, landing at 1.0:1. Invisible, and no light-mode check can see either one.

  `auditEmail` merges both into `darkContrast`, deduplicated per element.

  Mobile grades what a `max-width` block restyles, which the desktop palette never shows.

### Changed

- **Contrast is graded against the resolved cascade rather than inline styles.** The check previously read colours from inline styles and two ad-hoc lookups, so a stylesheet `color`, an `!important`, and a more specific selector were all invisible to it, and a `@media screen` background counted as absent.

  Declarations are now resolved the way a client resolves them: importance, then presentational-attribute rank, then inline, then specificity, then source order, with `@media` preludes evaluated against a render context so a `prefers-color-scheme` or `max-width` block applies only where it would. Selector lists split on top-level commas, so `:is(#hero, .card)` is one selector rather than two invalid ones that silently dropped the rule.

  **Warning counts move.** False positives disappear where a background was previously unreadable, and real findings appear where a stylesheet rule was previously unread, so regenerate anything cached or snapshotted.

- **Every diagnostic message is reworded.** 828 em dashes across messages, comments and docs are replaced by role: a colon where the tail names or elaborates, a semicolon where both sides are independent clauses, a comma where the tail is a participle or an elided subject, parentheses where the aside already held a comma. `auditEmail` gains `darkContrast`, `mobileContrast` and `design`.

  **Message strings move.** Warning counts and scores are unchanged by this part, but anything matching on message text needs regenerating.

## 0.10.4 - 2026-08-23

### Added

- **`featureUrl(code)` and `FEATURE_URLS`: caniemail's page for each feature.** 250 of the 255. VS Code renders a diagnostic's `codeDescription` as a link on the rule name, which is where every other linter sends people to read about a rule; ours had nowhere to point, so the code was a dead string.

  Generated rather than derived, because the URL cannot be computed from the key: `border-radius` is `/features/css-border-radius/`, `<abbr>` is `/features/html-abbr/`, `:hover` is `/features/css-pseudo-class-hover/`. Guessing means shipping 404s, and a link that goes nowhere is worse than no link. The five features with no caniemail entry of their own (`top`, `right`, `bottom` (documented under `css-position`), `color` and `font-family`) get nothing, and a test names them so the gap stays deliberate.

  `bun run sync:feature-urls` regenerates it, separately from `sync:caniemail`. That one rewrites the support matrix and moves reported output; a link map should not need a release that does.

## 0.10.3 - 2026-08-23

### Changed

- **An inline-style finding anchors on the declaration, not the whole attribute** ([#16](https://github.com/emailens/engine/issues/16)). `style="margin:0;padding:0;font-size:1rem;color:#333"` underlined end to end says "something in here"; the engine knows it means `font-size:1rem`, and now says so. Every occurrence in `locs` narrows the same way, so an editor underlines the declaration and a fix can be applied to it.

  Finding it needs the raw source, since the DOM keeps the decoded attribute value and an index into that is not an index into the file, so this arrives with `positions: true` and nothing changes without it. A declaration is matched at the head of its own declaration, never inside a value: `background: url(font-size.png)` is a `background`, not a `font-size`. Semicolons inside parentheses do not split it. Where the declaration cannot be found exactly (an entity in the attribute, so the decoded property name is not in the source at that place) it falls back to the whole attribute rather than inventing an offset that would look right.

  **`dark-mode-coverage` moves with it.** It names one colour ("keeps its hardcoded light background (#faf8f5)"), so it points at the declaration that set it rather than at the five others sharing the attribute.

  **A property declared twice is two places.** `style="display:block;display:flex"` is the progressive-enhancement idiom, and the value at each place decides which clients it is about: Gmail, which drops `flex` and renders `block`, is pointed at `display:flex` alone, while Outlook, which supports only `display:none`, gets both.

  Positions move, so anything asserting on them needs regenerating. Warning counts, messages and scores are unchanged.

## 0.10.2 - 2026-08-23

### Added

- **Source positions on every issue (`loc`).** Pass `positions: true` to `auditEmail()`, `createSession()`, or any of the standalone analyzers and each finding that belongs to a specific node carries a `SourceLocation`: 1-based `line`/`column`, `endLine`/`endColumn`, plus a 0-based `offset` and `length` for consumers that prefer offsets. A CSS declaration in a `<style>` block resolves to the declaration itself, an inline style to its `style="…"` attribute, link/image/accessibility findings to the attribute or opening tag they are about, and a template variable to the variable in the text. Document-level findings (Gmail clipping, aggregate counts) leave `loc` undefined. This is what lets `@emailens/cli` print `file:line:col`, the GitHub Action post inline annotations, and an editor draw squiggles. Additive and opt-in; the cost grows with document size: about +6–14% on a full audit at typical email size, +30% at Gmail's ~102KB clip limit (`bun run bench:positions`, which now includes scaled-up inputs).

- **Positions on the layout and visual analyzers.** Content overflow, visual bugs, dark-mode coverage and at-rule warnings each describe a specific element or declaration, and each now carries one: a fixed width points at the `width` attribute or the `style` that set it, a gradient with no fallback at the declaration that caused it, an unbreakable string at the string, `@media`/`@font-face` at the rule, and a light background the dark block misses at the `bgcolor` keeping it light. These carry a concrete `fix`, so they are the findings an editor is most likely to offer to apply.

- **`CSSWarning.locs`: every place a property breaks, not just the first.** One warning covers a property, and one property can break in a dozen elements; `loc` is the first occurrence and `locs` lists them all in document order, so an editor can flag each one and a fix can be applied everywhere. Capped at 100 occurrences with `locsTruncated: true` when the list is partial, rather than silently dropping the rest. Purely additive; warning counts and compatibility scores are unchanged, which is asserted by test.

- **`caveatApplies()`, `VALUE_CAVEAT_PROPS` and `CSS_SUPPORT_NOTES` are exported.** The gate the analyzer uses to decide whether a client's partial-support caveat is about the value in front of it. A consumer that renders the support table (an editor hover, a docs page) needs the same answer the analyzer gives, or it will tell a reader a property is partial in seven clients on a line the linter deliberately left alone.

### Changed

- **Value-aware partial support for eight more properties, cutting partial-support info findings by 61%.** 0.10.0 made `margin`, `position` and `overflow` fire only on the values that actually break; every other "partial" property still warned on every use. But almost every partial rating in caniemail is value-level: `font-size` is partial in Outlook Classic because `rem` is dropped, not because `14px` is; `background` because Outlook keeps only the colour; `font-weight` because Outlook snaps numbers to normal or bold. The result was 982 info findings across this repo's three fixtures, 62% of everything the analyzer said, and `font-size: 14px`, `display: block`, `background: #ffffff` and `text-align: center` were among the loudest. `background`, `border-radius`, `display`, `font-size`, `font-weight`, `letter-spacing`, `text-align` and `transition` are now gated the same way, each against its own per-client caniemail note. So `font-size: 1rem` still reports in the seven clients whose note names `rem` or relative sizes, while `font-size: 90%` reports only in the two whose note names percentages; `font-weight: 700` is silent in Outlook and `font-weight: 350` is not; `border-radius` no longer reports *partial* support for anything but the elliptical `/` shorthand, though the clients that drop it outright still warn on every value; and `transition` counts an omitted property name as `all`, because that is what CSS says it means. Notes that are not about the value at all (Samsung's "not supported with Outlook accounts", Hey's forced `transition-duration: 0`) still report on every use, and a note the parser cannot read reports rather than staying quiet. The exception is a value that means the property is not in play: `position: static` positions nothing and `overflow: hidden` scrolls nothing, so no reading of any note reaches them. Across the fixtures info drops 982 → 387. **Warning counts and messages change**: the "partial support in …" half of a merged finding disappears wherever the value is fine, so regenerate any cached or snapshotted analyzer output downstream. Errors (14) and warnings (587) are unchanged, and so are compatibility scores, which never counted partial support; `ClientScore.info` does move.

- **A finding points at the declarations that caused it.** One warning covers a property across a whole stylesheet, and it used to carry every location that property appeared at. Now that a caveat can be about one value and not another, that meant underlining `font-size: 14px` under the message "`rem` values are not supported": a worse position than none. Locations are filtered per client to the declarations that triggered that client's caveat.

- **Each declaration is judged on its own value.** The `<style>`-block path joined every value a property was given into one string before gating, so a sheet setting `position: relative` in one rule and `position: fixed` in another was gated on `relative` alone and Yahoo's caveat was lost. Inline styles read only the first of a repeated declaration, so `style="display:block;display:flex"`, the progressive-enhancement idiom, was judged on the value the client discards. Both paths now see every value, and the caveat applies if any of them triggers it.

- **Positions resolve against the original source, so character references and mixed line endings no longer shift them.** parse5 hands analyzers decoded text: `&amp;` collapsed to `&`, CRLF to LF, so an index into that text is not an index into the file. Previously a template variable in a text node containing `&nbsp;` anchored to the start of the node (an editor would have underlined the wrong words), and a `<style>` block mixing CRLF and LF produced a zero-length position at the block start. Both are now exact. The only remaining fallback is a token that was itself encoded (`{{a&amp;b}}`).

- **The template-variable scan no longer clones the DOM.** It walked `$.root().clone()` and recursed once per level, so a deeply nested email (tables inside tables) could exhaust the stack before the checker ran; it now walks text nodes iteratively and reuses that walk for both the per-node and whole-document passes. Same findings, no second copy of the DOM.

- **`CSSWarning.line` is deprecated in favour of `loc`.** Its meaning is unchanged without `positions` (the line within the `<style>` block, absent for inline styles); with `positions: true` it reports the document line, i.e. `loc.line`.

### Fixed

- **`display: None` was invisible to every check.** Outlook's caveats for `display:none` (it does not inherit into nested tables, and does not work on an `<img>`) hang off a compound `display:none` feature key that was matched case-sensitively, so any spelling but lowercase reached neither it nor the property-level check. Present since 0.10.0.

- **The `@maizzle/framework` peer range admitted a major that does not work.** Maizzle 6 moved to Vue single-file components: `render()` now takes an SFC source or a file path, where `compileMaizzle()` passes template text. A consumer on `>=5.0.0` could install 6.x, satisfy the peer, and get `Failed to load url` at runtime, including on the two tests that assert `{{ process.env.SECRET }}` cannot leak, which fail because nothing compiles rather than because anything leaked. The range is now `>=5.0.0 <6.0.0`; supporting 6 is its own change.

- **The compilers were only ever tested one major behind.** `mjml` was pinned to 4.x in devDependencies while 5.4 is current, `@react-email/render` to 1.x against 2.1, and `@react-email/components` to 0.0.x against 1.0. All three work on the current major, verified by running the compile suites against them, but nothing was checking. They are now the versions CI exercises, and `@types/mjml` moves to 5 with them: mjml ships no types of its own, so it was the only thing describing `await import("mjml")`, and it was describing the wrong major.

## 0.10.1 - 2026-07-30

### Added

- **Dark-mode opt-in and coverage checks.** Two new analyzer warnings, both gated on the email actually shipping a `@media (prefers-color-scheme: dark)` block: emails with no dark styling are unaffected. `dark-mode-opt-in` fires when dark styles exist but neither `<meta name="color-scheme">` nor `<meta name="supported-color-schemes">` does, so Apple Mail and the other `prefers-color-scheme` clients may never enter dark mode and the media query silently never fires. `dark-mode-coverage` catches the **half-inverted render**: an element carrying a hardcoded light background (a `bgcolor` attribute or an inline `background`/`background-color`) that the dark block never overrides, so it stays white while the rest of the email inverts; the defect that leaves light text on a still-white card. Cascade-aware: an inline background needs an `!important` dark rule to be considered covered, a `bgcolor` attribute loses to any dark rule. Surfaced through `analyzeEmail()` and `auditEmail()` like every other compatibility warning; capped at 3 elements so a large email can't flood the report.

## 0.10.0 - 2026-07-29

### Added

- **Visual-bug detection with fixes (`checkVisual()`, and a `visual` section in `auditEmail()`).** Catches probable rendering bugs in stylized emails: a graceful-degradation class distinct from per-property support: background images/gradients with no solid `background-color` (they render as a blank area, and can hide overlaid text, in Outlook), and `font-family` stacks with no web-safe fallback (Gmail/Outlook fall back to Times New Roman). Each issue carries a concrete `fix`: for gradients the fallback color is computed from the first stop; for fonts a web-safe family is appended. Available standalone, via `EmailSession.checkVisual()`, and in the audit; skippable with `skip: ["visual"]`.

- **Content-overflow detection (`checkOverflow()`, and an `overflow` section in `auditEmail()`).** A client-agnostic layout check that flags content likely to force horizontal scrolling: fixed pixel widths wider than the email frame (with no `width:100%`/`max-width:100%` escape), and long unbreakable strings (raw URLs, tokens) that can't wrap. Available standalone, via `EmailSession.checkOverflow()`, and in the unified audit; skippable with `skip: ["overflow"]`.

- **`CSS_SUPPORT_NOTES`: the per-client caveat behind every partial/buggy/unsupported rating**, captured from caniemail (e.g. `margin` → "Negative values are not supported"; `position` → "Supports `sticky` but not `relative`, `absolute` and `fixed`"). Previously the sync discarded these. Warnings now cite the specific caveat instead of a generic "partial support" message.

- **Six new email clients: `outlook-macos` (Outlook for Mac), `yahoo-mail-android`, `yahoo-mail-ios`, `protonmail` (Proton Mail), `aol` (AOL Mail), and `fastmail`.** All are backed by verified caniemail.com data (242–306 features known each) and are first-class across the analyzer and `transformForClient()`/`transformForAllClients()`. Outlook for Mac uses the WebKit web-rendering engine (mirrors `outlook-web`, not the Word engine) and the Yahoo mobile apps mirror `yahoo-mail`; the three webmail additions get per-client transform behaviour derived directly from their caniemail data (e.g. Proton Mail strips `animation`, external stylesheets, and forms; AOL additionally drops `box-shadow`/`opacity`/`transform`). The support matrix now covers **21 clients**.

### Changed

- **`generateFixPrompt()` / `generateAiFix()` now fold in content-overflow and visual-bug findings.** New optional `overflow` and `visual` options (arrays from `checkOverflow()` / `checkVisual()`) render a "Layout & Visual Issues" section in the fix prompt, each with its concrete fix (computed gradient fallback, appended web-safe font, width constraint). This lets the AI fixer/builder repair these rendering bugs on an existing email, not just per-property CSS-compatibility warnings.

- **Refreshed the caniemail.com support data (synced 2026-07-20, up from 2026-02-16).** The matrix grows from 251 to **255 features**: adds `font-size-adjust`, `inert`, `:focus-visible`, and `:focus-within`, and updates 9 support cells; most notably `display: grid` is now recognised as supported in Gmail web, Outlook iOS/Android, and Yahoo Mail.

- **Partial-support warnings for `margin`, `position`, and `overflow` are now value-aware and per-client**: a precision fix. Previously every use of these near-universal properties produced an info warning across every partial client (e.g. `margin: 16px` warned in 12 clients). Now the warning fires only when the *value* actually hits that client's caveat: `margin` on negative/`auto` values (and `auto` only where the client's note flags it), `position` on the specific keyword each client doesn't support (Outlook drops `relative`/`absolute` but renders `sticky`; Yahoo supports only `relative`), and `overflow` only on scrollable values for the mobile clients with the "can't scroll to hidden content" bug (`overflow: hidden` no longer warns). This substantially cuts false-positive info warnings and makes the survivors specific. Warning *counts and messages change*: regenerate any cached/snapshotted analyzer output downstream.

## 0.9.6

### Added

- **`Severity` and `BaseIssue` exported types.** `Severity` is the shared `"error" | "warning" | "info"` union used across every report; `BaseIssue` is the `{ rule; severity; message }` shape that the analyzer issue types (`SpamIssue`, `LinkIssue`, `AccessibilityIssue`, …) now extend. Both are additive; the existing issue types keep the exact same structure.

### Changed

- **Internal cleanup, no behavior change.** The seven HTML analyzers now share one `fromHtml()` entry guard (empty-input + size-cap + parse) instead of repeating it; `auditEmail()` and `EmailSession.audit()` share a single `runAudit()` / `EMPTY_AUDIT` instead of duplicating the check list; removed unused type stubs, an unused `CSSRule` interface, and an unused `compile()` parameter. Public API and output are unchanged (all tests green).

## 0.9.5

### Added

- **`generateFixPrompt()`**: builds a paste-ready, provider-agnostic LLM prompt from the engine's analysis (original HTML, per-client warnings, and compatibility scores). Scope it to `all` clients or a single `selectedClientId`, pass the source `format` (`html`/`jsx`/`mjml`/`maizzle`) for framework-aware guidance, and an optional `intent` to steer the fix (e.g. "keep the gradient header"). Complements `generateAiFix()`, which sends a prompt to an actual provider callback.

## 0.9.4

### Fixed

- **`analyzeSpam()` physical-address detection is no longer US-only.** The street-address pattern recognised only US suffixes (`St`, `Ave`, `Blvd`…), so a valid European address in the footer (`12 chemin du Beauregard, 93370 Montfermeil`) was reported as `missing-physical-address` (a CAN-SPAM warning), flagging legitimate mail from any non-US sender. Detection now covers the common street-word orders: Anglo type-last (incl. UK lettered house numbers like `221B`), French/Italian number→type, Spanish/Portuguese type→name→number, and German/Dutch/Nordic name+type→number, plus UK and Dutch postal-code formats. Bare-name streets with no type word (e.g. Dutch `Damrak 12`) are, as before, recognised via the semantic `<address>` element: the reliable signal that no content regex can replace.

## 0.9.3

### Fixed

- **`analyzeSpam()` no longer flags React Email preheaders as hidden text.** `isLikelyPreheader()` bailed out at `text.length > 200`, but React Email's `<Preview>` pads the preheader with hundreds of zero-width characters (U+200B–U+200F) so body copy does not leak into the inbox snippet. Those characters are invisible, yet they counted toward the ceiling, so the guard never fired and the standard preheader of every React Email was reported as `[error] hidden-text: Hidden text detected — major spam filter red flag` (-20 points). Visible length is now measured with the zero-width padding stripped. The 200-character ceiling is unchanged, because it is what stops keyword stuffing behind preheader-shaped CSS: long *visible* hidden text is still flagged.

## 0.9.2

### Documentation

- New **[ROADMAP.md](./ROADMAP.md)**: separates "shipped" / "considering" items from the issue tracker so the latter can host actual user bug reports.
- README: added Outlook iOS and Outlook Android to the supported-clients table (was missing despite being shipped in 0.9.0); refreshed the test count badge; added a new "vs other email libraries" comparison covering `juice`, `email-comb`, `mjml`, and `maizzle` with explicit "complementary, not competitor" framing; replaced the inline roadmap with a link to ROADMAP.md.

## 0.9.1

### Fixed

- **`toPlainText()` rewrite**: Rewrote HTML-to-plain-text conversion to walk the DOM tree node-by-node instead of using cheerio's `.text()`. Email HTML with deeply nested tables (10+ levels) no longer produces excessive whitespace. Block elements emit clean line breaks, inline siblings get proper spacing (e.g. `<span>15</span><span>Clients</span>` → `"15 Clients"`), and the output collapses to readable paragraphs.

## 0.9.0

### Added

- **Outlook iOS and Outlook Android** email clients: full CSS support matrix data (synced from caniemail.com), per-client transforms, and dark mode simulation with partial color inversion.
- **Outlook Windows Mail → Outlook Classic consolidation**: `outlook-windows-legacy` now maps the former Windows Mail client with `engine: "Microsoft Word"` and `deprecated: "2026-10"`.
- Dark mode simulation now gives **mobile-specific guidance** for Outlook iOS/Android instead of incorrectly suggesting `[data-ogsc]`/`[data-ogsb]` attribute overrides (which are Outlook.com web-only).
- New tests for `outlook-ios` and `outlook-android` covering transforms and dark mode behavior.

### Fixed

- Battle test matrix integrity check now validates all 15 client IDs (was 13, missing `outlook-ios` and `outlook-android`).
- API docs dark mode section corrected: Gmail iOS uses full inversion (not partial), Gmail Web and Yahoo Mail do not invert content, Apple Mail respects `prefers-color-scheme`.
- `transformForAllClients()` performance note corrected from 12 to 15 parses.

## 0.2.0

### Added

- **AI-powered fix generation**: `generateAiFix()` builds a structured prompt from the engine's analysis, sends it to any LLM via a provider callback, and extracts the fixed code. The engine stays provider-agnostic.
- **Token estimation**: `estimateAiFixTokens()` pre-flight estimates input/output tokens, with optional precise counter callback. Includes system prompt overhead (default 250 tokens for `AI_FIX_SYSTEM_PROMPT`).
- **Smart truncation**: When prompts exceed `maxInputTokens`, warnings are intelligently trimmed: dedup → remove info → remove CSS-only → trim snippets. Structural and error warnings are preserved.
- **`heuristicTokenCount()`**: Instant synchronous token estimate (~3.5 chars/token, within ~10-15% of real Claude tokenizer for HTML/CSS).
- **`AI_FIX_SYSTEM_PROMPT`**: Expert system prompt for email compatibility fixes, with structural fix patterns (table layouts, VML, MSO conditionals).
- **Fix type classification**: Every `CSSWarning` now includes `fixType: "css" | "structural"`. Structural warnings require HTML restructuring; CSS-only warnings can be fixed with property swaps.
- **`STRUCTURAL_FIX_PROPERTIES`**: Exported `Set<string>` of properties requiring HTML changes (flex, grid, word-break, overflow-wrap, position, border-radius, background-image, `<svg>`, `<form>`, `<video>`, etc.).
- **15 new CSS properties** in the support matrix: `word-break`, `overflow-wrap`, `white-space`, `text-overflow`, `vertical-align`, `border-spacing`, `min-width`, `min-height`, `max-height`, `text-shadow`, `background-size`, `background-position`.
- **Fix snippets** for new properties: `word-break` (html, jsx, mjml), `overflow-wrap` (html, jsx), `text-shadow`, `border-spacing`, `min-width`, `min-height`, `max-height`.
- **Client prefix support** for Yahoo Mail and Samsung Mail in fix snippet resolution.
- **71 new tests** covering fixType classification, new CSS properties, STRUCTURAL_FIX_PROPERTIES, fix snippets, token estimation, smart truncation, generateAiFix (with mock providers), and extractCode edge cases.

### Fixed

- Element-level warnings (`<style>`, `<link>`, `<svg>`, `<video>`, `<form>`, `@font-face`, `@media`) now include `fixType`, previously undefined.
- Warnings from `<style>` block CSS parsing (section 9 in analyzer) now include `fixType`.
- `extractCode()` now picks the largest code fence when multiple exist, instead of the first.
- Token estimates now account for system prompt overhead (250 tokens by default), configurable via `systemPromptTokens` option.
- Smart truncation output is now propagated to `generateAiFix()` prompt; previously the truncated list was discarded and the full warning set was used.

## 0.1.0

Initial release: CSS analysis, per-client transformation, compatibility scoring, dark mode simulation, framework-aware fix snippets, diff comparison, and fix prompt generation for 13 email clients.
