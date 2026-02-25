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

export interface CSSWarning {
  severity: "error" | "warning" | "info";
  client: string;
  property: string;
  message: string;
  suggestion?: string;
  fix?: CodeFix;
  fixIsGenericFallback?: boolean;
  line?: number;
  selector?: string;
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
