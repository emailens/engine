/**
 * Shared constants used across the engine.
 */

/** Maximum HTML input size: 2MB. Inputs exceeding this are rejected early. */
export const MAX_HTML_SIZE = 2 * 1024 * 1024;

export const GENERIC_LINK_TEXT = new Set([
  "click here", "here", "read more", "learn more", "more",
  "link", "this link", "click", "tap here", "this",
]);

// ─── Gmail clipping thresholds ──────────────────────────────────────────────

/** Gmail clips messages larger than ~102KB */
export const GMAIL_CLIP_THRESHOLD = 102 * 1024;

/** Warning zone: messages approaching the clip threshold */
export const GMAIL_CLIP_WARNING_THRESHOLD = 90 * 1024;

// ─── Per-client display limits ──────────────────────────────────────────────

export interface ClientDisplayLimit {
  client: string;
  subjectLimit: number;
  preheaderLimit: number;
}

export const CLIENT_DISPLAY_LIMITS: ClientDisplayLimit[] = [
  { client: "Gmail (Web)", subjectLimit: 70, preheaderLimit: 90 },
  { client: "Gmail (Mobile)", subjectLimit: 40, preheaderLimit: 90 },
  { client: "Outlook (Web)", subjectLimit: 60, preheaderLimit: 35 },
  { client: "Outlook (Desktop)", subjectLimit: 55, preheaderLimit: 35 },
  { client: "Apple Mail (macOS)", subjectLimit: 78, preheaderLimit: 140 },
  { client: "Apple Mail (iOS)", subjectLimit: 35, preheaderLimit: 90 },
  { client: "Yahoo Mail", subjectLimit: 46, preheaderLimit: 100 },
  { client: "Samsung Email", subjectLimit: 40, preheaderLimit: 70 },
];

// ─── Template variable patterns ─────────────────────────────────────────────

/**
 * Patterns for detecting unresolved template/merge variables.
 * Each entry: [pattern, label]
 */
export const TEMPLATE_VARIABLE_PATTERNS: Array<[RegExp, string]> = [
  [/\{\{[\s\S]*?\}\}/g, "Handlebars/Mustache"],          // {{var}}
  [/\$\{[^}]+\}/g, "ES template literal"],                // ${var}
  [/<%=?\s*[^%]+%>/g, "ERB/EJS"],                         // <% %> / <%= %>
  [/\*\|[A-Z_][A-Z0-9_]*\|\*/g, "Mailchimp merge tag"],  // *|TAG|*
  [/%%[A-Za-z_][A-Za-z0-9_]*%%/g, "Salesforce AMPscript"],// %%tag%%
  [/\{[A-Za-z_][A-Za-z0-9_.]{2,}\}/g, "Single-brace merge field"], // {merge_field} (3+ char names)
];

/** Shared empty report defaults for skipped checks and empty-input fast paths. */
import type { SpamReport, LinkReport, AccessibilityReport, ImageReport, InboxPreview, SizeReport, TemplateReport } from "./types";

export const EMPTY_SPAM: SpamReport = { score: 100, level: "low", issues: [] };
export const EMPTY_LINKS: LinkReport = {
  totalLinks: 0,
  issues: [],
  breakdown: { https: 0, http: 0, mailto: 0, tel: 0, anchor: 0, javascript: 0, protocolRelative: 0, other: 0 },
};
export const EMPTY_ACCESSIBILITY: AccessibilityReport = { score: 100, issues: [] };
export const EMPTY_IMAGES: ImageReport = { total: 0, totalDataUriBytes: 0, issues: [], images: [] };
export const EMPTY_INBOX_PREVIEW: InboxPreview = { subject: null, preheader: null, subjectLength: 0, preheaderLength: 0, truncation: [], issues: [] };
export const EMPTY_SIZE: SizeReport = { htmlBytes: 0, humanSize: "0 B", clipped: false, issues: [] };
export const EMPTY_TEMPLATE: TemplateReport = { unresolvedCount: 0, issues: [] };
