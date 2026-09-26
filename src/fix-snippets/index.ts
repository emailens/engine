import type { CodeFix, Framework } from "../types";

import { HTML_FIX_DATABASE } from "./html-fixes";
import { JSX_FIX_DATABASE } from "./jsx-fixes";
import { MJML_FIX_DATABASE } from "./mjml-fixes";
import { MAIZZLE_FIX_DATABASE } from "./maizzle-fixes";

import { HTML_SUGGESTION_DATABASE } from "./html-suggestions";
import { JSX_SUGGESTION_DATABASE } from "./jsx-suggestions";
import { MJML_SUGGESTION_DATABASE } from "./mjml-suggestions";
import { MAIZZLE_SUGGESTION_DATABASE } from "./maizzle-suggestions";
import { FRAMEWORK_MARKUP_SUGGESTIONS, STYLE_SURVIVAL_NOTES } from "./framework-markup";

/**
 * Inline code fix snippets: real, paste-ready code that turns
 * "here's your problem" into "here's your solution."
 *
 * Keyed by property, with optional client-specific overrides.
 * Client-specific keys use the format "property::clientPrefix"
 * (e.g. "border-radius::outlook").
 */
const FIX_DATABASE: Record<string, CodeFix> = {
  ...HTML_FIX_DATABASE,
  ...JSX_FIX_DATABASE,
  ...MJML_FIX_DATABASE,
  ...MAIZZLE_FIX_DATABASE,
};

/**
 * Human-readable suggestion strings attached to CSSWarning.suggestion.
 *
 * Key format mirrors FIX_DATABASE:
 *   property                          → generic HTML advice
 *   property::clientPrefix            → client-specific advice
 *   property::framework               → framework-specific advice
 *   property::clientPrefix::framework → most-specific advice
 *
 * Use `getSuggestion()` to resolve the best match via tiered lookup.
 */
const SUGGESTION_DATABASE: Record<string, string> = {
  ...HTML_SUGGESTION_DATABASE,
  ...JSX_SUGGESTION_DATABASE,
  ...MJML_SUGGESTION_DATABASE,
  ...MAIZZLE_SUGGESTION_DATABASE,
  // Advice about markup the compiler wrote rather than the author. Last,
  // because these are the general answer for a feature and any of the
  // per-framework files above should win if it has something sharper to say.
  ...FRAMEWORK_MARKUP_SUGGESTIONS,
};

/**
 * Where in the framework's source the CSS a style-survival rule found came
 * from. Returns undefined without a framework, and for a rule with nothing
 * framework-specific to say.
 */
export function getStyleSurvivalNote(
  rule: string,
  framework?: Framework,
): string | undefined {
  return framework ? STYLE_SURVIVAL_NOTES[`${rule}::${framework}`] : undefined;
}

/**
 * Most specific entry wins:
 * property::clientPrefix::framework, property::framework,
 * property::clientPrefix, property.
 * `generic` is true when a framework was asked for and only tier 3 or 4 hit.
 */
function lookup<T>(
  db: Record<string, T>,
  property: string,
  clientId: string,
  framework?: Framework,
): { value: T; generic: boolean } | undefined {
  const clientPrefix = getClientPrefix(clientId);
  const tier1 = framework && clientPrefix ? db[`${property}::${clientPrefix}::${framework}`] : undefined;
  if (tier1) return { value: tier1, generic: false };
  const tier2 = framework ? db[`${property}::${framework}`] : undefined;
  if (tier2) return { value: tier2, generic: false };
  const tier3 = clientPrefix ? db[`${property}::${clientPrefix}`] : undefined;
  if (tier3) return { value: tier3, generic: !!framework };
  const tier4 = db[property];
  return tier4 ? { value: tier4, generic: !!framework } : undefined;
}

/** Code fix for a property, client, and optional framework. Undefined if none exists. */
export function getCodeFix(
  property: string,
  clientId: string,
  framework?: Framework
): CodeFix | undefined {
  return lookup(FIX_DATABASE, property, clientId, framework)?.value;
}

/**
 * True when a framework was specified but the fix is a client-specific or
 * generic entry, or there is no fix at all.
 */
export function isCodeFixGenericFallback(
  property: string,
  clientId: string,
  framework?: Framework
): boolean {
  if (!framework) return false;
  const hit = lookup(FIX_DATABASE, property, clientId, framework);
  return !hit || hit.generic;
}

function getClientPrefix(clientId: string): string | null {
  if (clientId === "outlook-windows-legacy") return "outlook"; // Word engine; VML fixes
  if (clientId === "outlook-windows") return null; // New Outlook; web engine, no special fixes
  if (clientId.startsWith("outlook")) return null; // Outlook web is more standards-compliant
  if (clientId.startsWith("gmail")) return "gmail";
  if (clientId.startsWith("apple-mail")) return "apple";
  if (clientId === "yahoo-mail") return "yahoo";
  if (clientId === "samsung-mail") return "samsung";
  return null;
}

/**
 * How a feature key reads mid-sentence. Kept in step with analyze.ts's
 * `featureLabel`, so a warning's message and its suggestion do not describe the
 * same finding in two different languages.
 */
function describeFeature(property: string): string {
  if (property.startsWith("[")) return `The ${property.slice(1, -1)} attribute`;
  if (property.startsWith("<") || property.startsWith("@")) return `\`${property}\``;
  return `"${property}"`;
}

export function getSuggestion(
  property: string,
  clientId: string,
  framework?: Framework
): { text: string; isGenericFallback: boolean } {
  const hit = lookup(SUGGESTION_DATABASE, property, clientId, framework);
  if (hit) return { text: hit.value, isGenericFallback: hit.generic };
  return {
    text: `${describeFeature(property)} is not supported in this email client.`,
    isGenericFallback: !!framework,
  };
}
