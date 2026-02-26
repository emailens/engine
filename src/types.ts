export type SupportLevel = "supported" | "partial" | "unsupported" | "unknown";

export type Framework = "jsx" | "mjml" | "maizzle";
export type InputFormat = "html" | Framework;

export interface EmailClient {
  id: string;
  name: string;
  category: "webmail" | "desktop" | "mobile";
  engine: string;
  darkModeSupport: boolean;
  icon: string;
}

export interface CSSRule {
  property: string;
  support: Record<string, SupportLevel>;
  notes?: Record<string, string>;
}

export interface CodeFix {
  before: string;
  after: string;
  language: "html" | "css" | "jsx" | "mjml" | "maizzle";
  description: string;
}

export type FixType = "css" | "structural";

export interface CSSWarning {
  severity: "error" | "warning" | "info";
  client: string;
  property: string;
  message: string;
  suggestion?: string;
  fix?: CodeFix;
  fixIsGenericFallback?: boolean;
  fixType?: FixType;
  line?: number;
  selector?: string;
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

export interface SpamIssue {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
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
  /** Type of email — transactional emails are exempt from unsubscribe requirements */
  emailType?: "marketing" | "transactional";
}

// ─── Link validation ─────────────────────────────────────────────────────────

export interface LinkIssue {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  href?: string;
  text?: string;
}

export interface LinkReport {
  totalLinks: number;
  issues: LinkIssue[];
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

export interface AccessibilityIssue {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  element?: string;
  details?: string;
}

export interface AccessibilityReport {
  score: number;
  issues: AccessibilityIssue[];
}

// ─── Image analysis ──────────────────────────────────────────────────────────

export interface ImageIssue {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
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
