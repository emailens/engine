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
 * Updated per caniemail.com data — Gmail keeps float and display (basic values).
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
