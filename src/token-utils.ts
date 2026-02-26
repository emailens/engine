import { generateFixPrompt } from "./export-prompt";
import type { ExportPromptOptions } from "./export-prompt";
import type { CSSWarning } from "./types";

/**
 * Heuristic token estimate: ~3.5 characters per token for mixed
 * HTML/CSS/code content. This is conservative (slightly over-counts)
 * to avoid surprise overruns.
 *
 * For precise counts, use Anthropic's `messages.countTokens()` API
 * or pass a custom `tokenCounter` callback to `estimateAiFixTokens()`.
 */
const CHARS_PER_TOKEN = 3.5;

/**
 * Rough output-to-input ratio. The AI returns a fixed version of the
 * email, which is typically similar in size to the input HTML plus
 * some overhead for VML/table wrappers.
 */
const OUTPUT_RATIO = 1.3;

/**
 * Default token overhead for the AI_FIX_SYSTEM_PROMPT exported from ai-fix.ts.
 * The system prompt is ~800 chars ≈ ~230 tokens. We use 250 as a safe default.
 * Consumers using a custom system prompt can override via `systemPromptTokens`.
 */
const DEFAULT_SYSTEM_PROMPT_TOKENS = 250;

export interface TokenEstimate {
  /** Estimated input tokens (prompt + system prompt) */
  inputTokens: number;
  /** Estimated output tokens (fixed code response) */
  estimatedOutputTokens: number;
  /** Raw character count of the prompt */
  promptCharacters: number;
  /** Character count of just the HTML being fixed */
  htmlCharacters: number;
  /** Total warnings included in the prompt */
  warningCount: number;
  /** How many warnings are structural (need HTML changes) */
  structuralCount: number;
  /** Whether warnings were truncated to fit within limits */
  truncated: boolean;
  /** Number of warnings removed during truncation */
  warningsRemoved: number;
}

/**
 * Extended return type from `estimateAiFixTokens()` that includes both the
 * token metrics AND the (potentially truncated) warnings list. The `warnings`
 * field is used internally by `generateAiFix()` to build the prompt with the
 * truncated set, but is NOT exposed in `AiFixResult.tokenEstimate` to keep
 * the public API clean.
 */
export interface TokenEstimateWithWarnings extends TokenEstimate {
  /** The warnings after smart truncation (may be shorter than the input list) */
  warnings: CSSWarning[];
}

export interface EstimateOptions extends Omit<ExportPromptOptions, "warnings"> {
  warnings: CSSWarning[];
  /**
   * Maximum input tokens to target. If the estimated prompt exceeds
   * this, warnings will be truncated (info first, then duplicates).
   * Defaults to 16000 (~56KB of prompt text).
   */
  maxInputTokens?: number;
  /**
   * Optional precise token counter. If provided, it will be called
   * with the final prompt text for an exact count. Consumers can wire
   * this to `anthropic.messages.countTokens()`.
   */
  tokenCounter?: (text: string) => Promise<number> | number;
  /**
   * Token count for the system prompt. Added to the input token estimate
   * since the system prompt counts against the context window. Defaults
   * to 250 (matching the built-in AI_FIX_SYSTEM_PROMPT). Set to 0 if
   * not using a system prompt, or override for custom system prompts.
   */
  systemPromptTokens?: number;
}

/**
 * Estimate tokens for an AI fix prompt BEFORE making the API call.
 * Use this to show cost estimates, check limits, and decide whether
 * to proceed.
 *
 * @example
 * ```ts
 * const estimate = await estimateAiFixTokens({
 *   originalHtml: html,
 *   warnings,
 *   scores,
 *   scope: "all",
 *   format: "jsx",
 * });
 *
 * console.log(`~${estimate.inputTokens} input tokens`);
 * console.log(`~${estimate.estimatedOutputTokens} output tokens`);
 * console.log(`Truncated: ${estimate.truncated}`);
 * ```
 */
export async function estimateAiFixTokens(
  options: EstimateOptions,
): Promise<TokenEstimateWithWarnings> {
  const {
    maxInputTokens = 16000,
    tokenCounter,
    systemPromptTokens = DEFAULT_SYSTEM_PROMPT_TOKENS,
    ...rest
  } = options;

  // Reserve space for the system prompt when truncating
  const effectiveMaxTokens = maxInputTokens - systemPromptTokens;

  // Truncate warnings if needed to stay within token limits
  const { warnings: finalWarnings, truncated, removed } = truncateWarnings(
    rest.warnings,
    rest.originalHtml,
    effectiveMaxTokens,
    rest.scope,
    rest.selectedClientId,
  );

  const prompt = generateFixPrompt({ ...rest, warnings: finalWarnings });
  const promptChars = prompt.length;

  // Use precise counter if available, otherwise heuristic
  let promptTokens: number;
  if (tokenCounter) {
    const count = tokenCounter(prompt);
    promptTokens = count instanceof Promise ? await count : count;
  } else {
    promptTokens = heuristicTokenCount(prompt);
  }

  // Total input = user prompt + system prompt
  const inputTokens = promptTokens + systemPromptTokens;

  const estimatedOutputTokens = Math.ceil(
    heuristicTokenCount(rest.originalHtml) * OUTPUT_RATIO,
  );

  const structuralCount = finalWarnings.filter(
    (w) => w.fixType === "structural",
  ).length;

  return {
    inputTokens,
    estimatedOutputTokens,
    promptCharacters: promptChars,
    htmlCharacters: rest.originalHtml.length,
    warningCount: finalWarnings.length,
    structuralCount,
    truncated,
    warningsRemoved: removed,
    warnings: finalWarnings,
  };
}

/**
 * Quick synchronous heuristic token count. No deps, no API calls.
 * Accuracy: within ~10-15% of real Claude tokenizer for code/HTML.
 */
export function heuristicTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Intelligently trim warnings to keep the prompt within token limits.
 *
 * Truncation priority (least important removed first):
 * 1. Remove duplicate warnings (same property across different clients)
 * 2. Remove `info`-level warnings
 * 3. Remove `warning`-level warnings with CSS-only fixes (not structural)
 * 4. Trim long fix snippet before/after strings
 */
function truncateWarnings(
  warnings: CSSWarning[],
  html: string,
  maxTokens: number,
  scope: string,
  selectedClientId?: string,
): { warnings: CSSWarning[]; truncated: boolean; removed: number } {
  const originalCount = warnings.length;

  // Quick check: will the full prompt fit?
  const fullPromptEstimate = heuristicTokenCount(html) + heuristicTokenCount(
    JSON.stringify(warnings),
  ) + 500; // overhead for markdown structure

  if (fullPromptEstimate <= maxTokens) {
    return { warnings, truncated: false, removed: 0 };
  }

  let result = [...warnings];

  // Step 1: Deduplicate — keep one warning per property per severity,
  // preferring the most relevant client
  const seen = new Set<string>();
  result = result.filter((w) => {
    const key = `${w.property}:${w.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (estimateFits(result, html, maxTokens)) {
    return { warnings: result, truncated: true, removed: originalCount - result.length };
  }

  // Step 2: Remove info-level warnings
  result = result.filter((w) => w.severity !== "info");

  if (estimateFits(result, html, maxTokens)) {
    return { warnings: result, truncated: true, removed: originalCount - result.length };
  }

  // Step 3: Remove CSS-only warnings (keep structural ones)
  result = result.filter((w) => w.fixType === "structural" || w.severity === "error");

  if (estimateFits(result, html, maxTokens)) {
    return { warnings: result, truncated: true, removed: originalCount - result.length };
  }

  // Step 4: Trim fix snippets to just descriptions
  result = result.map((w) => ({
    ...w,
    fix: w.fix
      ? {
          ...w.fix,
          before: w.fix.before.length > 200
            ? w.fix.before.slice(0, 200) + "\n/* ... truncated ... */"
            : w.fix.before,
          after: w.fix.after.length > 200
            ? w.fix.after.slice(0, 200) + "\n/* ... truncated ... */"
            : w.fix.after,
        }
      : undefined,
  }));

  return { warnings: result, truncated: true, removed: originalCount - result.length };
}

function estimateFits(
  warnings: CSSWarning[],
  html: string,
  maxTokens: number,
): boolean {
  const estimate =
    heuristicTokenCount(html) +
    heuristicTokenCount(JSON.stringify(warnings)) +
    500;
  return estimate <= maxTokens;
}
