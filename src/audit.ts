import * as cheerio from "cheerio";
import { analyzeEmailFromDom, generateCompatibilityScore } from "./analyze";
import { analyzeSpamFromDom } from "./spam-scorer";
import { validateLinksFromDom } from "./link-validator";
import { checkAccessibilityFromDom } from "./accessibility-checker";
import { analyzeImagesFromDom } from "./image-analyzer";
import { extractInboxPreviewFromDom } from "./inbox-preview";
import { checkSizeFromDom } from "./size-checker";
import { checkTemplateVariablesFromDom } from "./template-checker";
import {
  MAX_HTML_SIZE,
  EMPTY_SPAM, EMPTY_LINKS, EMPTY_ACCESSIBILITY, EMPTY_IMAGES,
  EMPTY_INBOX_PREVIEW, EMPTY_SIZE, EMPTY_TEMPLATE,
} from "./constants";
import type {
  CSSWarning,
  Framework,
  SpamAnalysisOptions,
  SpamReport,
  LinkReport,
  AccessibilityReport,
  ImageReport,
  InboxPreview,
  SizeReport,
  TemplateReport,
} from "./types";

export interface AuditOptions {
  framework?: Framework;
  /** Options for spam analysis */
  spam?: SpamAnalysisOptions;
  /** Skip specific checks */
  skip?: Array<"spam" | "links" | "accessibility" | "images" | "compatibility" | "inboxPreview" | "size" | "templateVariables">;
}

export interface AuditReport {
  compatibility: {
    warnings: CSSWarning[];
    scores: Record<string, { score: number; errors: number; warnings: number; info: number }>;
  };
  spam: SpamReport;
  links: LinkReport;
  accessibility: AccessibilityReport;
  images: ImageReport;
  inboxPreview: InboxPreview;
  size: SizeReport;
  templateVariables: TemplateReport;
}

/**
 * Run all email analysis checks in a single call.
 *
 * Returns a unified report with compatibility warnings + scores,
 * spam analysis, link validation, accessibility audit, and image analysis.
 * Use the `skip` option to omit checks you don't need.
 *
 * Internally parses the HTML once and shares the parsed DOM across
 * all analyzers to avoid redundant parsing overhead.
 */
export function auditEmail(html: string, options?: AuditOptions): AuditReport {
  if (!html || !html.trim()) {
    return {
      compatibility: { warnings: [], scores: {} },
      spam: EMPTY_SPAM,
      links: EMPTY_LINKS,
      accessibility: EMPTY_ACCESSIBILITY,
      images: EMPTY_IMAGES,
      inboxPreview: EMPTY_INBOX_PREVIEW,
      size: EMPTY_SIZE,
      templateVariables: EMPTY_TEMPLATE,
    };
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const framework = options?.framework;
  const skip = new Set(options?.skip ?? []);

  // Parse once, share across all analyzers
  const $ = cheerio.load(html);

  const warnings = skip.has("compatibility") ? [] : analyzeEmailFromDom($, framework);
  const scores = skip.has("compatibility") ? {} : generateCompatibilityScore(warnings);
  const spam = skip.has("spam") ? EMPTY_SPAM : analyzeSpamFromDom($, options?.spam);
  const links = skip.has("links") ? EMPTY_LINKS : validateLinksFromDom($);
  const accessibility = skip.has("accessibility") ? EMPTY_ACCESSIBILITY : checkAccessibilityFromDom($);
  const images = skip.has("images") ? EMPTY_IMAGES : analyzeImagesFromDom($);
  const inboxPreview = skip.has("inboxPreview") ? EMPTY_INBOX_PREVIEW : extractInboxPreviewFromDom($);
  const size = skip.has("size") ? EMPTY_SIZE : checkSizeFromDom($, html);
  const templateVariables = skip.has("templateVariables") ? EMPTY_TEMPLATE : checkTemplateVariablesFromDom($);

  return { compatibility: { warnings, scores }, spam, links, accessibility, images, inboxPreview, size, templateVariables };
}
