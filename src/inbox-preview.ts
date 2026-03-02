import type { CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import { MAX_HTML_SIZE, CLIENT_DISPLAY_LIMITS } from "./constants";
import type { InboxPreviewIssue, InboxPreview, ClientTruncation } from "./types";

const MAX_SUBJECT_LENGTH = 60;
const MAX_PREHEADER_LENGTH = 100;
const MIN_PREHEADER_LENGTH = 30;

/** Emoji regex — covers most common emoji ranges */
const EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}-\u{2B55}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;

/**
 * Detect &zwnj;&nbsp; padding hack in preheader elements.
 * Cheerio partially decodes entities: zwnj → \u200C but &nbsp; may stay as entity.
 * Match both decoded Unicode and HTML entity forms.
 */
const ZWNJ_PADDING_PATTERN = /(\u200C\s*(&nbsp;|\u00A0)\s*){2,}|(&zwnj;\s*&nbsp;\s*){2,}/;

/**
 * Extract subject and preheader text from the email HTML, plus
 * flag common issues (missing title, length problems, etc.).
 *
 * The subject comes from the `<title>` tag. The preheader is extracted
 * from the first visible text in `<body>`, including hidden preheader
 * hacks (zero-width divs, display:none spans, etc.).
 */
export function extractInboxPreview(html: string): InboxPreview {
  if (!html || !html.trim()) {
    return {
      subject: null,
      preheader: null,
      subjectLength: 0,
      preheaderLength: 0,
      truncation: [],
      issues: [{ rule: "missing-subject", severity: "warning", message: "No <title> tag found. Most email clients use this as the subject line." }],
    };
  }

  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const $ = cheerio.load(html);
  return extractInboxPreviewFromDom($);
}

/**
 * DOM-based implementation for use with shared Cheerio sessions.
 */
export function extractInboxPreviewFromDom($: CheerioAPI): InboxPreview {
  const issues: InboxPreviewIssue[] = [];

  // ── Subject (from <title>) ──
  const titleEl = $("title");
  const subject = titleEl.length > 0 ? titleEl.first().text().trim() || null : null;
  const subjectLength = subject?.length ?? 0;

  if (!subject) {
    issues.push({
      rule: "missing-subject",
      severity: "warning",
      message: "No <title> tag found. Most email clients use this as the subject line.",
    });
  } else if (subjectLength > MAX_SUBJECT_LENGTH) {
    issues.push({
      rule: "subject-too-long",
      severity: "warning",
      message: `Subject is ${subjectLength} characters — may be truncated in inboxes (recommended: ${MAX_SUBJECT_LENGTH} or fewer).`,
    });
  }

  // ── Preheader ──
  // Look for common preheader patterns first:
  // 1. Hidden divs/spans at the start of <body> (display:none, visibility:hidden, mso-hide:all)
  // 2. First visible text in <body>
  const preheader = extractPreheaderText($);
  const preheaderLength = preheader?.length ?? 0;

  if (!preheader) {
    issues.push({
      rule: "missing-preheader",
      severity: "info",
      message: "No preheader text detected. Adding preview text improves open rates in crowded inboxes.",
    });
  } else if (preheaderLength < MIN_PREHEADER_LENGTH) {
    issues.push({
      rule: "preheader-too-short",
      severity: "warning",
      message: `Preheader is only ${preheaderLength} characters — email clients may backfill with body text (recommended: ${MIN_PREHEADER_LENGTH}+).`,
    });
  } else if (preheaderLength > MAX_PREHEADER_LENGTH) {
    issues.push({
      rule: "preheader-too-long",
      severity: "info",
      message: `Preheader is ${preheaderLength} characters — most clients show 40–100 characters. Text beyond that is hidden.`,
    });
  }

  // ── ZWNJ/NBSP padding detection ──
  if (hasZwnjPadding($)) {
    issues.push({
      rule: "zwnj-padding",
      severity: "info",
      message: "Preheader uses &zwnj;&nbsp; padding hack — works in most clients but may show garbled text in some.",
    });
  }

  // ── Emoji in subject ──
  if (subject && EMOJI_PATTERN.test(subject)) {
    issues.push({
      rule: "emoji-in-subject",
      severity: "info",
      message: "Subject line contains emoji — renders inconsistently across email clients and may trigger spam filters.",
    });
  }

  // ── Per-client truncation ──
  const truncation = computeTruncation(subject, preheader);

  return {
    subject,
    preheader,
    subjectLength,
    preheaderLength,
    truncation,
    issues,
  };
}

/**
 * Compute per-client truncation data for subject and preheader.
 */
function computeTruncation(subject: string | null, preheader: string | null): ClientTruncation[] {
  return CLIENT_DISPLAY_LIMITS.map((limit) => {
    const truncatedSubject = subject && subject.length > limit.subjectLimit
      ? subject.slice(0, limit.subjectLimit - 1) + "…"
      : subject;
    const truncatedPreheader = preheader && preheader.length > limit.preheaderLimit
      ? preheader.slice(0, limit.preheaderLimit - 1) + "…"
      : preheader;

    return {
      client: limit.client,
      subjectLimit: limit.subjectLimit,
      preheaderLimit: limit.preheaderLimit,
      truncatedSubject: truncatedSubject ?? null,
      truncatedPreheader: truncatedPreheader ?? null,
      subjectTruncated: !!subject && subject.length > limit.subjectLimit,
      preheaderTruncated: !!preheader && preheader.length > limit.preheaderLimit,
    };
  });
}

/**
 * Detect &zwnj;&nbsp; padding hack in preheader-like elements.
 */
function hasZwnjPadding($: CheerioAPI): boolean {
  const body = $("body");
  if (!body.length) return false;

  const hiddenSelectors = [
    'div[style*="display:none"]', 'div[style*="display: none"]',
    'span[style*="display:none"]', 'span[style*="display: none"]',
    'div[style*="max-height:0"]', 'div[style*="max-height: 0"]',
    'span[style*="max-height:0"]', 'span[style*="max-height: 0"]',
    '[class*="preheader"]', '[class*="preview-text"]', '[class*="previewText"]',
  ];

  for (const sel of hiddenSelectors) {
    const el = body.find(sel).first();
    if (el.length) {
      const rawHtml = el.html() || "";
      if (ZWNJ_PADDING_PATTERN.test(rawHtml)) return true;
    }
  }
  return false;
}

/**
 * Try to extract preheader text from the email body.
 *
 * Strategy:
 * 1. Look for hidden elements at the start of body (common preheader hacks)
 * 2. Fall back to the first visible text in body
 */
function extractPreheaderText($: CheerioAPI): string | null {
  const body = $("body");
  if (!body.length) return null;

  // Check for hidden preheader hacks — these are typically the first child
  // elements with display:none, visibility:hidden, max-height:0, or mso-hide:all
  const hiddenSelectors = [
    'div[style*="display:none"]',
    'div[style*="display: none"]',
    'span[style*="display:none"]',
    'span[style*="display: none"]',
    'div[style*="visibility:hidden"]',
    'div[style*="visibility: hidden"]',
    'span[style*="visibility:hidden"]',
    'span[style*="visibility: hidden"]',
    'div[style*="max-height:0"]',
    'div[style*="max-height: 0"]',
    'span[style*="max-height:0"]',
    'span[style*="max-height: 0"]',
    'div[style*="mso-hide:all"]',
    'div[style*="mso-hide: all"]',
  ];

  for (const sel of hiddenSelectors) {
    const el = body.find(sel).first();
    if (el.length) {
      const text = el.text().trim();
      if (text) return text;
    }
  }

  // Also check for elements with class names suggesting preheader
  const preheaderClasses = body.find(
    '[class*="preheader"], [class*="preview-text"], [class*="previewText"]'
  ).first();
  if (preheaderClasses.length) {
    const text = preheaderClasses.text().trim();
    if (text) return text;
  }

  // Fall back to the first block of visible text in the body
  // Walk the first few direct children to find text
  const firstText = getFirstVisibleText($, body);
  return firstText || null;
}

/**
 * Extract the first meaningful visible text from a body element.
 * Skips style/script tags and stops after finding the first text block.
 */
function getFirstVisibleText($: CheerioAPI, body: cheerio.Cheerio<any>): string | null {
  const skipTags = new Set(["style", "script", "head", "title"]);
  let result: string | null = null;

  body.find("*").each((_, el) => {
    if (result) return false; // stop iterating
    const tagName = (el as any).tagName?.toLowerCase();
    if (skipTags.has(tagName)) return;

    // Check if this element is hidden (skip hidden elements for preheader detection)
    const style = $(el).attr("style") || "";
    if (
      style.includes("display:none") ||
      style.includes("display: none") ||
      style.includes("visibility:hidden") ||
      style.includes("visibility: hidden")
    ) {
      return;
    }

    // Get direct text content (not from children)
    const directText = $(el)
      .contents()
      .filter((_, node) => node.type === "text")
      .text()
      .trim();

    if (directText && directText.length > 1) {
      // Skip whitespace-only padding (common in email templates)
      const cleaned = directText.replace(/[\u200B\u00A0\s]+/g, " ").trim();
      if (cleaned.length > 1) {
        result = cleaned;
        return false;
      }
    }
  });

  return result;
}
