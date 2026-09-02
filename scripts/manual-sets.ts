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
 * A feature belongs here only when its absence leaves the email rendering the
 * same. `[hidden]` is the counter-example and stays a warning: unsupported
 * there means content the author hid becomes visible.
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
];
