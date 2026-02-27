import type { CodeFix, Framework } from "../types";

import { HTML_FIX_DATABASE } from "./html-fixes";
import { JSX_FIX_DATABASE } from "./jsx-fixes";
import { MJML_FIX_DATABASE } from "./mjml-fixes";
import { MAIZZLE_FIX_DATABASE } from "./maizzle-fixes";

import { HTML_SUGGESTION_DATABASE } from "./html-suggestions";
import { JSX_SUGGESTION_DATABASE } from "./jsx-suggestions";
import { MJML_SUGGESTION_DATABASE } from "./mjml-suggestions";
import { MAIZZLE_SUGGESTION_DATABASE } from "./maizzle-suggestions";

/**
 * Inline code fix snippets — real, paste-ready code that turns
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
};

/**
 * Look up a code fix for a given property, client, and optional framework.
 * Returns undefined if no fix snippet exists.
 *
 * Resolution order (most specific to least specific):
 * 1. property::clientPrefix::framework  (e.g. "display:flex::outlook::jsx")
 * 2. property::framework                (e.g. "display:grid::jsx")
 * 3. property::clientPrefix             (e.g. "border-radius::outlook")
 * 4. property                           (generic fix)
 */
export function getCodeFix(
  property: string,
  clientId: string,
  framework?: Framework
): CodeFix | undefined {
  const clientPrefix = getClientPrefix(clientId);

  // Tier 1: property::clientPrefix::framework
  if (framework && clientPrefix) {
    const tier1 = FIX_DATABASE[`${property}::${clientPrefix}::${framework}`];
    if (tier1) return tier1;
  }

  // Tier 2: property::framework
  if (framework) {
    const tier2 = FIX_DATABASE[`${property}::${framework}`];
    if (tier2) return tier2;
  }

  // Tier 3: property::clientPrefix (existing behavior)
  if (clientPrefix) {
    const tier3 = FIX_DATABASE[`${property}::${clientPrefix}`];
    if (tier3) return tier3;
  }

  // Tier 4: generic fix (existing behavior)
  return FIX_DATABASE[property];
}

/**
 * Returns true if a framework was specified but the code fix resolved to
 * a client-specific or fully generic entry (tiers 3–4) rather than a
 * framework-aware entry (tiers 1–2).
 */
export function isCodeFixGenericFallback(
  property: string,
  clientId: string,
  framework?: Framework
): boolean {
  if (!framework) return false;
  const clientPrefix = getClientPrefix(clientId);
  if (clientPrefix && FIX_DATABASE[`${property}::${clientPrefix}::${framework}`]) return false;
  if (FIX_DATABASE[`${property}::${framework}`]) return false;
  return true;
}

function getClientPrefix(clientId: string): string | null {
  if (clientId.startsWith("outlook-windows")) return "outlook";
  if (clientId.startsWith("outlook")) return null; // Outlook web is more standards-compliant
  if (clientId.startsWith("gmail")) return "gmail";
  if (clientId.startsWith("apple-mail")) return "apple";
  if (clientId === "yahoo-mail") return "yahoo";
  if (clientId === "samsung-mail") return "samsung";
  return null;
}

/**
 * Look up a suggestion string for a given property, client, and optional framework.
 *
 * Resolution order mirrors `getCodeFix()`:
 * 1. property::clientPrefix::framework
 * 2. property::framework
 * 3. property::clientPrefix
 * 4. property (generic)
 *
 * `isGenericFallback` is true when a framework was specified but no
 * framework-specific entry was found (resolution fell through to tiers 3–4).
 */
export function getSuggestion(
  property: string,
  clientId: string,
  framework?: Framework
): { text: string; isGenericFallback: boolean } {
  const clientPrefix = getClientPrefix(clientId);

  // Tier 1: property::clientPrefix::framework
  if (framework && clientPrefix) {
    const tier1 = SUGGESTION_DATABASE[`${property}::${clientPrefix}::${framework}`];
    if (tier1) return { text: tier1, isGenericFallback: false };
  }

  // Tier 2: property::framework
  if (framework) {
    const tier2 = SUGGESTION_DATABASE[`${property}::${framework}`];
    if (tier2) return { text: tier2, isGenericFallback: false };
  }

  // Tier 3: property::clientPrefix
  if (clientPrefix) {
    const tier3 = SUGGESTION_DATABASE[`${property}::${clientPrefix}`];
    if (tier3) return { text: tier3, isGenericFallback: !!framework };
  }

  // Tier 4: generic
  const tier4 = SUGGESTION_DATABASE[property];
  if (tier4) return { text: tier4, isGenericFallback: !!framework };

  // No entry — return a default
  return {
    text: `"${property}" is not supported in this email client.`,
    isGenericFallback: !!framework,
  };
}
