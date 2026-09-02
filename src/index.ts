export { EMAIL_CLIENTS, getClient } from "./clients";
export { transformForClient, transformForAllClients } from "./transform";
export { analyzeEmail, generateCompatibilityScore, warningsForClient, errorWarnings, structuralWarnings } from "./analyze";
export { simulateDarkMode } from "./dark-mode";
export { getCodeFix, getSuggestion } from "./fix-snippets";
export { diffResults } from "./diff";
export { generateFixPrompt } from "./export-prompt";
export { generateAiFix, AI_FIX_SYSTEM_PROMPT } from "./ai-fix";
export { estimateAiFixTokens, heuristicTokenCount } from "./token-utils";
export {
  STRUCTURAL_FIX_PROPERTIES, CSS_SUPPORT, SUPPORT_CLIENTS,
  HTML_ELEMENT_FEATURES, HTML_ATTRIBUTE_FEATURES, HTML_MISC_FEATURES,
  AT_RULE_FEATURES, COMPOUND_VALUE_FEATURES, SELECTOR_FEATURES,
  CSS_FUNCTION_FEATURES, CSS_PROPERTY_FEATURES, GRACEFUL_FEATURES,
  IMAGE_FORMATS, FEATURE_LAST_TESTED,
} from "./rules/css-support";
// The key and client unions, so a consumer building its own table is held to
// the same spellings the engine is.
export type { FeatureKey, ClientId, ImageFormat } from "./rules/css-support";
export { CSS_SUPPORT_NOTES, IMAGE_SUPPORT, IMAGE_SUPPORT_NOTES } from "./rules/css-support";
export { checkStyleSurvival } from "./style-survival";
export { FEATURE_URLS, featureUrl } from "./rules/feature-urls";
// So a consumer showing the support table can answer the same question the
// analyzer answers: is this client's caveat about the value in front of me?
// Without it a hover says "partial in 7 clients" over a line the linter is
// deliberately silent about.
export { caveatApplies, VALUE_CAVEAT_PROPS } from "./rules/value-caveats";
export { analyzeSpam } from "./spam-scorer";
// checkDeliverability and checkSpamAssassin use Node.js builtins (dns, child_process)
// and are exported from "@emailens/engine/server" to avoid breaking client-side bundles.
export { validateLinks } from "./link-validator";
export { checkAccessibility, checkDarkModeContrast, checkMobileContrast, checkDarkStylesContrastFromDom } from "./accessibility-checker";
export type { RenderContext } from "./accessibility-checker";
export { analyzeImages } from "./image-analyzer";
export { extractInboxPreview } from "./inbox-preview";
export { checkSize } from "./size-checker";
export { checkTemplateVariables } from "./template-checker";
export { checkOverflow } from "./overflow-checker";
export { checkVml } from "./vml-checker";
export { renderOutlookBranch, resolveMsoBranch, vmlToCss, arcsizeToRadius } from "./vml-render";
export { checkVisual } from "./visual-checker";
export { checkDesignConsistency } from "./design-consistency";
export { auditEmail } from "./audit";
export { toPlainText } from "./plain-text";
export { createSession } from "./session";
export { CompileError } from "./compile/errors";
export { GENERIC_LINK_TEXT, MAX_HTML_SIZE, MAX_WARNING_LOCATIONS } from "./constants";
export { EMPTY_DELIVERABILITY } from "./constants";
export type { RGBA, WcagGrade } from "./color-utils";
export type { DeliverabilityCheck, DeliverabilityReport, DeliverabilityIssue } from "./types";
// SpamAssassinResult, SpamAssassinOptions are re-exported from "@emailens/engine/server"
export { parseColor, formatRgb, relativeLuminance, contrastRatio, wcagGrade, alphaBlend, rgbToOklab, colorDistance } from "./color-utils";
export { downlevelCSS } from "./downlevel";
export type { ExportPromptOptions, ExportScope } from "./export-prompt";
export type { GenerateAiFixOptions } from "./ai-fix";
export type { TokenEstimate, TokenEstimateWithWarnings, EstimateOptions } from "./token-utils";
export type { AuditOptions, AuditReport } from "./audit";
export type { ParseOptions } from "./parse-html";
export type { EmailSession, CreateSessionOptions } from "./session";
export type { SandboxStrategy, CompileReactEmailOptions } from "./compile/react-email";
export type {
  Severity,
  SourceLocation,
  BaseIssue,
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
  LinkInfo,
  LinkIssue,
  LinkReport,
  AccessibilityIssue,
  AccessibilityReport,
  ImageIssue,
  ImageInfo,
  ImageReport,
  InboxPreviewIssue,
  InboxPreview,
  ClientTruncation,
  SizeIssue,
  SizeReport,
  TemplateIssue,
  TemplateReport,
  OverflowIssue,
  VmlIssue,
  VmlReport,
  OverflowReport,
  VisualIssue,
  VisualReport,
  DesignIssue,
  DesignReport,
} from "./types";
