export { EMAIL_CLIENTS, getClient } from "./clients";
export { transformForClient, transformForAllClients } from "./transform";
export { analyzeEmail, generateCompatibilityScore } from "./analyze";
export { simulateDarkMode } from "./dark-mode";
export { getCodeFix, getSuggestion } from "./fix-snippets";
export { diffResults } from "./diff";
export { generateFixPrompt } from "./export-prompt";
export { generateAiFix, AI_FIX_SYSTEM_PROMPT } from "./ai-fix";
export { estimateAiFixTokens, heuristicTokenCount } from "./token-utils";
export { STRUCTURAL_FIX_PROPERTIES } from "./rules/css-support";
export { analyzeSpam } from "./spam-scorer";
export { validateLinks } from "./link-validator";
export { checkAccessibility } from "./accessibility-checker";
export { analyzeImages } from "./image-analyzer";
export { GENERIC_LINK_TEXT } from "./constants";
export type { RGBA, WcagGrade } from "./color-utils";
export { parseColor, relativeLuminance, contrastRatio, wcagGrade, alphaBlend } from "./color-utils";
export type { ExportPromptOptions, ExportScope } from "./export-prompt";
export type { GenerateAiFixOptions } from "./ai-fix";
export type { TokenEstimate, TokenEstimateWithWarnings, EstimateOptions } from "./token-utils";
export type {
  EmailClient,
  CSSWarning,
  CodeFix,
  FixType,
  Framework,
  InputFormat,
  TransformResult,
  PreviewResult,
  DiffResult,
  SupportLevel,
  AiProvider,
  AiFixResult,
  SpamIssue,
  SpamReport,
  SpamAnalysisOptions,
  LinkIssue,
  LinkReport,
  AccessibilityIssue,
  AccessibilityReport,
  ImageIssue,
  ImageInfo,
  ImageReport,
} from "./types";
