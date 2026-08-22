import { analyzeEmailFromDom, generateCompatibilityScore } from "./analyze";
import { analyzeSpamFromDom } from "./spam-scorer";
import { validateLinksFromDom } from "./link-validator";
import { checkAccessibilityFromDom } from "./accessibility-checker";
import { analyzeImagesFromDom } from "./image-analyzer";
import { extractInboxPreviewFromDom } from "./inbox-preview";
import { checkSizeFromDom } from "./size-checker";
import { checkTemplateVariablesFromDom } from "./template-checker";
import { checkOverflowFromDom } from "./overflow-checker";
import { checkVisualFromDom } from "./visual-checker";
import { transformForClient, transformForAllClients } from "./transform";
import { simulateDarkMode } from "./dark-mode";
import {
  MAX_HTML_SIZE,
  EMPTY_SPAM, EMPTY_LINKS, EMPTY_ACCESSIBILITY, EMPTY_IMAGES,
  EMPTY_INBOX_PREVIEW, EMPTY_SIZE, EMPTY_TEMPLATE, EMPTY_OVERFLOW, EMPTY_VISUAL,
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
  OverflowReport,
  VisualReport,
  TransformResult,
} from "./types";
import { loadHtml, type ParseOptions } from "./parse-html";
import { runAudit, EMPTY_AUDIT } from "./audit";
import type { AuditOptions, AuditReport } from "./audit";

export interface CreateSessionOptions extends ParseOptions {
  /** Framework for fix snippets (applies to analyze/audit/transform). */
  framework?: Framework;
}

/**
 * A pre-parsed email session.
 *
 * Analysis methods (`analyze`, `audit`, `analyzeSpam`, `validateLinks`,
 * `checkAccessibility`, `analyzeImages`) share a single Cheerio DOM
 * parse, eliminating redundant parsing overhead.
 *
 * Transformation methods (`transformForClient`, `transformForAllClients`,
 * `simulateDarkMode`) parse internally since they mutate the DOM per
 * client. They still benefit from having the session hold the HTML and
 * framework so you don't need to pass them repeatedly.
 */
export interface EmailSession {
  /** The original HTML string. */
  readonly html: string;

  /** The framework set at session creation. */
  readonly framework: Framework | undefined;

  /**
   * Run all analysis checks in one call (shares pre-parsed DOM).
   *
   * Equivalent to `auditEmail()` but avoids re-parsing the HTML.
   *
   * `positions` is not accepted here: source positions are recorded at parse
   * time, so the session's own option decides, and a per-call flag could only
   * be ignored. Pass it to `createSession()` instead.
   */
  audit(options?: Omit<AuditOptions, "framework" | "positions">): AuditReport;

  /**
   * Analyze CSS compatibility warnings (shares pre-parsed DOM).
   *
   * Equivalent to `analyzeEmail()` but avoids re-parsing the HTML.
   */
  analyze(): CSSWarning[];

  /** Generate per-client compatibility scores from warnings. */
  score(
    warnings: CSSWarning[],
  ): Record<string, { score: number; errors: number; warnings: number; info: number }>;

  /** Analyze spam indicators (shares pre-parsed DOM). */
  analyzeSpam(options?: SpamAnalysisOptions): SpamReport;

  /** Validate links (shares pre-parsed DOM). */
  validateLinks(): LinkReport;

  /** Check accessibility (shares pre-parsed DOM). */
  checkAccessibility(): AccessibilityReport;

  /** Analyze images (shares pre-parsed DOM). */
  analyzeImages(): ImageReport;

  /** Extract subject line and preheader text (shares pre-parsed DOM). */
  extractInboxPreview(): InboxPreview;

  /** Check email size for Gmail clipping (needs raw HTML for byte count). */
  checkSize(): SizeReport;

  /** Scan for unresolved template/merge variables (shares pre-parsed DOM). */
  checkTemplateVariables(): TemplateReport;

  /** Detect content likely to overflow the frame / viewport (shares pre-parsed DOM). */
  checkOverflow(): OverflowReport;

  /** Detect probable visual bugs in stylized emails, with fixes (shares pre-parsed DOM). */
  checkVisual(): VisualReport;

  /**
   * Transform HTML for a specific client.
   *
   * Creates an isolated DOM copy per call (transforms mutate the DOM).
   */
  transformForClient(clientId: string): TransformResult;

  /**
   * Transform HTML for all email clients.
   *
   * Creates an isolated DOM copy per client (transforms mutate the DOM).
   */
  transformForAllClients(): TransformResult[];

  /**
   * Simulate dark mode for a specific client.
   *
   * Creates an isolated DOM copy per call (simulation mutates the DOM).
   * Operates on the **original** HTML — if you need dark mode on
   * already-transformed HTML, use the standalone `simulateDarkMode()` instead.
   */
  simulateDarkMode(clientId: string): { html: string; warnings: CSSWarning[] };

}

/**
 * Create a session that pre-parses the HTML once and shares the parsed
 * DOM across all read-only analysis operations.
 *
 * Use this when you need to call multiple analysis functions on the
 * same HTML — it eliminates redundant `cheerio.load()` calls.
 *
 * @example
 * ```typescript
 * import { createSession } from "@emailens/engine";
 *
 * const session = createSession(html, { framework: "jsx" });
 *
 * // These all share a single DOM parse:
 * const warnings = session.analyze();
 * const scores = session.score(warnings);
 * const spam = session.analyzeSpam();
 * const links = session.validateLinks();
 * const a11y = session.checkAccessibility();
 * const images = session.analyzeImages();
 *
 * // Or run everything at once:
 * const report = session.audit();
 *
 * // Transforms still work (parse internally per client):
 * const transforms = session.transformForAllClients();
 * ```
 */
export function createSession(
  html: string,
  options?: CreateSessionOptions,
): EmailSession {
  if (!html || !html.trim()) {
    // Return a no-op session for empty input
    const fw = options?.framework;
    return {
      html: html || "",
      framework: fw,
      audit: () => EMPTY_AUDIT,
      analyze: () => [],
      score: () => ({}),
      analyzeSpam: () => EMPTY_SPAM,
      validateLinks: () => EMPTY_LINKS,
      checkAccessibility: () => EMPTY_ACCESSIBILITY,
      analyzeImages: () => EMPTY_IMAGES,
      extractInboxPreview: () => EMPTY_INBOX_PREVIEW,
      checkSize: () => EMPTY_SIZE,
      checkTemplateVariables: () => EMPTY_TEMPLATE,
      checkOverflow: () => EMPTY_OVERFLOW,
      checkVisual: () => EMPTY_VISUAL,
      transformForClient: (clientId) => ({ clientId, html: html || "", warnings: [] }),
      transformForAllClients: () => [],
      simulateDarkMode: (clientId) => ({ html: html || "", warnings: [] }),
    };
  }

  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  // Parse once — shared across all read-only analysis operations
  const $ = loadHtml(html, options);
  const framework = options?.framework;

  return {
    html,
    framework,

    audit(opts) {
      return runAudit($, html, framework, opts);
    },

    analyze() {
      return analyzeEmailFromDom($, framework);
    },

    score(warnings) {
      return generateCompatibilityScore(warnings);
    },

    analyzeSpam(opts) {
      return analyzeSpamFromDom($, opts);
    },

    validateLinks() {
      return validateLinksFromDom($);
    },

    checkAccessibility() {
      return checkAccessibilityFromDom($);
    },

    analyzeImages() {
      return analyzeImagesFromDom($);
    },

    extractInboxPreview() {
      return extractInboxPreviewFromDom($);
    },

    checkSize() {
      return checkSizeFromDom($, html);
    },

    checkTemplateVariables() {
      return checkTemplateVariablesFromDom($);
    },

    checkOverflow() {
      return checkOverflowFromDom($);
    },

    checkVisual() {
      return checkVisualFromDom($);
    },

    // Transforms create isolated copies since they mutate the DOM
    transformForClient(clientId) {
      return transformForClient(html, clientId, framework);
    },

    transformForAllClients() {
      return transformForAllClients(html, framework);
    },

    simulateDarkMode(clientId) {
      return simulateDarkMode(html, clientId);
    },
  };
}
