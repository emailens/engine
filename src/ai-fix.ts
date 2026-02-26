import { generateFixPrompt } from "./export-prompt";
import type { ExportPromptOptions } from "./export-prompt";
import type { AiProvider, AiFixResult, CSSWarning } from "./types";
import { estimateAiFixTokens } from "./token-utils";

export interface GenerateAiFixOptions extends ExportPromptOptions {
  /** Callback that sends a prompt to an LLM and returns the response text. */
  provider: AiProvider;
  /**
   * Maximum input tokens for the prompt. If the estimated prompt exceeds
   * this, warnings are intelligently truncated (info first, then CSS-only
   * duplicates). Defaults to 16000.
   */
  maxInputTokens?: number;
}

/**
 * Generate an AI-powered fix for email compatibility issues.
 *
 * This uses the deterministic engine's analysis (warnings, scores, fix snippets)
 * to build a structured prompt, then delegates to an LLM for context-aware
 * structural fixes that static snippets cannot handle.
 *
 * The engine stays provider-agnostic — consumers pass their own `AiProvider`
 * callback (Anthropic SDK, Vercel AI SDK, OpenRouter, etc.).
 *
 * @example
 * ```ts
 * import Anthropic from "@anthropic-ai/sdk";
 * import { analyzeEmail, generateCompatibilityScore, generateAiFix } from "@emailens/engine";
 *
 * const anthropic = new Anthropic();
 * const warnings = analyzeEmail(html, "jsx");
 * const scores = generateCompatibilityScore(warnings);
 *
 * // 1. Check cost before calling
 * const estimate = await estimateAiFixTokens({
 *   originalHtml: html, warnings, scores, scope: "all", format: "jsx",
 * });
 * console.log(`~${estimate.inputTokens} input tokens`);
 *
 * // 2. Generate the fix
 * const result = await generateAiFix({
 *   originalHtml: html, warnings, scores, scope: "all", format: "jsx",
 *   provider: async (prompt) => {
 *     const msg = await anthropic.messages.create({
 *       model: "claude-sonnet-4-6",
 *       max_tokens: 8192,
 *       system: AI_FIX_SYSTEM_PROMPT,
 *       messages: [{ role: "user", content: prompt }],
 *     });
 *     return msg.content[0].type === "text" ? msg.content[0].text : "";
 *   },
 * });
 * ```
 */
export async function generateAiFix(
  options: GenerateAiFixOptions,
): Promise<AiFixResult> {
  const { provider, maxInputTokens = 16000, ...promptOptions } = options;

  // Estimate tokens and apply smart truncation if needed
  const estimate = await estimateAiFixTokens({
    ...promptOptions,
    maxInputTokens,
  });

  // Use the truncated warnings from the estimate (not the original list)
  const truncatedWarnings = estimate.warnings;

  // Build the final prompt with the truncated warnings
  const prompt = generateFixPrompt({ ...promptOptions, warnings: truncatedWarnings });

  const structuralCount = countStructuralWarnings(
    truncatedWarnings,
    promptOptions.scope,
    promptOptions.selectedClientId,
  );

  // Strip the warnings list from the estimate to keep the public API clean
  const { warnings: _discarded, ...tokenEstimate } = estimate;

  const response = await provider(prompt);

  // Extract code from the response — the LLM may wrap it in a code fence
  const code = extractCode(response);

  return {
    code,
    prompt,
    targetedWarnings: tokenEstimate.warningCount,
    structuralCount,
    tokenEstimate,
  };
}

/**
 * System prompt for the AI fix provider. Consumers should pass this as
 * the `system` parameter to their LLM call for best results.
 */
export const AI_FIX_SYSTEM_PROMPT = `You are an expert email developer specializing in cross-client HTML email compatibility. You fix emails to render correctly across all email clients.

Rules:
- Return ONLY the fixed code inside a single code fence. No explanations before or after.
- Preserve all existing content, text, links, and visual design.
- For structural issues (fixType: "structural"), you MUST restructure the HTML — CSS-only changes will not work.
- Common structural patterns:
  - word-break/overflow-wrap unsupported → wrap text in <table><tr><td> with constrained width
  - display:flex/grid → convert to <table> layout (match the original column count and proportions)
  - border-radius in Outlook → use VML <v:roundrect> with <!--[if mso]> conditionals
  - background-image in Outlook → use VML <v:rect> with <v:fill>
  - max-width in Outlook → wrap in <!--[if mso]><table width="N"> conditional
  - position:absolute → use <table> cells for layout
  - <svg> → replace with <img> pointing to a hosted PNG
- For CSS-only issues (fixType: "css"), swap properties or add fallbacks.
- Apply ALL fixes from the issues list — do not skip any.
- Use the framework syntax specified (JSX/MJML/Maizzle/HTML).
- For JSX: use camelCase style props, React Email components, and proper TypeScript types.
- For MJML: use mj-* elements and attributes.
- For Maizzle: use Tailwind CSS classes.`;

function countStructuralWarnings(
  warnings: CSSWarning[],
  scope: string,
  selectedClientId?: string,
): number {
  const filtered =
    scope === "current" && selectedClientId
      ? warnings.filter((w) => w.client === selectedClientId)
      : warnings;
  return filtered.filter((w) => w.fixType === "structural").length;
}

/**
 * Extract code from an LLM response that may contain markdown code fences.
 * If multiple fences exist, returns the largest one (most likely the full
 * fixed email rather than a small snippet).
 */
function extractCode(response: string): string {
  // Find all code fences and pick the largest one
  const fencePattern = /```(?:[\w]*)\n([\s\S]*?)```/g;
  let largest: string | null = null;

  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(response)) !== null) {
    const content = match[1].trim();
    if (largest === null || content.length > largest.length) {
      largest = content;
    }
  }

  if (largest !== null) {
    return largest;
  }

  // If no code fence, return the whole response trimmed
  return response.trim();
}
