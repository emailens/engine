/**
 * Manually curated property sets that require editorial judgment.
 *
 * These sets cannot be auto-derived from caniemail data because they
 * encode behavioural knowledge about email client quirks that goes
 * beyond simple "supported/unsupported" classification.
 *
 * The sync script copies these verbatim into the generated css-support.ts.
 */

/**
 * CSS properties that Gmail strips from inline styles.
 * Updated per caniemail.com data; Gmail keeps float and display (basic values).
 */
export const GMAIL_STRIPPED_PROPERTIES = [
  "position",
  "visibility",
  "box-shadow",
  "text-shadow",
  "transform",
  "animation",
  "transition",
  "gap",
  "filter",
  "clip-path",
  "backdrop-filter",
];

/**
 * CSS properties that the Outlook Word rendering engine ignores.
 */
export const OUTLOOK_WORD_UNSUPPORTED = [
  "border-radius",
  "box-shadow",
  "text-shadow",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  "float",
  "position",
  "display",
  "overflow",
  "opacity",
  "transform",
  "animation",
  "transition",
  "background-size",
  "background-position",
  "box-sizing",
  "object-fit",
  "gap",
  "word-break",
  "overflow-wrap",
  "text-overflow",
  "border-spacing",
  "filter",
  "clip-path",
  "backdrop-filter",
  "visibility",
];

/**
 * Properties that require HTML structural changes (not just CSS swaps)
 * to fix. These cannot be solved by replacing one CSS value with another.
 */
export const STRUCTURAL_FIX_PROPERTIES = [
  "display:flex",
  "display:grid",
  "word-break",
  "overflow-wrap",
  "text-overflow",
  "position",
  "float",
  "gap",
  "max-width",
  "border-radius",
  "background-image",
  "background-size",
  "background-position",
  "<svg>",
  "<video>",
  "<form>",
  "object-fit",
];

/**
 * Features whose "unsupported" means the client ignores them, not that
 * anything breaks: a forced `target="_blank"`, a doctype the client rewrites,
 * an `aria-*` hint the renderer drops. caniemail is describing what a client
 * does, and for these the honest severity is "worth knowing", not "fix this".
 *
 * A feature belongs here for one of two reasons. Either its absence leaves the
 * email rendering the same, or the finding is a constant: it fires on markup
 * every email has, and the attribute's presence is itself the trigger, so no
 * edit an author makes can clear it. A warning nobody can act on turns
 * `--failOnWarning` into a switch that is always on, which costs more than the
 * finding is worth.
 *
 * `[hidden]` is the counter-example and stays a warning: unsupported there
 * means content the author hid becomes visible, and removing the attribute is
 * a real choice they can make.
 */
export const GRACEFUL_FEATURES = [
  "doctype",
  "meta-color-scheme",
  "[target]",
  "[loading]",
  "[srcset]",
  "[role]",
  "[aria-describedby]",
  "[aria-hidden]",
  "[aria-label]",
  "[aria-labelledby]",
  "[aria-live]",
  "[lang]",
  "[dir]",
  // Sizing an image or a table with these attributes is how email has always
  // been written, and 4 of the 6 fixtures here do it. HEY Mail drops them, so
  // the image falls back to its intrinsic size, which is worth knowing and is
  // not worth a warning on essentially every email ever sent. Adding a CSS
  // width alongside does not clear it either, because the attribute is what
  // the rule sees.
  "[width]",
  "[height]",
  // Every framework emits a <body>, and the clients that replace it with a
  // <div> drop the styles on it. The right fix is a full-width wrapper table
  // carrying the same background, and it does not clear the finding, because
  // the body background is still the fallback and still worth keeping. The
  // only edit that clears it is deleting that fallback, which is worse. Found
  // by scoring twelve transactional templates: `<body> x6` on every one.
  "<body>",
];
