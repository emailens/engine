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
} from "./types";
