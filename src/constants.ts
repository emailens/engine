/**
 * Shared constants used across the engine.
 */

/** Maximum HTML input size: 2MB. Inputs exceeding this are rejected early. */
export const MAX_HTML_SIZE = 2 * 1024 * 1024;

export const GENERIC_LINK_TEXT = new Set([
  "click here", "here", "read more", "learn more", "more",
  "link", "this link", "click", "tap here", "this",
]);
