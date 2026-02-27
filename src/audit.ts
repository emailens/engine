import { analyzeEmail, generateCompatibilityScore } from "./analyze";
import { analyzeSpam } from "./spam-scorer";
import { validateLinks } from "./link-validator";
import { checkAccessibility } from "./accessibility-checker";
import { analyzeImages } from "./image-analyzer";
import { MAX_HTML_SIZE } from "./constants";
import type {
  CSSWarning,
  Framework,
  SpamAnalysisOptions,
  SpamReport,
  LinkReport,
  AccessibilityReport,
  ImageReport,
} from "./types";

export interface AuditOptions {
  framework?: Framework;
  /** Options for spam analysis */
  spam?: SpamAnalysisOptions;
  /** Skip specific checks */
  skip?: Array<"spam" | "links" | "accessibility" | "images" | "compatibility">;
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
}

const EMPTY_SPAM: SpamReport = { score: 100, level: "low", issues: [] };
const EMPTY_LINKS: LinkReport = {
  totalLinks: 0,
  issues: [],
  breakdown: { https: 0, http: 0, mailto: 0, tel: 0, anchor: 0, javascript: 0, protocolRelative: 0, other: 0 },
};
const EMPTY_ACCESSIBILITY: AccessibilityReport = { score: 100, issues: [] };
const EMPTY_IMAGES: ImageReport = { total: 0, totalDataUriBytes: 0, issues: [], images: [] };

/**
 * Run all email analysis checks in a single call.
 *
 * Returns a unified report with compatibility warnings + scores,
 * spam analysis, link validation, accessibility audit, and image analysis.
 * Use the `skip` option to omit checks you don't need.
 */
export function auditEmail(html: string, options?: AuditOptions): AuditReport {
  if (!html || !html.trim()) {
    return {
      compatibility: { warnings: [], scores: {} },
      spam: EMPTY_SPAM,
      links: EMPTY_LINKS,
      accessibility: EMPTY_ACCESSIBILITY,
      images: EMPTY_IMAGES,
    };
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const framework = options?.framework;
  const skip = new Set(options?.skip ?? []);

  const warnings = skip.has("compatibility") ? [] : analyzeEmail(html, framework);
  const scores = skip.has("compatibility") ? {} : generateCompatibilityScore(warnings);
  const spam = skip.has("spam") ? EMPTY_SPAM : analyzeSpam(html, options?.spam);
  const links = skip.has("links") ? EMPTY_LINKS : validateLinks(html);
  const accessibility = skip.has("accessibility") ? EMPTY_ACCESSIBILITY : checkAccessibility(html);
  const images = skip.has("images") ? EMPTY_IMAGES : analyzeImages(html);

  return { compatibility: { warnings, scores }, spam, links, accessibility, images };
}
