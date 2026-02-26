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
