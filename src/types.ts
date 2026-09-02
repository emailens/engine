import type { ClientId } from "./rules/css-support";

export type SupportLevel = "supported" | "partial" | "unsupported" | "unknown";

export type Framework = "jsx" | "mjml" | "maizzle";
export type InputFormat = "html" | Framework;

export interface EmailClient {
  /**
   * Not a free string: the matrix answers for exactly these clients, so a
   * client we ship without a column (or a column with no client) is a compile
   * error rather than a silently empty section of every report.
   */
  id: ClientId;
  name: string;
  category: "webmail" | "desktop" | "mobile";
  engine: string;
  darkModeSupport: boolean;
  icon: string;
  deprecated?: string;
}

export type Severity = "error" | "warning" | "info";

/**
 * Where an issue lives in the analyzed HTML.
 *
 * Lines and columns are 1-based; `offset` is a 0-based character index into
 * the HTML string. Populated only when the analysis ran with `positions: true`,
 *and only for findings that belong to a specific node, so document-level
 * findings (email size, aggregate spam signals) leave it undefined.
 */
export interface SourceLocation {
  /** 1-based line in the original HTML string. */
  line: number;
  /** 1-based column. */
  column: number;
  endLine: number;
  endColumn: number;
  /** 0-based character offset, for consumers that prefer offsets. */
  offset: number;
  length: number;
}

/** Shared shape for every analyzer's issue objects. */
export interface BaseIssue {
  rule: string;
  severity: Severity;
  message: string;
  /** Position of the first occurrence in the source HTML. Requires `positions: true`. */
  loc?: SourceLocation;
  /**
   * Every occurrence, in document order; `loc` is the first of them.
   *
   * Present on analyzers that report one issue per *kind* of problem rather
   * than one per element (overflow, visual). Analyzers that already emit an
   * issue per element carry `loc` alone. Capped at {@link MAX_WARNING_LOCATIONS}.
   */
  locs?: SourceLocation[];
  /** `locs` hit the cap and does not list every occurrence. */
  locsTruncated?: boolean;
}

export interface CodeFix {
  before: string;
  after: string;
  language: "html" | "css" | "jsx" | "mjml" | "maizzle";
  description: string;
}

export type FixType = "css" | "structural";

export interface CSSWarning {
  severity: Severity;
  client: string;
  property: string;
  message: string;
  suggestion?: string;
  fix?: CodeFix;
  fixIsGenericFallback?: boolean;
  fixType?: FixType;
  /**
   * @deprecated Use `loc`. Without `positions: true` this is the line within
   * the `<style>` block that declared the property (and is absent for inline
   * styles); with positions on it is `loc.line`, i.e. absolute in the document.
   */
  line?: number;
  selector?: string;
  /** Position of the first occurrence in the source HTML. Requires `positions: true`. */
  loc?: SourceLocation;
  /**
   * Every occurrence, in document order; `loc` is the first of them.
   *
   * Warnings are deduplicated per client, property, severity and `selector`,
   * so twelve elements the analyzer describes the same way collapse into one
   * warning; this is how a consumer reaches the other eleven. Elements
   * described differently (`div.card` vs `span`) still produce separate
   * warnings for the same property, so a consumer that wants every place a
   * property breaks should union `locs` across the warnings for that property.
   * Ordered by position, capped at {@link MAX_WARNING_LOCATIONS}.
   */
  locs?: SourceLocation[];
  /**
   * `locs` hit the cap and does not list every occurrence.
   *
   * A consumer that acts on all of them (an editor applying a fix everywhere)
   * needs to know the list is partial rather than infer it from the length.
   */
  locsTruncated?: boolean;
}

/**
 * Callback that sends a prompt to an LLM and returns the text response.
 * Consumers bring their own AI provider (Anthropic SDK, Vercel AI, etc.).
 */
export type AiProvider = (prompt: string) => Promise<string>;

export interface AiFixResult {
  /** The fixed email code returned by the AI */
  code: string;
  /** The raw prompt that was sent to the AI */
  prompt: string;
  /** Number of warnings the fix was targeting */
  targetedWarnings: number;
  /** How many of those had fixType: "structural" */
  structuralCount: number;
  /** Token estimate for the AI call */
  tokenEstimate: import("./token-utils").TokenEstimate;
}

export interface TransformResult {
  clientId: string;
  html: string;
  warnings: CSSWarning[];
}

export interface PreviewResult {
  id: string;
  originalHtml: string;
  transforms: TransformResult[];
  cssReport: CSSWarning[];
  createdAt: string;
}

export interface DiffResult {
  clientId: string;
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  fixed: CSSWarning[];
  introduced: CSSWarning[];
  unchanged: CSSWarning[];
}

// ─── Spam scoring ────────────────────────────────────────────────────────────

export interface SpamIssue extends BaseIssue {
  detail?: string;
}

export interface SpamReport {
  score: number;
  level: "low" | "medium" | "high";
  issues: SpamIssue[];
}

export interface SpamAnalysisOptions {
  /** Value of the List-Unsubscribe header, if present */
  listUnsubscribeHeader?: string;
  /** Value of the List-Unsubscribe-Post header (RFC 8058 one-click unsubscribe) */
  listUnsubscribePostHeader?: string;
  /** Type of email: transactional emails are exempt from unsubscribe requirements */
  emailType?: "marketing" | "transactional";
}

// ─── Link validation ─────────────────────────────────────────────────────────

export interface LinkIssue extends BaseIssue {
  href?: string;
  text?: string;
}

/**
 * One anchor, as found. The link equivalent of `ImageInfo`.
 *
 * Exists so a consumer can act per-link (resolve, rewrite, report) without
 * re-parsing HTML the engine has already parsed. `LinkReport` used to carry
 * only counts and the links that had problems, which made the clean ones
 * unreachable, and those are exactly the ones worth resolving.
 */
export interface LinkInfo {
  /**
   * The href exactly as written, never truncated. `LinkIssue.href` is clipped
   * for display; this one is not, because a clipped URL cannot be fetched and
   * fetching is the reason this inventory exists.
   */
  href: string;
  /** Visible text, bounded at 80 characters as the issues are. */
  text: string;
  scheme:
    | "https" | "http" | "mailto" | "tel"
    | "anchor" | "javascript" | "protocol-relative" | "empty" | "other";
  /** `#`, empty, or a `javascript:void` stand-in: a link that goes nowhere. */
  isPlaceholder: boolean;
  /** Rule names that fired for this link, mirroring `ImageInfo.issues`. */
  issues: string[];
}

export interface LinkReport {
  totalLinks: number;
  issues: LinkIssue[];
  /** Every anchor in the email, in document order. */
  links: LinkInfo[];
  breakdown: {
    https: number;
    http: number;
    mailto: number;
    tel: number;
    anchor: number;
    javascript: number;
    protocolRelative: number;
    other: number;
  };
}

// ─── Accessibility checking ──────────────────────────────────────────────────

export interface AccessibilityIssue extends BaseIssue {
  element?: string;
  details?: string;
}

export interface AccessibilityReport {
  score: number;
  issues: AccessibilityIssue[];
}

// ─── Image analysis ──────────────────────────────────────────────────────────

export interface ImageIssue extends BaseIssue {
  src?: string;
}

export interface ImageInfo {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
  isTrackingPixel: boolean;
  dataUriBytes: number;
  issues: string[];
}

export interface ImageReport {
  total: number;
  totalDataUriBytes: number;
  issues: ImageIssue[];
  images: ImageInfo[];
}

// ─── Inbox preview ──────────────────────────────────────────────────────────

export interface InboxPreviewIssue extends BaseIssue {}

export interface ClientTruncation {
  client: string;
  subjectLimit: number;
  preheaderLimit: number;
  truncatedSubject: string | null;
  truncatedPreheader: string | null;
  subjectTruncated: boolean;
  preheaderTruncated: boolean;
}

export interface InboxPreview {
  subject: string | null;
  preheader: string | null;
  subjectLength: number;
  preheaderLength: number;
  truncation: ClientTruncation[];
  issues: InboxPreviewIssue[];
}

// ─── Size checking ──────────────────────────────────────────────────────────

export interface SizeIssue extends BaseIssue {
  detail?: string;
}

export interface SizeReport {
  htmlBytes: number;
  /** Bytes of CSS inside `<style>` elements, summed across all of them. */
  styleBytes: number;
  humanSize: string;
  clipped: boolean;
  issues: SizeIssue[];
}

// ─── Style survival (will the client keep the CSS at all) ───────────────────

export interface StyleSurvivalIssue extends BaseIssue {
  /**
   * The clients that discard the CSS. Required, not optional: the consuming
   * app groups findings per client, and an issue that cannot name its clients
   * does not surface at all.
   */
  clients: string[];
  detail?: string;
  /**
   * Where in the framework's source the offending CSS came from. Present only
   * when the caller named a framework: the stylesheet that ships is assembled
   * by the compiler, so "edit your <style> block" is the wrong instruction for
   * someone whose source has no <style> block.
   */
  frameworkNote?: string;
}

export interface StyleSurvivalReport {
  issues: StyleSurvivalIssue[];
}

// ─── Content overflow (layout) ──────────────────────────────────────────────

export interface OverflowIssue extends BaseIssue {
  detail?: string;
}

export interface OverflowReport {
  /** True when any content is likely to overflow the email frame / viewport. */
  hasOverflow: boolean;
  issues: OverflowIssue[];
}

// ─── VML (Outlook-only markup inside conditional comments) ──────────────────

export interface VmlIssue extends BaseIssue {
  detail?: string;
}

export interface VmlReport {
  /** True when the email contains any VML inside Outlook conditional comments. */
  hasVml: boolean;
  issues: VmlIssue[];
}

// ─── Visual rendering bugs (stylized emails) ────────────────────────────────

export interface VisualIssue extends BaseIssue {
  detail?: string;
  /** Concrete correction to apply (e.g. a background-color / font-family line). */
  fix?: string;
}

export interface VisualReport {
  issues: VisualIssue[];
}

// ─── Template variable detection ────────────────────────────────────────────

export interface TemplateIssue extends BaseIssue {
  variable: string;
  location: "text" | "attribute";
}

export interface TemplateReport {
  unresolvedCount: number;
  issues: TemplateIssue[];
}

// ─── Deliverability checking ─────────────────────────────────────────────────

export interface DeliverabilityCheck {
  name: "spf" | "dkim" | "dmarc" | "mx" | "bimi";
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  detail?: string;
  record?: string;
}

export interface DeliverabilityReport {
  domain: string;
  checks: DeliverabilityCheck[];
  score: number;
  issues: DeliverabilityIssue[];
}

export interface DeliverabilityIssue extends BaseIssue {
  detail?: string;
}

// ─── Design consistency ──────────────────────────────────────────────────────

export interface DesignIssue extends BaseIssue {
  detail?: string;
  /** The values the issue is about, for a UI that wants to show them. */
  values?: string[];
}

export interface DesignReport {
  issues: DesignIssue[];
  /** Everything the email actually uses: a readout of its de facto system. */
  palette: {
    colors: string[];
    backgrounds: string[];
    fontSizes: string[];
    fontFamilies: string[];
    radii: string[];
  };
}
