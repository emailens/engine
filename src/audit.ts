import type { CheerioAPI } from "cheerio";
import { analyzeEmailFromDom, generateCompatibilityScore } from "./analyze";
import { analyzeSpamFromDom } from "./spam-scorer";
import { validateLinksFromDom } from "./link-validator";
import { checkAccessibilityFromDom, checkDarkModeContrast, checkMobileContrastFromDom, checkDarkStylesContrastFromDom } from "./accessibility-checker";
import { analyzeImagesFromDom } from "./image-analyzer";
import { extractInboxPreviewFromDom } from "./inbox-preview";
import { checkSizeFromDom } from "./size-checker";
import { checkTemplateVariablesFromDom } from "./template-checker";
import { checkOverflowFromDom } from "./overflow-checker";
import { checkVisualFromDom } from "./visual-checker";
import { checkDesignConsistencyFromDom } from "./design-consistency";
import { fromHtml, type ParseOptions } from "./parse-html";
import {
  EMPTY_SPAM, EMPTY_LINKS, EMPTY_ACCESSIBILITY, EMPTY_IMAGES,
  EMPTY_INBOX_PREVIEW, EMPTY_SIZE, EMPTY_TEMPLATE, EMPTY_OVERFLOW, EMPTY_VISUAL, EMPTY_DESIGN,
} from "./constants";
import type {
  AccessibilityIssue,
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
  OverflowReport,
  VisualReport,
  DesignReport,
} from "./types";

export interface AuditOptions extends ParseOptions {
  framework?: Framework;
  /** Options for spam analysis */
  spam?: SpamAnalysisOptions;
  /** Skip specific checks */
  skip?: Array<"spam" | "links" | "accessibility" | "images" | "compatibility" | "inboxPreview" | "size" | "templateVariables" | "overflow" | "visual" | "darkContrast" | "mobileContrast" | "design">;
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
  overflow: OverflowReport;
  visual: VisualReport;
  /** Contrast failures present only once a client inverts colours. */
  darkContrast: AccessibilityIssue[];
  /** Contrast failures present only below the email's mobile breakpoint. */
  mobileContrast: AccessibilityIssue[];
  /** Design drift: near-identical colours, and properties with no system left. */
  design: DesignReport;
}

/** Unified empty report for blank input: hands out the same singletons every checker uses. */
export const EMPTY_AUDIT: AuditReport = {
  compatibility: { warnings: [], scores: {} },
  spam: EMPTY_SPAM,
  links: EMPTY_LINKS,
  accessibility: EMPTY_ACCESSIBILITY,
  images: EMPTY_IMAGES,
  inboxPreview: EMPTY_INBOX_PREVIEW,
  size: EMPTY_SIZE,
  templateVariables: EMPTY_TEMPLATE,
  overflow: EMPTY_OVERFLOW,
  visual: EMPTY_VISUAL,
  darkContrast: [],
  mobileContrast: [],
  design: EMPTY_DESIGN,
};

/** Keep the first issue reported for each element. */
function dedupeByElement(issues: AccessibilityIssue[]): AccessibilityIssue[] {
  const seen = new Set<string | undefined>();
  return issues.filter((issue) => {
    if (seen.has(issue.element)) return false;
    seen.add(issue.element);
    return true;
  });
}

/**
 * Run every analyzer over an already-parsed DOM and assemble the report.
 * Shared by `auditEmail()` (which parses first) and `EmailSession.audit()`
 * (which reuses the session's DOM) so the check list lives in one place.
 */
export function runAudit(
  $: CheerioAPI,
  html: string,
  framework: Framework | undefined,
  options?: Pick<AuditOptions, "spam" | "skip" | "positions">,
): AuditReport {
  const skip = new Set(options?.skip ?? []);
  // Analyzers that resolve positions inside text need the raw source; handing
  // it over only when positions were requested keeps the default path honest.
  const source = options?.positions ? html : undefined;

  const warnings = skip.has("compatibility") ? [] : analyzeEmailFromDom($, framework, source);
  const scores = skip.has("compatibility") ? {} : generateCompatibilityScore(warnings);
  const spam = skip.has("spam") ? EMPTY_SPAM : analyzeSpamFromDom($, options?.spam);
  const links = skip.has("links") ? EMPTY_LINKS : validateLinksFromDom($);
  const accessibility = skip.has("accessibility") ? EMPTY_ACCESSIBILITY : checkAccessibilityFromDom($);
  const images = skip.has("images") ? EMPTY_IMAGES : analyzeImagesFromDom($);
  const inboxPreview = skip.has("inboxPreview") ? EMPTY_INBOX_PREVIEW : extractInboxPreviewFromDom($);
  const size = skip.has("size") ? EMPTY_SIZE : checkSizeFromDom($, html);
  const templateVariables = skip.has("templateVariables") ? EMPTY_TEMPLATE : checkTemplateVariablesFromDom($, source);
  const overflow = skip.has("overflow") ? EMPTY_OVERFLOW : checkOverflowFromDom($, source);
  const visual = skip.has("visual") ? EMPTY_VISUAL : checkVisualFromDom($, source);
  // Reuses the light-mode issues as the baseline, so only the dark render is
  // re-analysed. Skipping accessibility skips this too; without the baseline
  // it would report every contrast failure, not the dark-only ones.
  // Dark mode breaks two different ways: a client inverting colours the author
  // never chose, and the author's own dark block re-painting only half a
  // component. Both land here, deduped by element so one fault is one report.
  const darkContrast = skip.has("darkContrast") || skip.has("accessibility")
    ? []:
    dedupeByElement([
        ...checkDarkModeContrast(html, accessibility.issues),
        ...checkDarkStylesContrastFromDom($, accessibility.issues),
      ]);
  // Same DOM, resolved against the mobile breakpoint, no re-parse needed.
  const design = skip.has("design") ? EMPTY_DESIGN : checkDesignConsistencyFromDom($);
  const mobileContrast = skip.has("mobileContrast") || skip.has("accessibility")
    ? []:
    checkMobileContrastFromDom($, accessibility.issues);

  return { compatibility: { warnings, scores }, spam, links, accessibility, images, inboxPreview, size, templateVariables, overflow, visual, darkContrast, mobileContrast, design };
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
  return fromHtml(html, EMPTY_AUDIT, ($, h) => runAudit($, h, options?.framework, options), options);
}
