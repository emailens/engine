export { EMAIL_CLIENTS, getClient } from "./clients";
export { transformForClient, transformForAllClients } from "./transform";
export { analyzeEmail, generateCompatibilityScore } from "./analyze";
export { simulateDarkMode } from "./dark-mode";
export { getCodeFix, getSuggestion } from "./fix-snippets";
export { diffResults } from "./diff";
export { generateFixPrompt } from "./export-prompt";
export type { ExportPromptOptions, ExportScope } from "./export-prompt";
export type {
  EmailClient,
  CSSWarning,
  CodeFix,
  Framework,
  InputFormat,
  TransformResult,
  PreviewResult,
  DiffResult,
  SupportLevel,
} from "./types";
