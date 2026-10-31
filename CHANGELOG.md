# Changelog

## 0.18.6 - 2026-10-31

### Fixed

Outlook Classic is now modelled on today's build, not the Outlook 2007-2016
the earlier probe sheets ran on. Each change was measured on Preflight's
Outlook Classic (2026-10-31) after the held-out agreement run found it.

- `display:none` hides a div, a span and a table, inline or by class. A
  preheader hidden with a bare `<div style="display:none">` no longer shows
  above the email.
- `[if true]` and `[if !true]` conditionals (Marketo) are read like
  `[if mso]`, so its ghost-table columns sit side by side.
- A decimal `width` attribute (`width="193.5"`, Iterable) sizes the image
  instead of being dropped for its natural size.
- A three-digit `bgcolor` (`#888`) paints nothing, as in Word.

## 0.18.5 - 2026-10-31

### Fixed

- Outlook Classic: a downlevel-revealed block written as
  `<!--[if !((mso)|(IE))]><!-- -->` (HubSpot's spelling of "not Outlook") is
  now removed from the Word render, as `[if !mso]` already was. The
  parentheses before `mso` hid it from the revealed-block pattern, so the
  branch meant for every other client stayed in the Outlook preview. Found
  by the held-out agreement run (2026-10-31).

## 0.18.4 - 2026-10-30

### Fixed

- Gmail Android dark mode is modelled from the real app instead of a generic
  partial invert. On a real Gmail Android capture the old model agreed with
  the phone on 4 of 12 text-on-background swatches and 6 of 12 held-out ones;
  the new one agrees on 12 and 10. It no longer turns white button text dark
  or leaves grey footer text on dark grey, which raised dark-mode contrast
  errors on ordinary emails. It does catch what real Gmail Android breaks:
  dark text on a light-coloured button turns white (2.1:1 on amber). Known
  misses: a light grey darkens further than modelled, and one green text
  darkens. One phone, one app version; Gmail iOS is not measured yet.

- A Gmail wrapper rule meant for Gmail's own auto-links, such as
  `u + #body a { color: inherit !important }`, also matches the email's
  buttons and beats their inline colour and size. On real Gmail web it
  collapsed the main button in 11 of 20 emails of an agent benchmark. New
  style-survival rule `gmail-wrapper-overrides-inline`: an error when the
  rule's `!important` declarations override a button's inline values, a
  warning for plain links; rules under `prefers-color-scheme` are skipped,
  since Gmail never applies them. Checked against human grades of 239 real
  Gmail captures: errors on all 11 broken emails, none on one that holds.
- The Gmail wrapper selector matches any id or class on `<body>`, not only
  `.body`, and `.menu + .x` is no longer read as `u + .x`.
- The Gmail preview builds the wrapper the way Gmail does, inside `<body>`,
  so `u + #body` rules apply there. The `<u>` used to sit before `<body>`,
  where a browser moves it back in, and only for a `.body` class.

## 0.18.3 - 2026-10-30

### Fixed

- Yahoo Mail web removes a form's `action`, and `formaction` on a button, so
  the form cannot submit to your server; it also drops `type="email"` from
  inputs and adds `target="_blank"`. Observed on a real Yahoo inbox
  (2026-10-29). `<form>` is now unsupported in Yahoo Mail with an error
  warning that says to link to a landing page, and the Yahoo preview strips
  the same attributes. `method`, text, radio and submit inputs are kept.
- The main entry is tested to bundle for the browser with no Node built-ins;
  the README names the Node-only subpaths.

## 0.18.2 - 2026-10-29

### Fixed

- Outlook Classic (Word): 0.18.0 hung a nested table's painted first cell
  padding out to the left on every nested table, so a centred email whose
  first row is a padded, coloured header slid left by that padding. Only a
  shrink-wrapped table hangs now; a table with a width or `align="center"`
  stays where its width puts it.

## 0.18.1 - 2026-10-29

### Fixed

- The Outlook for Mac grid observations named a third-party capture service
  in their source label. The label now names only the client. No support level
  or note text changed.

## 0.18.0 - 2026-10-29

From a person-graded comparison of 9 real emails on 7 real clients, and a
probe on real Yahoo web. Some scores change where these apply.

### Added

- **Yahoo web and AOL drop a whole `<style>` block when one of its `@media`
  queries is a comma-separated list** (`screen and (max-device-width:600px),
  screen and (max-width:600px)`). A probe on real Yahoo web lost the block for
  that query and for two plain max-width conditions, and kept a single
  condition, `max-device-width` included. The preview drops the block and a
  warning says to split the query. john-lewis's whole stylesheet went this way.
- **Yahoo web ignores `background-size`**, alone and as the `/ size` part of a
  `background` shorthand, and draws the image at its own size. Warned.

### Fixed

- **VML `arcsize` is a fraction of the shorter side**, as real Outlook Classic
  draws it (a 48px button at 21% has a 10px corner), not of half of it. Rounded
  VML buttons were drawn with half their radius.
- **Outlook Classic: a web font without `mso-font-alt` falls to the next font
  in the stack**, as current Outlook (Microsoft 365, 2019) does. `'Roboto',
  Arial` draws in Arial, no longer Times New Roman; a stack with nothing after
  the web font still draws Times.
- **Outlook Classic: a nested table hangs its first painted cell's left
  padding to the left**, lining the cell's text up with the text around it.

## 0.17.2 - 2026-10-28

### Fixed

- **One warning per finding, not per element.** The same client, property,
  severity, sentence and advice on a `<p>` and an `<h1>` is now one warning,
  with `selectors` naming every element and `locs` keeping every place. A
  real react-email email (#2043) went from 42 Outlook Classic lines to 26, a
  maizzle build from 464 warnings to 206. Scores do not change (none of 273
  client scores on 13 real emails moved). A sentence that names its element,
  and a `<style>` finding next to an inline one, stay separate.

## 0.17.1 - 2026-10-28

### Fixed

- The `dark-mode-inversion` message opens with the client's name, Gmail iOS,
  like every other warning, so tools that merge warnings across clients strip
  it cleanly.

## 0.17.0 - 2026-10-28

Four gaps found by grading real breaks people reported in react-email, mjml
and maizzle threads. New warnings can lower some scores.

### Fixed

- **A plain `display:none` preheader was a spam error.** It cost 28 points of
  the spam score. Hidden text that opens the email is now treated as the
  preheader it is; hidden text further down is still flagged.

### Added

- **Gmail on iPhone inverting dark backgrounds.** It inverts every colour in
  dark mode and ignores `prefers-color-scheme`, so a dark design comes out
  light (mjml #2513). One `dark-mode-inversion` warning lists every dark
  background, with or without dark CSS in the email.
- **CSS nesting.** A rule or `@media` inside another rule, as Tailwind v4
  writes, now grades as `nesting`, which almost no client reads.
- **rem units.** A rem value now grades as `unit-rem`: Outlook Classic, Yahoo
  and AOL ignore it, which is how react-email #2043 got the wrong text sizes.

## 0.16.12 - 2026-10-28

Yahoo Mail web's lost fonts are now caught.

### Fixed

- **An inline `font-family` naming a quoted font is dropped by Yahoo Mail
  web**, and nothing said so. A real Yahoo inbox showed
  `font-family:'Courier New',Courier,monospace` in Yahoo's own font, while
  the same stack unquoted, or in a `<style>` class, held; Gmail kept every
  form. Code blocks lost their monospace, and serif headings went sans.
  `analyzeEmail` now warns for `yahoo-mail` with the fix (write the names
  unquoted, or move the stack into `<style>`), and the Yahoo web preview
  drops the declaration as Yahoo does. The Yahoo apps are unobserved.

## 0.16.11 - 2026-10-28

Gmail web's preview loses flex item sizing too, as the real app does.

### Fixed

- **Gmail web kept `flex` and `flex-basis` in its preview.** The flex-columns
  probe from 0.16.10, run in a real Gmail web inbox, lost its 34% label column
  the same way Yahoo did, while `width:34%` and a table held. The Gmail web
  preview now strips both and the support notes cite the capture. Gmail's
  apps are unobserved and unchanged.

## 0.16.10 - 2026-10-27

Yahoo Mail web's preview loses flex item sizing, as the real app does.

### Fixed

- **`flex` and `flex-basis` had no support data**, so every client was
  simulated as keeping them. A real Yahoo Mail web capture collapsed a
  `flex:0 0 34%` label column to a letter wide: Yahoo drops the `flex`
  shorthand and `flex-basis` and keeps `display:flex` and `width`. Both
  properties now start from `flex-wrap`'s row (Gmail, Yahoo and AOL
  unsupported) with the observation on top, and Yahoo web's preview strips
  them. Size flex items with `width` and `flex-shrink:0`, or use a table.

## 0.16.9 - 2026-10-27

Outlook for Mac is the current app again, not the 2016 one. Scores for Outlook
for Mac go down for emails that use the CSS below, and its preview now loses
what the real app loses.

### Fixed

- **The caniemail sync read the oldest version for some clients.** It sorted
  caniemail's version labels as numbers, and the labels mix years with app
  builds, so Outlook for Mac's "16.80" (the new app) sorted before "2016" and
  the 2016 results won: 75 features read supported that the current app does
  not support. JavaScript also moves whole-number labels ahead of the rest, so
  the sync now reads versions in the order caniemail writes them. Outlook for
  Android's `text-align: match-parent` changes the same way.
- **Outlook for Mac's preview drops what the real app drops**: `:nth-child`,
  `:nth-last-child`, `:not()`, `:has()`, `[data-*]` selectors, `::before` and
  `::after` rules, `@supports`, a media query with only a type (`@media
  screen`, `@media all`), gradients, `var()`, `calc()`, `min()`, `max()`,
  `minmax()`, `clamp()`, `transform` and inline SVG, in `<style>` blocks and
  inline alike. An ignored declaration leaves the one before it in place, as
  the app does. Measured on a real install with Emailens probe sheets
  20-features and 21-feature-follow-ups: the simulation matches the real app
  on all 58 cases (20 of 38 before).
- A client with drops gets them applied to the author's CSS before the
  downlevel pass, which had resolved `var()` and converted `hsl()` that the
  real app never sees.
- Probe sheet 22 (34 more cases) found the rest of what the new Outlook for
  Mac drops, each matching caniemail 16.80: text-shadow, filter, clip-path,
  animation and `@keyframes`, `:nth-of-type`, CSS nesting, logical properties
  and sizes, conic gradients, `repeat()`, `hsl()` and the modern colour
  functions, `<picture>` sources and `srcset`; `position` except `sticky`;
  `gap` except `column-gap`; and pseudo-classes such as `:link` and
  `:first-child` unless written on a bare type selector. Over 92 cases, in
  light and in dark, and over two runs, the simulation matches the real app
  on every case, as it does for Apple Mail.
- `grid-template-columns` in Outlook for Mac is partial, not unsupported:
  plain track sizes work, `repeat()` and `minmax()` are dropped (observed
  override, 2026-10-27).
- SVG and WebP images are no longer reported for Outlook for Mac, which shows
  both since 16.80.

## 0.16.8 - 2026-10-25

Gmail on the web follows caniemail again, and Outlook Classic stops warning
about width fallbacks a template already has. Scores for Gmail web can go down
for emails that use the CSS below; Outlook Classic scores can go up.

### Fixed

- **Gmail web strips box-shadow, text-shadow, visibility, align-items, gap,
  grid and animation again**, and removes `@keyframes` from `<style>` blocks.
  The 0.14.8 overrides came from one provider's Gmail render, which skips
  Gmail's sanitiser: caniemail's own tests, sent to two Google accounts, lost
  this CSS in real Gmail web in Chrome and in Firefox. The overrides are gone
  and the support table shows caniemail's cells. The inline linear-gradient
  observation, from a separate real Gmail inbox, stays.
- **`:hover` and `transition` are info, not warnings.** A client without them
  draws the email as written and only loses the hover or the easing, the same
  reasoning as `@media`. Scores go up for emails that use them.
- **Outlook Classic reads the width another way.** `max-width` is covered by an
  image's `width` attribute, by a ghost cell of the same width around the box,
  or by a ghost table of the same width as its first child; `min-width` is now
  checked, and covered by a cell or table at least that wide. Over 63 popular
  open-source templates the Outlook Classic mean goes 75.2 to 77.6.

## 0.16.7 - 2026-10-23

The Outlook Classic preview, corrected against real Outlook 2016 and 2019
screenshots of two React Email templates and an AI Fix. Scores do not change.

### Fixed

- **Padding and margin in `rem` are dropped.** Word does not read the unit:
  every gap Tailwind wrote in rem was gone on real Outlook, while px stayed.
- **A face's `mso-font-alt` is the font drawn.** `Geist, Inter, Arial` with
  React Email's `@font-face { mso-font-alt: 'Arial' }` came out in Arial, not
  Times New Roman. A face with no alt still draws Times.
- **A font stack with `system-ui` is dropped whole**, so the text is in
  Word's default, Times New Roman.
- **Word ignores the `*` selector.** Text that only `* { font-family }`
  styles is in Times New Roman.
- **A table cell starts left-aligned.** An outer cell's centring does not
  reach into a nested table; the cell's own `align` or `text-align`, or its
  own row or table's alignment, still does.
- **`width: fit-content` (and `max-content`, `min-content`) is not read**:
  the `width` attribute sizes the box, so React Email's social row spreads
  across the column as it does in Outlook.

## 0.16.6 - 2026-10-23

A false positive removed. Scores change only upward, and only for emails that
already repeat their body background.

### Fixed

- **A body background repeated with `!important`, or by its own rule, is no
  longer reported lost.** `body-background` fired in 15 clients when a
  `<style>` rule for `body` carried `!important` (the comparison kept it, so
  `#f4f4f4 !important` never equalled a wrapper's `#f4f4f4`), or when the same
  rule also painted the full-width wrapper, as the Outlook.com dark-mode
  pattern `[data-ogsc] body, [data-ogsc] .wrapper { … }` does. Found in the
  coding-agent benchmark: Gemini 3.8 had already added the wrapper and audited
  each email about six more times on the warning; with the fix four of its
  five emails are clean.

## 0.16.5 - 2026-10-23

A fix to the Outlook Classic preview. Scores do not change.

### Fixed

- **Text a winning font rule sets is no longer drawn in Times New Roman.**
  A stylesheet rule naming an `@font-face` family sends Word to Times New
  Roman, and the preview stamped Times on every element the rule matched,
  even where another rule won the family. React Email's `<Font>` writes
  `* { font-family: 'Inter', Arial }` beside its `@font-face`; an
  Outlook-only `td, p, a { font-family: Arial, sans-serif !important }`
  overrides it, and a real Outlook 2016 drew those elements in Arial. The
  preview now weighs every font rule the CSS way (`!important`, then
  specificity, then the later rule) and draws Times only where the
  `@font-face` rule wins.

## 0.16.4 - 2026-10-22

A patch that completes 0.16.0: findings with a safe fallback are info, and a
revision that deletes design can now be seen. Only Outlook Classic scores
change, and only upward.

### Added

- **`checkDesignRetention(before, after)` and `designFeatures(html)`.** The
  compatibility score rewards not using what a client drops, so deleting a
  feature scores exactly like giving it a fallback. In the coding-agent
  benchmark every model that linted its emails also deleted design to get
  there: across six models, round-3 emails kept 51 to 81% of the features
  their own first drafts had. This compares a revision with the version before
  it and lists what it removed: rounded corners, responsive and dark-mode
  `@media` rules, Outlook.com `[data-ogsc]` rules, gradients, background
  images, shadows, web fonts, Outlook VML, images, links. A feature is
  reported when it is gone, or cut to half or less by at least two. Counts come
  from the raw source, comments included, so deleting VML counts. Additive; no
  existing output changes.

### Changed

- **A `border-radius` no `v:roundrect` covers is info in Outlook Classic, not
  a warning.** Square corners are Outlook Classic's fallback, not breakage.
  In the coding-agent email benchmark (six models, twenty emails each, linting
  with the MCP), four of six models cleared this warning by deleting the
  radius, so their emails went square in every client to fix one. The finding
  now says the corners show square there and to keep the radius; it still
  carries the element advice (`v:roundrect` for a button, `<v:imagedata>` for
  a picture, corner cells for a card) for where the shape matters. A radius a
  `v:roundrect` covers stays info with the "fallback carries this" message,
  as before.
  - Over 463 emails (this repo's fixtures, the app's templates and the
    benchmark), against 0.16.3: 194 `border-radius` warnings become info,
    nothing else is added or dropped, no score goes down, mean +1.2 and at
    most +3. The elliptical `/` shorthand still warns in Yahoo and AOL.
  - A fix prompt for an email whose only Outlook Classic finding is a corner
    radius no longer appends the Outlook Classic rules, since nothing there
    needs fixing.
- **The Outlook Classic rules stop teaching three things real Outlook
  breaks.** Found on real Outlook 2016 screenshots of fixes written from these
  rules (Emailens AI Fix bench, 2026-10-22/23); `OUTLOOK_CLASSIC_RULES` and the
  element advice reach AI Fix, the CLI and the MCP.
  - A rounded container is corner cells, never content wrapped in a
    `<v:roundrect>` with a `<v:textbox style="mso-fit-shape-to-text:true">`:
    Outlook drew the shape at a fixed height and cut the text past it (a
    testimonial lost its quote below the stars).
  - Corner cells give every cell of a corner row a width attribute (the edge
    cell W-2r) and each corner cell `font-size:0;line-height:0;
    mso-line-height-rule:exactly`. Without the edge cell's width Outlook drew
    the right corner partway along the box; the card example in the element
    advice had exactly that, and fixes copied it. The example is corrected.
  - A new font rule: one Outlook-only rule for `td, th, p, a, span, div, li,
    h1, h2, h3` with the stack's web-safe family, never `* { … }` (which drew
    Times New Roman), and a font class first in the element's class list,
    because Word reads only the first class (a `class="mobile_mt-10 serif"`
    heading lost its Georgia rule).

## 0.16.3 - 2026-10-20

A patch. No API or score changes.

### Added

- **Pictures rounded on some corners only.** A card's hero is usually rounded
  at the top and square at the bottom, which a `v:roundrect` cannot draw (it
  rounds all four corners), so fixes stacked a row of corner pieces above a
  fully rounded picture and left a band of the card's colour over it. Probe
  sheet `12-top-rounded-picture`, sent to real Outlook 2007 to 2019 on
  2026-10-20: a `v:shape` whose path is rounded only at the top, holding
  `<v:imagedata>`, showed the picture clipped to that path on 2010, 2013, 2016
  and 2019 (2007 drew it square). A `<v:fill>` picture in the same shape was
  blank on 2013.
  - The Outlook Classic rules (`OUTLOOK_CLASSIC_RULES`, used by AI Fix, the
    CLI and the MCP) and the element advice teach the construction, flush at
    the top of the card in place of the top corner row.
  - The Outlook Classic preview draws a `v:shape` holding `<v:imagedata>`: the
    picture clipped to the path, stretched to the shape. It used to draw
    nothing for it.

## 0.16.2 - 2026-10-20

A patch that completes the 0.16.1 fix for rounded pictures. 0.16.1 taught
`<v:imagedata>` and drew it, but an email that already used `<v:fill src>`
still previewed the picture and scored 100 for Outlook Classic. Only that
score changes, because it was wrong; every other email scores as before.

### Fixed

- **A rounded picture painted with `<v:fill src>` is flagged, and previews
  blank.** Measured on real devices on 2026-10-20: one email drew its hero and
  two product cards as a `v:roundrect` holding
  `<v:fill type="frame" src="…" color="#FFFFFF">`. Outlook 2007 and 2010 drew
  the three pictures; Outlook 2013, 2016 and 2019 drew three white boxes, the
  fill's colour. The Outlook Classic preview used to draw the picture and the
  email scored 100 for Outlook Classic. Now:
  - `checkVml` reports `vml-roundrect-fill-picture`, which lowers the Outlook
    Classic score: an error for a picture-only shape (an empty box, fixed with
    `<v:imagedata src>`), a warning for a shape with a label, such as a
    textured button, which keeps its colour and label and loses the texture;
  - the preview paints only the fill colour, as three of the five versions do.

Confirmed with a probe sheet sent twice to real Outlook 2007, 2010, 2013,
2016 and 2019: `<v:imagedata>` in a `v:roundrect` drew on all five (2007
squares the corners), and a `<v:fill>` picture in the same shape showed only
its colour on 2013, 2016 and 2019 for PNG, JPG and tiled fills. In one run
Outlook 2019 drew the same image URL as a `v:rect` background in the same
screenshot, so the image had loaded: the shape is what fails, not timing.

`v:rect` backgrounds are unchanged, as in 0.16.1. On these devices they drew
on 2007 and 2010, on 2019 once in two runs, and never on 2013 and 2016, which
contradicts field reports; they stay unflagged until that is resolved.

## 0.16.1 - 2026-10-20

A patch. No API or score changes.

### Fixed

- **Rounded pictures in Outlook Classic use `<v:imagedata>`.** On real
  Outlook 2016 and 2019, a `<v:fill type="frame">` inside a `v:roundrect`
  shows only its fallback colour, never the picture, whatever the host; a
  `<v:imagedata>` in the same shape draws it with the rounded corners. The
  Outlook Classic rules (`OUTLOOK_CLASSIC_RULES`, used by AI Fix, the CLI
  and the MCP) and the element advice now teach `v:imagedata`.
- **The Outlook Classic preview draws `<v:imagedata>`** in a `v:roundrect`,
  stretched to the shape as Word does. It used to drop it, so a correct
  rounded picture previewed as an empty shape.

Backgrounds keep `v:fill`: a `v:imagedata` can't sit behind text. The same
devices left `v:fill` backgrounds blank too, which contradicts how widely
they work in the field, so they are unchanged until that is checked.

## 0.16.0 - 2026-10-19

A minor release. No API changes; scores and severities change. Scores rise for
most emails: across 343 emails (production templates, open-source fixtures,
agent-written benchmark) the worst-client score rose by 7 on average and 18 at
most, none fell, and no new warning or error appeared. If you gate CI on a
score threshold (the GitHub Action, the CLI), the same email now passes more
easily; if you chart scores over time, expect a step up on upgrade.

Scores rise for most emails. Found by scoring 240 emails written by six coding
agents (Cursor, 2026-10-19): the warnings that filled the list were resets and
progressive enhancement, and agents told to fix every warning deleted their
responsive and dark-mode CSS to get there.

### Changed

- **A reset is not a finding.** A declaration whose value is what a client that
  ignores the property renders anyway (`outline: none`, `word-spacing: normal`,
  `height: auto`, `box-sizing: content-box`, `position: static`, ...) no
  longer warns. A mixed stylesheet still points at the real value.
  `text-decoration: none` still warns: a link is underlined by default.
- **Progressive enhancement is info.** `@media`, `@media prefers-color-scheme`
  and `color-scheme` are graceful: the clients without them fall back to the
  inline light, desktop layout. Partial `<style>` support (Gmail, Proton Mail,
  Outlook Classic) is info like every other partial; the ways a `<style>` block
  is really lost stay style-survival rules.
- **A longhand its shorthand overrides** later in the same `style` is not
  graded (React Email's `text-decoration-line:none` before
  `text-decoration:underline`).
- **ESP system links are info.** An unsubscribe, preferences or web-version
  placeholder in an `href` (`*|UNSUB|*`, `{{unsubscribe_url}}`) is filled in by
  the sending platform; `unresolvedCount` no longer counts it. Every other
  variable is still an error.
- **The fix prompt leaves info alone.** `generateFixPrompt` marks its Info
  group as not problems and tells the agent to keep responsive and dark-mode
  CSS; it used to say "apply all the fixes listed above", info included.
- **Suggestions no longer name Outlook to other clients** for `border-radius`,
  `word-break`, `overflow-wrap`, `white-space` and `min-height`.

### Fixed

- **The Gmail preview kept `@font-face`**, so it showed web fonts real
  Gmail never loads. Clients that ignore `@font-face` now lose it in the
  transform.
- **The accuracy test fails on any failed check.** It asserted only a 70%
  total, behind which the Gmail checks had expected `<style>`, `opacity` and
  `overflow` to be stripped, which real Gmail does not do.

## 0.15.0 - 2026-10-17

A minor release. New exports, no breaking changes. Scores, suggestions and
the Outlook Classic preview change. Found by running 24 production React Email
templates through the engine until every client scored 100 and the Outlook
branch, drawn, matched the other clients within 2px.

### Added

- **`OUTLOOK_CLASSIC_RULES`**: the patterns that keep a design intact in
  Outlook Classic (bulletproof buttons, rounded VML picture fills, corner cells
  for a card that holds VML, arcsize over half the shorter side, a fixed 600px
  wrapper, padding on cells, no stacked margins, `<wbr>` for long URLs, an
  `mso-hide` preheader). `AI_FIX_SYSTEM_PROMPT` includes them, and
  `generateFixPrompt` appends them whenever Outlook Classic has findings, so
  an agent applying the fix prompt (the MCP's `fix_email`) gets them too.
- **`vmlPathToSvg`**: the Outlook preview now draws a `<v:shape>` given by a
  path (`m l c qx qy x e`, `ns`/`nf`), the corner-cell idiom for rounding a
  card around VML buttons or pictures.

### Changed

- **Advice follows the element** for HTML input. A rounded button, picture and
  card get three different fixes (bulletproof button, VML fill, corner cells)
  instead of one "rounded buttons" answer; padding on a `<table>` is told to
  move to its cell instead of getting the `<a>` hair-space trick; long URLs
  get `<wbr>` instead of `&#8203;`, which was copied into pasted URLs.
- **`<wbr>` is graceful**: a client that ignores it wraps as it would without
  it, so it reports as info.

### Fixed

- **React Email's preheader cost Outlook Classic points.** A `display:none`
  element is now graded on `display` alone, not on the `overflow`, `opacity`,
  `max-height` and `max-width` that only exist to hide it.
- **React Email's `<Button>` was flagged twice in Outlook Classic**: its
  Outlook-only `mso-font-width` spacers for the `hidden` attribute, and its
  padding as dropped, though those spacers are what pad it there.
- **A VML button's label lost its colour in the Outlook preview**, leaving
  dark text on a dark button. Its `<center>` now keeps its style.

## 0.14.12 - 2026-10-17

A patch. No API changes. `^0.14.0` picks this up. Compatibility warnings and
scores for React Email source change.

### Fixed

- **CSS inside a React Email `dangerouslySetInnerHTML` string was scored for
  every client.** React Email reaches Outlook Classic through a raw string,
  as in `<div dangerouslySetInnerHTML={{ __html: '<!--[if mso]><style>...</style><![endif]-->' }} />`.
  The string sits in an unquoted attribute, so the parser did not read the
  conditional as a comment and the `<style>` became a real element: Gmail,
  Gmail Android, Gmail iOS and Proton Mail lost points for CSS they never see.
  With `framework: "jsx"`, `createSession` and `analyzeEmail` now put a
  single-literal raw string back as the element's content, as React Email
  renders it, so the conditional is a comment again and only Outlook's branch
  reads it. An interpolated template or an expression is left as it is.

## 0.14.11 - 2026-10-17

A patch. No API changes. `^0.14.0` picks this up. The Outlook Classic preview
changes.

### Fixed

- **A `<v:fill>` inside a `<v:roundrect>` was ignored.** The Outlook Classic
  preview drew the rounded shape in `fillcolor` only, so the rounded-picture
  idiom (`<v:roundrect>` with `<v:fill type="frame" src="...">`) rendered as an
  empty box where Outlook shows the picture with rounded corners. The fill's
  image now paints the shape, sized as `<v:rect>` does it, and the fill's
  `color` takes precedence over `fillcolor`, as it does for `<v:rect>`.

## 0.14.10 - 2026-10-16

A patch. No API changes. `^0.14.0` picks this up. The Gmail on the web
preview, the `outlook-double-brace` warning and the template variable report
change.

### Fixed

- **Gradients in the Gmail on the web preview.** `transformForClient(html,
  "gmail-web")` removed any `background` holding a `linear-gradient`, inline or
  from `<style>`, so white text on a gradient rendered white on white. An
  inline `linear-gradient` survives in a real Gmail inbox, and the warnings
  already called it supported. It is now kept. `radial-gradient` and the Gmail
  apps are unobserved and keep the strip.
- **`outlook-double-brace` without anything to lose.** The warning fired on a
  `}}` that closes the stylesheet, where no rule comes after it. It now needs a
  rule after the `}}`, in the same `<style>` block or a later one.
- **Template variables reported twice.** `{{name}}` and `${name}` were also
  reported as the single-brace `{name}` inside them. Each is reported once.

## 0.14.9 - 2026-10-15

A patch. No API changes. `^0.14.0` picks this up. Only the Outlook Classic
preview changes.

### Fixed

- **VML backgrounds in Outlook Classic.** Three bulletproof-background
  patterns rendered without their background:
  - A `<v:fill>` with `opacity` was painted solid, so the transparent overlay
    in the `<v:image>` + `<v:rect>` pattern hid the image behind black. An
    opacity of 0 now paints nothing, and a partial one is kept.
  - `<v:image>` was not translated. Laid under a rect it becomes that rect's
    backdrop; on its own it becomes an image.
  - `<v:background>` was dropped. It now paints the body, tiled or covering
    per its fill.

## 0.14.8 - 2026-10-14

A patch. No API changes. `^0.14.0` picks this up. Support levels, warnings and
compatibility scores change for Gmail on the web, Yahoo Mail on the web,
Outlook.com, Apple Mail, Outlook for Mac and Outlook Classic.

### Fixed

- **Observed overrides.** Real-device screenshots of probe emails (14 October
  2026, 43 clients) contradicted caniemail on several cells. They now override
  it through `scripts/observed-overrides.ts`, applied after the caniemail sync;
  each overridden cell's note says what was seen, where and when.
  - Gmail web: `box-shadow`, `text-shadow`, `visibility`, `align-items`, `gap`
    and `animation` render, so they are supported and no longer stripped.
    `display:grid` is kept. The Gmail apps keep caniemail's data.
  - Yahoo Mail web: `box-shadow` renders and is kept.
  - Outlook.com: `text-shadow` renders.
  - Apple Mail (macOS, iOS) and Outlook for Mac: a `text-decoration` naming a
    style or colour is dropped whole, so they are partial.
- **Simulation.** Outlook.com, Outlook for Microsoft 365 and Outlook Classic
  drop `@keyframes` and `animation` from `<style>` as the real clients do.
  Apple Mail, Outlook for Mac and Outlook Classic drop a `text-decoration`
  that names a style or colour. Outlook Classic keeps padding on a `<div>` or
  `<p>` with a visible border.

## 0.14.7 - 2026-10-14

A patch. No API changes. `^0.14.0` picks this up.

- `toPlainText` kept dropping a whitespace-only text node between inline
  content, so React output like `</a> <!-- -->to catch` came out as
  `(https://...)to catch`. It is now a single space, as a browser renders it.

## 0.14.6 - 2026-10-14

A patch. No API changes. `^0.14.0` picks this up. Only the positions on
Outlook Classic warnings change; levels, messages and scores do not.

### Fixed

- **Outlook Classic warnings point at the right declarations.** Classic's
  findings come from a second pass over the email's Word branch, and their
  positions are copied back from the first pass. The match ignored the
  selector, so every Classic warning for a property took the positions of one
  selector: in the Cerberus fixture, six `border-radius` warnings all pointed
  at the same declaration out of thirteen. They now match on property and
  selector and point at all thirteen. A finding whose CSS exists only inside
  `<!--[if mso]>` carries no position, instead of offsets into the rewritten
  branch that do not exist in the caller's source.

## 0.14.5 - 2026-10-14

A patch. No API changes. `^0.14.0` picks this up. Compatibility scores and
warnings change for Outlook (New) and, slightly, for Outlook Classic, so scores
built on them will move.

### Fixed

- **Outlook (New) was scored as Outlook 2007 to 2019.** `sync-caniemail.ts`
  still mapped caniemail's `outlook.windows` platform, which is the Word-engine
  desktop app, to `outlook-windows`, a leftover from before that id became
  "Outlook (New)" in March. Every resync wrote Word answers into the new
  Outlook: 276 of 298 features matched Outlook Classic and 152 differed from
  Outlook.com. caniemail has never tested the new Outlook, which is built on
  Outlook on the web, so `outlook-windows` now takes the Outlook.com answers
  and notes, and `outlook.windows` merges into `outlook-windows-legacy` with
  the Windows Mail app, worst-wins as before. Outlook Classic picks up 12
  stricter answers from the desktop data (`width`, `height`, `doctype`, and
  nine features that were `unknown`). Image formats follow the same mapping:
  WebP and APNG now fail in Outlook Classic rather than Outlook (New).
- **Intent scoring no longer applies Word's rules to the new Outlook.** The
  `max-width`, `padding` and `margin` checks that treated Outlook (New) as
  sharing Word's partial support are removed; they rested on the bad data.
- **MSO conditional comments are attributed to Outlook Classic only.** The new
  Outlook does not read them.
- **The Gmail `<style>` fix snippet no longer says Gmail strips `<style>`.**
  Gmail keeps a head `<style>` block under 16KB; its apps drop it for
  non-Google accounts, which is the reason to inline.

### Known

- Outlook Classic warnings can point at one declaration when they cover
  several (one of thirteen `border-radius` declarations in the Cerberus
  newsletter fixture). The bad Outlook (New) data hid this, because its
  warnings carried the right positions. Tracked as a `test.todo` in
  `source-positions.test.ts`.

## 0.14.4 - 2026-10-13

A patch. No API changes. `^0.14.0` picks this up. Transformed HTML changes
for Outlook Classic, and for every client that inlines stylesheet rules, so
previews and screenshots built on it will move.

Every change below was measured, not recalled: probe emails that isolate one
declaration per case between colour markers, and four real campaigns, rendered
on real Outlook 2007, 2010, 2013, 2016 and 2019, Gmail, Outlook.com, Yahoo, AOL,
Apple Mail and Thunderbird. Each rule in the source names the case it rests on.

### Changed

- **Outlook Classic honours a property on some elements and not others.** A
  new pass models that:
  - `padding` does nothing on `div`, `p`, `span` and `a`; it works on cells.
    `mso-padding-alt` replaces a cell's padding.
  - `width` and `height` do nothing on `div` and `span`. `margin: auto` does
    not centre a div and a negative margin does not pull it up.
  - A `div` or `h2` with no text of its own paints no background. A
    non-breaking space counts as text.
  - Borders are capped at 8px. `p` and `h2` have no default margin.
  - `line-height` in px is a minimum unless `mso-line-height-rule: exactly`
    is set. `mso-line-height-alt` replaces it.
  - `text-align: center` on a div centres a table inside it.
  - A `width` attribute written with `px` is not read. A table floated with
    `align` keeps a small gutter. A right-to-left table sits on the right. A
    negative margin does not move a table.
  - `word-spacing` and `outline` do nothing.
  - The same rules reach declarations that arrive through a class, id, type
    or descendant selector.
- **Outlook Classic sizes an image by its attributes alone.** A CSS width or
  height is not read, an attribute must be a bare number, and with neither the
  image is drawn at its natural size. Padding, margin, border and background
  on the image draw nothing. SVG and WebP are left blank. `<picture>` falls
  back to its `<img>`.
- **Outlook Classic drops a declaration it cannot parse.** `rgba()`, `hsl()`,
  `var()`, and 4- and 8-digit hex are removed before the downlevel pass, which
  used to turn them into colours Outlook does read.
- **A font declared with `@font-face` becomes Times New Roman in Outlook
  Classic.** Outlook 2007 to 2016 skip the rest of the stack. Outlook 2019
  uses the next family; the single Classic client shows the majority.
- **`display: none` in Outlook Classic follows the element.** A `div` or a
  `table` carrying it is drawn in full. A cell, a row and a span stay hidden.
  A table inside a hidden `div`, cell or row is still drawn, as it is under
  `mso-hide: all`.
- **Lists in Outlook Classic** have no space above and one line of space
  below that `margin: 0` does not remove. A `<br>` straight before a list adds
  a line.
- **VML is translated whatever prefix the email binds to the VML namespace**,
  and lengths in points are read.
- **A not-Outlook block closed with `<!--[endif]---->` is skipped**, the
  spelling Dynamics 365 writes. Before, Outlook Classic previews of those emails
  drew every image and button twice.
- **A button drawn as an empty `v:roundrect` with its label in a `v:shape`
  laid over it** becomes one button with the label inside.
- **Stylesheet rules merge into inline styles in cascade order.** The last
  declaration wins and the style attribute beats a rule, unless only the rule
  is `!important`. Before, the first value was kept, so
  `font-size:16px;font-size:10px` rendered at 16px.

### Not changed

- The support tables, and what is stripped for webmail. The same measurements
  showed Gmail, Outlook.com, Yahoo and AOL applying properties the tables list
  as dropped (`position`, `box-shadow`, `gap`, `display: grid`,
  `linear-gradient`, `opacity`, per client). That rests on one provider's
  accounts, so it is held on the `fix/webmail-measured-strips` branch until a
  second source confirms it.

## 0.14.3 - 2026-10-13

A patch. No API changes. `^0.14.0` picks this up.

### Changed

- **Support data synced with caniemail (2026-09-16).** Scores can move for
  emails that use these features:
  - `<meta name="color-scheme">` on Gmail Android and Gmail iOS is now
    partial, not unsupported. Only `light only` is honoured.
  - SVG images on Gmail web are now partial, not unsupported. Gmail renders
    them rasterized as PNG, and the Gmail Android and iOS notes say the same.
  - `animation` on Superhuman carries a note about reduced motion.

### Performance

- **`transformForAllClients` parses each source once.** Every client used to
  reparse the same HTML. Clients now clone one parsed tree, and the last
  client takes the tree itself. Output is byte-identical to 0.14.2 across 93
  fixture documents and 21 clients (1,953 results, HTML and warnings). Local
  runs measured roughly 40 to 59 percent less time per email.
- **Intent scoring reuses the DOM `analyzeDocument` already parsed.** It
  parses again only when an Outlook conditional branch has to be resolved.
  Compatibility analysis measured about 10 percent faster locally.

### Internal

- A regression corpus of 77 pinned open-source templates from 17 repositories
  (licences and provenance included) and six synthetic edge cases, plus
  `bench:core` and `bench:sizes`. None of it ships in the package.

## 0.14.2 - 2026-09-28

### Fixed

- **The AI fix prompt names which Outlook a fallback covers.** A
  `v:roundrect`, a `v:fill`, a matching table width, and `mso-padding-alt`
  clear Outlook Classic. They do not clear New Outlook.

## 0.14.1 - 2026-09-28

A patch. `generateCompatibilityScore` keeps the same arguments, the same return
shape, and the same formula. `^0.14.0` picks this up. What changes is which
findings stay warnings: a loss that a fallback still carries no longer moves
the number.

### Fixed

- **The compatibility score counts a lost layout.** The formula is still
  `100 - (errors × 10) - (warnings × 3)`, info is still free, and one property
  still costs one point however many times it appears. `analyzeEmail`,
  `auditEmail`, and `createSession` share that list. A remediated occurrence
  becomes info and stays on the report. An unfixed one stays a warning.

  Outlook Classic is graded on the branch it reads. CSS that exists only
  inside `<!--[if !mso]>` stays info, because Word never applied it. New
  Outlook is graded on the live document. VML and `mso-padding-alt` do not
  clear a New Outlook finding.

  - **border-radius** clears when a `v:roundrect` wraps that control, or the
    control's only content is the roundrect. A card that also holds other
    content still counts.
  - **background-image, background-position, background-repeat,
    background-origin, and linear-gradient** clear when a shape with `v:fill`
    or `v:background` paints that container. A bare `v:rect` does not.
    `background: url(...)` counts as a lost image, and position, repeat, and
    origin written in that shorthand count on their own. A bare `url()` is one
    point. `box-shadow` and `text-shadow` still count.
  - **max-width** clears when the element is a table, or an ancestor table's
    width matches, including `600` and `600px`. A 600 shell does not clear
    `max-width: 280px`.
  - **padding** clears on `td` and `th`. On Outlook Classic it also clears
    when an ancestor cell has `mso-padding-alt`. A row whose cells disagree
    on vertical padding still counts.
  - **margin** counts when it is negative, when it is `auto` without
    centering, and when it sits on `span` or `body` without a padded cell.
  - **float, display:flex, and display:grid** clear when that box is only on
    the branch Word does not read.
  - **A body background** is a warning when it exists only on `<body>` for a
    client that replaces `<body>`, unless a full-width wrapper repeats it. It
    is not charged again when `<body>` is already a non-info finding.

  Negative margin, an elliptical `border-radius`, `float: inline-start`,
  `float: inline-end`, and `display: inline-flex` stay warnings for the
  clients whose notes name them. Style-survival issues and a broken VML shape
  fold into the same score. The Gmail 16 KB ceiling stays an error. One broken
  shape does not uncover every other radius or fill in the document.

  `background-color: transparent` on `<body>` can still count as a lost
  background.

## 0.14.0 - 2026-09-26

`^0.13.0` will not pick this up. npm's caret on `0.13.x` stops before `0.14.0`.

### Fixed

- **Gmail no longer inlines both heroes.** The inliner kept `@media`,
  `@supports`, `@keyframes`, and `@font-face`, then walked the rules inside
  them and copied those declarations onto the element. A desktop
  `display:block!important` and a mobile one both landed inline, so both
  heroes showed. The at-rule stays in the style block. Its inner rules are
  not inlined.

- **An authored inline property wins over a later stylesheet rule.**
  `* { margin: 0 }` was appended after `margin: 10px`, so the card gap
  disappeared. The first declaration stays unless the later one is
  `!important`.

- **Dark mode keeps two sampled beige fills.** `#EEEAE4` becomes `#595651`
  on Outlook.com and `#4a4438` on Gmail iOS, instead of the generic invert.
  The body chrome colour `#1a1a1a` no longer paints over a fill that was
  already sampled. Other light colours still use the old invert. The lookup
  is exact 6-digit hex.

### Added

- **Maizzle 6 Vue templates.** `compileMaizzle` compiles a `.vue` single-file component when `@maizzle/framework` 6 is installed. HTML templates still need version 5. A pasted file may not import, re-export, or point `<script>`, `<template>`, or `<style src>` at another file. Component lookup uses an empty directory, not the process working directory.

### Removed

- **`quickjs` sandbox.** It validated, then executed in `node:vm`. Use `"vm"` or `"isolated-vm"`.
- **Session methods that ignored the cached DOM:** `score`, `transformForClient`, `transformForAllClients`, `simulateDarkMode`. Call `generateCompatibilityScore`, `transformForClient`, `transformForAllClients`, and `simulateDarkMode` directly.
- **`warningsForClient`, `errorWarnings`, `structuralWarnings`.** Filter the array.
- **`PreviewResult`.** Nothing constructed it.
- **`TargetingReport.deprecatedWarnings`.** Read `warnings`.
- **`unwrapModernMsoBranch` and `removeAllMsoConditionals`.** Nothing called them.

## 0.13.0 - 2026-09-22

`^0.12.3` will not pick this up. npm's caret on `0.12.x` stops before `0.13.0`.
That is deliberate: `auditEmail` grows a `targeting` field, compatibility
warnings inside client-scoped selectors can disappear, truncation flags
tighten, and three clients leave the authored dark-mode list.

### Added

- **Client targeting is a first-class pass, not a second caniemail matrix.**
  HowToTarget.email is provenance. The engine owns a small matcher table
  (`TARGETING_MATCHERS`) for techniques `EMAIL_CLIENTS` can detect, suppress,
  preserve on inline, or simulate. Catalog rows without a matcher stay in
  `TARGETING_HACKS` and are not bulk-imported as rules.

  `u + .body` scopes to Gmail Web; the more specific `div > u + .body` scopes
  to Gmail Android. Samsung `#MessageWebViewDiv`, Proton `#proton-root`, and
  Superhuman `.ShadowHTML` wrap on `transformForClient`. MSO conditionals are
  detected and left alone under strict policy: they are Word-engine strategy,
  not a smell.

  Findings live on `report.targeting`, not on compatibility scores. Progressive
  policy (the default) suppresses Outlook warnings for properties that only
  appear inside a Gmail wrapper; `targetingPolicy: "strict"` turns that
  suppression off; `"lenient"` also silences deprecated-hack lint.

  `analyzeEmail`, `auditEmail`, and `createSession` share one CSS parse.
  `session.audit()` reuses the same cached pass as `analyze()` /
  `checkTargeting()`. `bun run sync:howtotarget` fails if a matcher
  `upstreamKey` vanished; `bun run check:freshness` fails if the catalog marks
  a technique Deprecated while the matcher `lint` is still `"strict"`.

  `AI_FIX_SYSTEM_PROMPT` targeting bullets are generated from the matcher
  table, so the prompt and the linter cannot drift.

- **`var()` is resolved before compatibility and contrast grade the value.**
  Gmail, Outlook, and Yahoo still do not support custom properties, so
  `custom-properties` keeps firing. What changes is everything downstream:
  `color: var(--ink)` is graded as the resolved colour, and the accessibility
  cascade no longer treats a variable as an unparseable skip. Fallback
  arguments in `var(--x, #111)` are honoured.

- **Overflow sees a row, not only a cell.** Sibling `td`s whose fixed widths
  sum past 600px now warn (`table-row-overflow`), and a fixed-width image
  wider than its parent cell warns (`image-container-overflow`). A
  `max-width` at or under 600px counts as fluid, so a 640px image with
  `max-width: 600px` is no longer a false overflow.

### Changed

- **Authored `@media (prefers-color-scheme: dark)` is only treated as real
  where the client actually runs it.** Litmus (Feb 2025), caniemail, and
  later writeups agree Apple Mail and Samsung Mail honour the query.
  Thunderbird Dark Message Mode rewrites colours itself; HEY rewrites the
  query to `@media (false)`; Superhuman Carbon overlays a theme. Those three
  leave `PREFERS_COLOR_SCHEME_CLIENTS`, so opt-in-meta warnings no longer
  fire for them, and dark-mode simulation still inverts even when the email
  already contains a dark block. Outlook mobile copy now says `[data-ogsc]`
  support is partial, not absent.

- **Inbox truncation limits follow Email Tool Tester's August 2026
  measurements**, with Litmus's "keep preview under 90" still the webmail
  preheader ceiling. Gmail mobile uses the tightest measured pair (Pixel 7
  Gmail app: 33 / 37). Gmail web is ~88 at 1400px. Outlook web subject is
  ~51. Apple Mail iOS uses iPhone 48 / 99; iPad is tighter and noted in the
  comment. Yahoo and Samsung Email had no new measurements and are unchanged.
  Existing emails that were just under the old Gmail-mobile 40 will start
  truncating.

### Fixed

- **Targeting selectors survived inlining by accident or not at all.**
  `transformForClient` now preserves matcher selectors and inserts the
  wrapper the selector assumes (`<u>` for Gmail, `#MessageWebViewDiv` for
  Samsung, and so on), so a Gmail-only rule is still a Gmail-only rule after
  the preview transform.

## 0.12.3 - 2026-09-04

### Fixed

- **The Outlook Classic preview no longer prints a stray "96".** Nearly every
  hand-written email carries the Office boilerplate
  `<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>…`.
  `resolveMsoBranch` was right to uncomment it, because Outlook does read that
  block , but it then handed a browser `<o:PixelsPerInch>96</o:PixelsPerInch>`,
  which no browser has heard of, so it was treated as an unknown *inline*
  element and its text content was painted: a bare `96` above the message. And
  because `<xml>` is not legal inside `<head>`, the parser evicted the block into
  the body, which is why it landed on the first line rather than out of sight.
  The settings block is configuration, never content, so it is now dropped after
  the unwrap. An unclosed `<xml>` is left alone, the same way an unmatched
  conditional is.

- **`mso-hide:all` now actually hides.** It is the only way to hide an element
  from the Word engine, because Outlook Classic ignores `display:none` , that is
  the entire reason the property exists. The transform was right to preserve it,
  but the preview renders in a browser, which has never heard of it either, so a
  preheader hidden *correctly* still painted at the top of the render. We were
  showing the failure to the one author who had already written the fix. It is
  now translated to `display:none` for `outlook-windows-legacy`, for exactly the
  reason `vmlToCss` exists: this render is Chromium standing in for Word, and it
  can only draw what it understands.

  Applied after the strip pass, never before , `display` is on the Word
  unsupported list, so translating first would have it stripped straight back
  out. And not gated on the email having a conditional comment, which
  `wordEngine` means and `mso-hide:all` does not require.

  A preheader hidden with `display:none` alone still shows, which is correct:
  that is what Outlook Classic really does with it.

  Two things the first pass got wrong, both found by running it against the
  markup a preheader is actually written in. The attribute pattern excluded
  both quote characters at once, so it could not cross
  `font-family:'Segoe UI'` , and every real preheader carries a font stack, so
  the single element this feature exists for was the one it skipped. Each quote
  style now has its own alternative and the other may appear inside the value.
  And the translation appended a plain `display:none`, which loses the cascade
  to the `display:block !important` an author writes to keep something visible
  in the clients that are not Word; it is `display:none!important` now.

  The `<xml>` strip needed no such repair: it already handled namespace
  attributes, an uppercase tag, several blocks in one branch, and the
  `<noscript>` wrapper the boilerplate is usually written with, while leaving
  VML alone.

### Changed

- **`<body>` reports at info, not warning.** Six clients replace `<body>` with a
  `<div>` and drop the styles on it: Outlook for Mac, Yahoo Mail on Android and
  iOS, Proton Mail, AOL and Fastmail. The finding is true and worth keeping.
  What it cannot be is a warning.

  Found by dogfooding: twelve transactional templates scored `<body> x6`, every
  one of them. The correct fix is a full-width wrapper table carrying the same
  background, with the background left on `<body>` as the fallback for the
  clients that do honour it. Applying that fix does not move the score, because
  both halves of it are right and the second half is the trigger. The only edit
  that clears the finding is deleting the fallback, which makes the email worse.

  That is the criterion 0.12.2 used to demote `[width]` and `[height]`: a
  finding that fires on nearly every email and that no correct edit can clear
  turns `--failOnWarning` into a switch that is always on. The advice moves into
  the message, which now names the wrapper table rather than saying the client
  "does not support `<body>`".

  `GRACEFUL_FEATURES` is consulted by the element lane as well as by
  `checkPropertySupport`, so the rule lives in one list instead of being split
  across two severity mechanisms. `<body>` is still silent when it carries no
  styling, which has been true since 0.12.0.

  Measured across the six fixtures here: six actionable findings removed from
  each, and the compatibility score gains a point (76 to 77, 95 to 96). A
  consumer storing scores at creation time will see that one point of drift on
  re-run, which is the whole of the change.

  At info the message is the entire finding, so every element demoted this way
  has to carry advice rather than the generic "does not support" wording. The
  element lane has no fallback for that case on purpose, and a test enforces
  that the list and the messages stay in step.

## 0.12.2 - 2026-09-03

### Fixed

- **0.12.1 broke every consumer that keys a collection by client id.** It typed
  `EmailClient.id` as `ClientId` to make the roster and the matrix provably the
  same list. The invariant was worth having; the placement was wrong. Narrowing
  a public field reaches every caller, and the natural thing to do with a client
  list is exactly what breaks:

  ```ts
  const ids = new Set(EMAIL_CLIENTS.map((c) => c.id)); // now Set<ClientId>
  ids.has(userSuppliedString);                         // no longer compiles
  ```

  Four sites in the CLI and two in the MCP server, none of them doing anything
  unusual. `EmailClient.id` is `string` again, and `CSS_SUPPORT` and
  `IMAGE_SUPPORT` are indexed by `string` again for the same reason.

  The check moved to where the literals are written rather than where they are
  read: `CLIENTS` is declared `as const satisfies …{ id: ClientId }`, and two
  type-level assertions prove the roster and the matrix name each other in both
  directions. That is stronger than what 0.12.1 shipped, which only caught a
  client with no column and not a column with no client, and it is invisible to
  anyone downstream. Verified by breaking it: a typo'd id fails both assertions.

  The same principle already governed `GRACEFUL_FEATURES` inside the engine,
  typed at construction and exported as a plain string set. It should have
  governed this from the start.


- **A stylesheet of colour-function openings was quadratic.** `rgb(` with no
  closing paren made the scan run to the end of the stylesheet, once per
  occurrence. 156 KB of `rgb(` took 11.7 seconds against a 2 MB input cap, so a
  crafted email could hold a process for tens of minutes. The scan is bounded at
  256 characters, which no real colour function approaches: the same input now
  takes 93 ms and the cost is linear. Found by fuzzing the rules added in
  0.12.1, not by reading them.

### Changed

- **`[width]` and `[height]` report at info, not warning.** HEY Mail drops both
  attributes, so an image sized only by attribute falls back to its intrinsic
  size there. True, and true of nearly every email ever written: four of this
  repo's six fixtures trip it, as does the CLI's own "clean email" fixture. The
  attribute's presence is what the rule sees, so adding a CSS width alongside
  does not clear it and no edit an author makes will. A warning that fires on
  everything and cannot be cleared turns the CLI's `--failOnWarning` into a
  switch that is always on, which is how this surfaced. The finding stays, at
  the severity a constant deserves.

- **The `"vm"` sandbox is now described as what it is.** The type doc already
  said "NOT a true security boundary", which was honest, but two things around
  it were not. The missing-dependency messages for `isolated-vm` and `quickjs`
  offered `"vm"` as "a lighter (but less secure) alternative" at exactly the
  moment someone chooses a strategy, and a test called
  `constructor.constructor escape is blocked by codeGeneration.strings: false`
  implied the class of escape was handled.

  It is not. `codeGeneration.strings: false` governs the *context's* `Function`;
  host intrinsics are passed into the sandbox and the `Function` reached
  through one of them compiles in the host realm, where the flag does not
  apply. `Object.constructor("return process")()` returns the real process, and
  `process.env` with it, through at least six routes. The old test passes
  because `({})` is a sandbox-realm object, which is the one case that is
  blocked; its name generalised from that to the whole class.

  The test is renamed to what it proves, three tests pin the escape as a known
  property of the strategy, and both fallback messages now say that choosing
  `"vm"` means compiled code can reach the host process and its environment.
  Nothing about the default changes: `isolated-vm` is still the default and
  still a real isolate, and no shipped consumer selects `"vm"`.

## 0.12.1 - 2026-09-02

A patch, on the same reasoning as 0.11.1: that release added `checkVml`, four
rules and a `vml` key on `auditEmail`, and shipped as a patch because it moved
no existing answer. This is the same shape. Across the six shipped fixtures it
gains no compatibility finding and loses none, and the new rules are silent on
all of them. That silence is a statement about false positives, not about
reach; the fixtures contain no `}}`, no space-separated colour and no
conflicting multi-class element, which is why they say nothing.

The delivery matters more than the label here. Most of this fixes a defect
0.12.0 shipped: every finding it added on framework-generated markup carried
advice about a file the author does not have. A minor would leave that in place
for anyone on `^0.12.0` until they edited a manifest, which is the wrong way
round for a fix. On MJML output eight properties stop giving generic advice.

Additive only, so nothing is removed or renamed. As in 0.11.1, `AuditReport`
gains a required key, which a consumer constructing that type rather than
reading it will see.

### Added

- **Style-survival rules: will the client keep your CSS at all?** The support
  matrix answers whether a client implements a property. These answer a
  different question it cannot express, and one nobody can see without opening
  the mail in that client: several clients discard CSS they parsed perfectly
  well, because of where a semicolon sits or how two braces touch. Sourced from
  `hteumeuleu/email-bugs`, the catalogue kept by caniemail's own maintainer.

  - **Gmail keeps only the first 16 kB of CSS** ([#90]) and drops the rest, so
    the email renders with part of its stylesheet and no error anywhere. Counted
    cumulatively across every `<style>`, which is the part a per-block count gets
    wrong. Lives in `size-checker.ts` beside the 102 kB clip, banded the same way.
  - **Outlook on Windows honours only the first class on an element** ([#75]),
    and ignores a descendant rule like `.text td` once a second class is present.
    Reported only on a real conflict: two classes setting different properties
    are fine, and flagging every multi-class element would bury the report.
  - **Outlook.com namespaces only the first class in a compound** ([#61]), so
    `.foo.bar` becomes `.x_foo.bar` and stops matching.
  - **Gmail removes a whole style block using space-separated colours** ([#160]).
    In a `style` attribute it drops every declaration on the element, not just
    the colour. `rgb(0 0 0)` fires; `rgb(0, 0, 0)` does not.
  - **Outlook.com and Outlook mobile discard everything after `}}`** ([#92]),
    which minified CSS closing a media query produces. Whitespace between the
    braces is the fix, so a rule tolerating whitespace would report the cure.
  - **Yahoo and AOL discard everything after an attribute selector whose value
    holds a semicolon** ([#74]). `[style*="..."]` is standard hybrid-layout
    technique, so this fires on exactly the templates whose authors would never
    suspect it.

  Three of the eight rules proposed did not survive reading their sources. #61
  is about chained selectors, not comma-separated lists, and the comma reading
  would have fired on nearly every stylesheet written. #92's remedy is
  whitespace between the braces, so "ignore whitespace" would have inverted it.
  And "Gmail strips uppercase `!IMPORTANT`" has no source: #70 is about
  `!important` being stripped when images are off, at any case, which is a user
  setting rather than something decidable from the HTML. Outlook iOS's 5000px
  clip ([#108]) is real but needs a rendered height, and `checkOverflow`
  computes width only, so it is absent rather than guessed at.

  New `styleSurvival` key on the audit report, skippable like every other
  section. Each issue names the clients that drop the CSS, because the consuming
  app groups findings per client.

### Fixed

- **The translation layer reaches the rules added in 0.12.0.** The engine grades
  compiled HTML, because that is what a client receives, and phrases its advice
  in source terms, because that is what the author can edit. `fix-snippets/` is
  where the two meet, and nothing 0.12.0 added had an entry in it.

  That was not merely a missing string. A compiler writes a great deal the
  author never typed: MJML emits `align`, `role`, `width`, `height`, `lang`,
  `dir`, a doctype and a styled `<body>`; Maizzle's markup transformer adds
  `role`; React Email's `<Html>` renders the doctype. On a two-line MJML source
  0.12.0 produced eight findings about markup MJML itself wrote, each with
  generic advice to change something the author has no file for. Two of them
  were warnings, not info.

  Each now says what to do in the source, or why it is safe to leave.
  `checkStyleSurvival` takes the `framework` parameter the other checkers take
  and each issue carries a `frameworkNote`, because in all three frameworks the
  stylesheet that ships is assembled by the compiler: "edit your `<style>`
  block" is the wrong instruction for someone whose source has no `<style>`
  block.

  The guard compiles a deliberately plain source in each framework and fails on
  any finding from the attribute or document families carrying generic advice.
  It failed on all three when written, which is how the gap was found.

- **A clear error when the wrong Maizzle major is installed.** The peer cap
  below 6 has been right since 0.10.2, but the missing-dependency message still
  said `npm install @maizzle/framework`, which installs 6.x — following our own
  instruction landed you on the version that cannot work, and its failure reads
  `Failed to load url <!DOCTYPE html>…` because Maizzle 6 resolves a string as a
  path. The hint pins `@5`, and `isMaizzle6` detects the wrong major and says
  so.

  Framework versions are now recorded in CONTRIBUTING with the reason the cap
  exists. `mjml >=4.0.0` was checked rather than assumed: 4.18.0 returns
  synchronously, 5.4.0 returns a promise, and `compileMjml` awaits either, so
  the claim holds. React Email is current at 1.0.12 / 2.1.0.

## 0.12.0 - 2026-09-02

A minor, and measured rather than assumed. Across the six shipped fixtures this
gains 269 findings, loses 3, and moves 40 from warning to info. Every fixture
moves: the smallest goes 26 to 50, the Outlook-branch pair 62 to 127. The three
losses are all Superhuman `position`, which now knows it supports `relative` and
`absolute`. That is not a patch.

The gains are concentrated in features the sync had never keyed, in rough order
of volume: `@media prefers-color-scheme` (60), `doctype` (42), `<body>` (36),
`meta-color-scheme` (36), `[lang]` (25), `[role]` (12), `[align]` (9). The 40
severity moves are all `@media`, which stops claiming Gmail cannot run a media
query.

Everything here is read from caniemail's own test results. No claim in this
release rests on our model of what a client draws, so the real-client hold that
governs the renderer does not apply to it.

### Fixed

- **`@media` reported another feature's support data.** Six caniemail features describe the `@media` at-rule, and the sync mapped all six onto one key. The merge kept whichever the API listed first, `css-at-media-device-pixel-ratio`, so `@media` carried device-pixel-ratio's answers: Gmail came out `unsupported`, and every email with a media query in it collected eleven "does not support" warnings for a feature Gmail runs. The five media features now have their own rows, detected by matching the query's prelude, and `@media` holds general media-query support.

  This also makes `@media (prefers-color-scheme: dark)` gradeable on its own row, which is the question dark-mode work actually asks.

- **Merging a client's platforms dropped and swapped its caveat notes.** Grading a client on its worst platform (below) merged the support *levels* correctly but unioned the *notes*, which are per-platform. Two things went wrong: a note from a platform that lost the merge was carried onto the winning answer, and a later, better platform deleted the winning platform's note outright. Across Proton Mail, AOL and Thunderbird that left 13 cells holding a caveat with no explanation and 8 describing a different platform's answer — `@media` on Proton Mail lost "Does not support landscape media query", `light-dark` lost "the color stays light even in dark mode".

  Because the value-aware gate reads those notes, the deletions silently *removed* findings: a caveat with no text has nothing for a value to trigger.

  Notes now follow the answer they describe. Verified by replaying the whole API against the generated file: zero cells disagree.

- **Our own Superhuman overrides now carry their reasoning.** `position` and `transition` are hand-set to `partial` with the detail in a line comment. `SUPERHUMAN_NOTES` moves that into the note the gate actually reads, so Superhuman reports `position: fixed` and `sticky` (which it strips) and stays quiet on `relative` and `absolute` (which it supports), instead of firing on all four.

- **25 element features had no detector.** `HTML_ELEMENT_SELECTORS` was a hand-written map and the sync kept adding keys to `HTML_ELEMENT_FEATURES` without it: `<abbr>`, `<ruby>`, `<wbr>`, `<address>`, `<small>` and twenty more were classified, given a row, and never looked for. 113 (feature, client) findings the engine could not emit. The selector for an element feature is now the tag itself unless one is written down, so the map only holds the exceptions.

  `<body>` is one of those exceptions. Every email has one, so grading its presence put nine warnings on every report forever, which is a constant rather than a finding; it is now graded when the body actually carries styling to lose.

- **`href="#"` was read as a local anchor.** A bare `#` is a placeholder for a link nobody has written yet, and it is all over half-built templates; it produced thirteen warnings about anchor navigation.

- **An image message could say "and 1 others".** Reachable: APNG breaks in exactly five clients, one over the four the message names in full.

- **A warning's suggestion spoke a different language from its message.** The message said "Gmail does not support the hidden attribute" while the generic suggestion beside it said `"[hidden]" is not supported in this email client.` An attribute or doctype finding is also `fixType: "structural"` now, because there is no CSS value to swap.

- **The CSS `try` covered the walk, not just the parse.** A throw in any detector abandoned the rest of that `<style>` block, discarding every declaration not yet visited, and the report just came back shorter. It now covers parsing only, so a detector that throws reads as the bug it is.

- **The sync refuses to write when upstream moves.** A feature that stops resolving, a `CLIENT_MAP` entry caniemail has renamed, or a client whose column goes blank produced no error, only a quieter engine forever after. The sync now counts what it dropped, checks every mapped platform still exists and that no client falls under 60% coverage, and exits non-zero instead of overwriting good data. `check:freshness` gained the same kind of floor: caniemail already ships a second date format in the same payload, and if `last_test_date` adopted it every date would be dropped and the report would cheerfully say nothing was stale.

### Added

- **The rest of caniemail.** The sync keyed 256 of 308 features into 250 rows; it now keys all 308.

  - **38 HTML features** that fell through a mapper which only understood `<tag>`: `align`, `background`, `width`/`height`, `valign`, `cellpadding`/`cellspacing`, `dir`, `lang`, `target`, `srcset`, `loading`, `hidden`, `required`, `role`, five `aria-*`, `popover`, `command`, the eight typed `<input>`/`<button>` variants, local anchors, `mailto:` links, the HTML5 doctype, HTML comments, HTML5 semantics, image maps, the `color-scheme` meta tag, and AMP for Email.
  - **14 image formats**, previously skipped outright. `image-analyzer` had two hand-written checks saying WebP is "not supported by all email clients" and SVG "by most"; it now names which clients, from the matrix, and covers AVIF, APNG, HEIF, BMP, TIFF, ICO, base64 data URIs and video-as-image.
  - **`last_test_date`**, so `check:freshness` can say that 245 of these features have not been re-tested upstream in three years. A file synced today is not the same as data verified today.

- **A client we ship as one entry is now graded on its worst platform.** caniemail tests Proton Mail and AOL on web, Android and iOS and we read only the web row; Thunderbird it tests on macOS and Windows, and we read only macOS. "Proton Mail" in a report means the product, so those now merge worst-wins. Gmail, Outlook, Yahoo and Apple Mail are unaffected: they ship as separate clients per platform already.

### Changed

- **The feature tables are typed by what is actually in them.** Every invariant holding this data together was previously prose: that the classification arrays cover the matrix and do not overlap, that a `GRACEFUL_FEATURES` entry is a real key, that a detector map names features that exist, that the client list and the matrix's columns are the same list. Nothing checked any of it, and the cost of that was already paid once this release: 25 element features were classified, given a row, and never looked for, because the array grew and its selector map did not.

  The generated file now emits `FeatureKey`, `ClientId` and `ImageFormat`, and the matrix is written `satisfies Record<FeatureKey, Record<ClientId, SupportLevel>>`. That one line checks the partition in both directions — a key no array classifies fails to compile, and so does an array naming a key the matrix does not have. `EmailClient.id` is `ClientId`, so a client without a column no longer compiles either. The detector maps in `analyze.ts`, the image-format tables, and `GRACEFUL_FEATURES` are keyed by those unions, so a rename is an error rather than a detector that quietly stops finding anything.

  The exports stay indexable by plain strings: the enforcement is at construction, where the literals are, not at the call sites that look up a property name parsed out of a stylesheet.

- **`COMPOUND_VALUE_FEATURES` no longer holds selectors.** 37 of its 40 members were `:hover`, `::after`, `:nth-child` and friends; three were compound values. Selectors moved to a new `SELECTOR_FEATURES` export. This fell out of making the classifier total: every array is now the keys of exactly one kind, which is what makes the partition provable rather than coincidental.

- **A feature a client merely ignores reports as info, not a warning.** `target="_blank"` is forced by most webmail anyway, the doctype gets rewritten, `aria-*` hints are dropped without moving a pixel. caniemail describes what a client does; a warning tells an author to fix something, and for these there is nothing to fix. `[hidden]` stays a warning: unsupported there means hidden content becomes visible.

## 0.11.9 - 2026-09-01

### Fixed

- **The Word engine no longer paints a background image it cannot paint.** `outlookWindowsAdditionalChecks` has always warned "Outlook Classic requires VML for background images", and the renderer ignored its own warning: a hero written as `background-image:url(...)`, or with the legacy `background` attribute, was handed straight to a Chromium preview that draws both happily.

  This is the exact shape of the complaint that opened the Better Email thread, "issues that your simulated render doesn't spot", and it is the largest visible difference in the Outlook 2019 capture sent on 27 Aug: the real client shows an empty hero band where our preview showed the photograph.

  Handled as two halves. `background` and `background-image` join the existing gradient `valueStrips` with `url(` added to the pattern, and the legacy `background` attribute is removed under a new `stripBackgroundAttribute` config flag. Solid colours are untouched, since Word paints those.

  **A correctly built bulletproof hero still paints.** `vmlToCss` runs after the strip pass, so a `v:rect` carrying a `v:fill` produces its background *after* this rule has run and keeps it. The rule therefore separates the two cases the way the real client does: a background that only exists in CSS disappears, a background carried by VML survives. Guarded by a test, because the ordering is load-bearing and invisible from either site.

- **A `background` shorthand now degrades to its fallback colour instead of vanishing.** `background: #336699 url(hero.png) no-repeat` names the colour that shows in a client which cannot paint the image, which is exactly why authors write it that way, and Word paints it. The value-level strip deleted the whole declaration, so the preview rendered white where Outlook renders the author's fallback: a new wrong picture rather than a missing one.

  `backgroundShorthandColor()` already existed in `color-utils` and already documented this ("`background: #111 url(hero.png)` paints #111 behind the image"); the strip simply never asked it. Now it does, keeping the colour when the value names one and deleting only when it does not.

  This also fixes the same flaw in the pre-existing gradient strip, where `background: #336699 linear-gradient(...)` had been losing its fallback since gradients were first stripped.

### Note on what was NOT changed

  The same capture shows no hero *text* either, and the obvious reading is that a failed `v:rect` takes its `v:textbox` content with it. That reading is wrong. Every text node in that hero is `#FFFFFF`, so once the fill fails the text is white on white: present, and invisible. Keeping it is what the real client does, and emulating a drop would have been a second unfounded mechanism claim of exactly the kind 0.11.8 withdrew.


## 0.11.8 - 2026-08-31

### Fixed

- **`vml-nested-shape` no longer claims the table structure terminates.** The finding told customers three things happen. One had no evidence behind it: *"the table structure around it terminates early, so content after the shape falls out of the layout and renders outside the email frame."*

  The methodology sentence beside it covers the downstream text suppression only, and says so: *"That last one was confirmed with byte-identical probes."* The table clause sat next to it and borrowed its authority. `T1c-blast-radius.html`, the fixture built to measure exactly this, contradicts it: PROBE 2 sits after the nested shape inside the same 640px table and carries a plain HTML table with its own `bgcolor` and a 2px border, and the recorded result is "PROBE 2 shapes render, labels gone". Had the structure terminated, that bordered table is the first thing that would have moved.

  Likely an over-reading of "hero shape gone, layout breaks after it" from a run where a 600px band vanished and everything below shifted up. A third strike: `T3` lists "table opened, never closed" as unknown and untested, so the message asserted a mechanism never observed.

  The other two effects stand, and the practical conclusion is unchanged: one bad shape near the top still degrades the whole email below it, carried entirely by the confirmed downstream suppression. Guarded with a test asserting the absence, because the claim is plausible, reads well, and will tempt someone to put it back.

### Changed

- **A nested shape now renders the way Outlook renders it, instead of being reported and drawn intact.** The preview and the report contradicted each other: the finding said the region was destroyed while the render beside it drew a tidy box with a button in it. Between a warning and a screenshot, people believe the screenshot.

  Previously this was deliberate, on the grounds that reproducing the failure meant perturbing Chromium into a picture wrong in a third way. That does not survive contact with the specific effects. The container losing its fill and geometry is exactly "drop the box", and the children do not move. VML shapes downstream losing their text is exactly "blank their labels", scoped to shapes this translator created, so the blast radius is what was observed. Neither needs distortion. The third effect was the risky one, and it turned out not to be a rendering problem but an evidence problem.

  Holding this case to "we cannot draw it" also applied a standard nothing else in the transform meets: `border-radius`, `display:flex` and `max-width` are already stripped for the Word engine and those approximations ship with confidence.

  Plain HTML after the shape is left alone, with a test to keep it that way. `T1c` shows it rendering in place, so blanking it would be inventing a failure rather than reproducing one. Geometry stays, because a blank coloured block is the observed render rather than a leftover.

  Affected regions carry `data-vml-outlook` (`container-dropped`, `label-dropped`) so a surface can label them: a blank button should read as "Outlook does this" and not as a bug in the preview.

  **Breaking for anyone reading the Word-engine render as bytes**: a nested container now emits no `style` attribute, and shape labels at or after it are removed. Every other client is untouched.


## 0.11.7 - 2026-08-30

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

[#61]: https://github.com/hteumeuleu/email-bugs/issues/61
[#74]: https://github.com/hteumeuleu/email-bugs/issues/74
[#75]: https://github.com/hteumeuleu/email-bugs/issues/75
[#90]: https://github.com/hteumeuleu/email-bugs/issues/90
[#92]: https://github.com/hteumeuleu/email-bugs/issues/92
[#108]: https://github.com/hteumeuleu/email-bugs/issues/108
[#160]: https://github.com/hteumeuleu/email-bugs/issues/160
