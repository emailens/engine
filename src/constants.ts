/**
 * Shared constants used across the engine.
 */

/** Maximum HTML input size: 2MB. Inputs exceeding this are rejected early. */
export const MAX_HTML_SIZE = 2 * 1024 * 1024;

export const GENERIC_LINK_TEXT = new Set([
  "click here", "here", "read more", "learn more", "more",
  "link", "this link", "click", "tap here", "this",
]);

/** Shared empty report defaults for skipped checks and empty-input fast paths. */
import type { SpamReport, LinkReport, AccessibilityReport, ImageReport } from "./types";

export const EMPTY_SPAM: SpamReport = { score: 100, level: "low", issues: [] };
export const EMPTY_LINKS: LinkReport = {
  totalLinks: 0,
  issues: [],
  breakdown: { https: 0, http: 0, mailto: 0, tel: 0, anchor: 0, javascript: 0, protocolRelative: 0, other: 0 },
};
export const EMPTY_ACCESSIBILITY: AccessibilityReport = { score: 100, issues: [] };
export const EMPTY_IMAGES: ImageReport = { total: 0, totalDataUriBytes: 0, issues: [], images: [] };
