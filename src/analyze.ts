import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import {
  CSS_SUPPORT,
  STRUCTURAL_FIX_PROPERTIES,
  HTML_ELEMENT_FEATURES,
  AT_RULE_FEATURES,
  COMPOUND_VALUE_FEATURES,
  CSS_FUNCTION_FEATURES,
} from "./rules/css-support";
import { EMAIL_CLIENTS } from "./clients";
import { getCodeFix, getSuggestion, isCodeFixGenericFallback } from "./fix-snippets";
import { parseStyleProperties, getStyleValue } from "./style-utils";
import { MAX_HTML_SIZE } from "./constants";
import type { CSSWarning, FixType, Framework, SupportLevel } from "./types";

// ── Data-driven detection config ─────────────────────────────────────────────

/**
 * HTML element detection rules.
 * Each maps a feature key to a CSS selector for DOM detection.
 * Special cases (like <form> also matching <input>/<button>) are listed explicitly.
 */
const HTML_ELEMENT_SELECTORS: Record<string, string> = {
  "<style>": "style",
  "<link>": "link[rel='stylesheet']",
  "<svg>": "svg",
  "<video>": "video",
  "<form>": "form, input, button[type='submit']",
  "<audio>": "audio",
  "<picture>": "picture",
  "<dialog>": "dialog",
  "<meter>": "meter",
  "<progress>": "progress",
  "<select>": "select",
  "<textarea>": "textarea",
  "<marquee>": "marquee",
  "<object>": "object",
  "<base>": "base",
};

/** Severity for HTML element detection (some are error, some warning). */
const HTML_ELEMENT_SEVERITY: Record<string, "error" | "warning"> = {
  "<style>": "error",
  "<link>": "error",
  "<svg>": "error",
  "<form>": "error",
  "<video>": "warning",
  "<audio>": "warning",
  "<picture>": "warning",
  "<dialog>": "warning",
  "<marquee>": "warning",
  "<meter>": "warning",
  "<progress>": "warning",
  "<select>": "warning",
  "<textarea>": "warning",
  "<object>": "warning",
  "<base>": "warning",
};

/** Custom messages for HTML elements. Falls back to generic message. */
const HTML_ELEMENT_MESSAGES: Record<string, (clientName: string) => string> = {
  "<style>": (n) => `${n} strips <style> blocks. Styles must be inlined.`,
  "<link>": (n) => `${n} does not support external stylesheets.`,
  "<svg>": (n) => `${n} does not support inline SVG.`,
  "<video>": (n) => `${n} does not support <video> elements.`,
  "<form>": (n) => `${n} strips form elements.`,
};

/** Compound value detection: maps compound feature keys to {property, valueIncludes}. */
const COMPOUND_DETECTORS: Array<{
  key: string;
  property: string;
  valueIncludes: string;
}> = [
  { key: "display:flex", property: "display", valueIncludes: "flex" },
  { key: "display:grid", property: "display", valueIncludes: "grid" },
  { key: "display:none", property: "display", valueIncludes: "none" },
];

/** CSS function detection: require opening paren to avoid false positives (e.g., "min" in "Minion"). */
const CSS_FUNCTION_DETECTORS = CSS_FUNCTION_FEATURES.map((fn) => ({
  key: fn,
  pattern: `${fn}(`, // require opening paren — matches "min(" but not "Minion"
}));

// ── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Analyze a pre-parsed email DOM for CSS compatibility warnings.
 *
 * Uses data-driven detection: HTML_ELEMENT_FEATURES, AT_RULE_FEATURES,
 * COMPOUND_VALUE_FEATURES, and CSS_FUNCTION_FEATURES are iterated
 * automatically from the generated css-support.ts arrays.
 *
 * @internal
 */
export function analyzeEmailFromDom($: cheerio.CheerioAPI, framework?: Framework): CSSWarning[] {
  const warnings: CSSWarning[] = [];
  const seenWarnings = new Set<string>();

  function addWarning(w: CSSWarning) {
    const key = `${w.client}:${w.property}:${w.severity}:${w.selector || ""}`;
    if (!seenWarnings.has(key)) {
      seenWarnings.add(key);
      warnings.push(w);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function describeSelector(el: any): string {
    const $el = $(el);
    const tag = (el.tagName as string)?.toLowerCase() || "";
    const cls = $el.attr("class");
    const id = $el.attr("id");
    if (id) return `${tag}#${id}`;
    if (cls) return `${tag}.${cls.split(/\s+/)[0]}`;
    const href = $el.attr("href");
    if (href) return `${tag}[href]`;
    return tag;
  }

  // 1. Data-driven HTML element detection
  for (const feature of HTML_ELEMENT_FEATURES) {
    const selector = HTML_ELEMENT_SELECTORS[feature];
    if (!selector) continue; // Element not in our detection map — skip
    if ($(selector).length === 0) continue;

    const supportData = CSS_SUPPORT[feature];
    if (!supportData) continue;

    const baseSeverity = HTML_ELEMENT_SEVERITY[feature] || "warning";

    for (const client of EMAIL_CLIENTS) {
      const support = supportData[client.id];
      if (support === "unsupported") {
        const msgFn = HTML_ELEMENT_MESSAGES[feature];
        const message = msgFn
          ? msgFn(client.name)
          : `${client.name} does not support ${feature}.`;
        const sug = getSuggestion(feature, client.id, framework);
        const fix = getCodeFix(feature, client.id, framework);
        addWarning({
          severity: baseSeverity,
          client: client.id,
          property: feature,
          message,
          suggestion: sug.text,
          fix,
          fixType: getFixType(feature),
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback(feature, client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      } else if (support === "partial" && feature === "<style>") {
        // Special case: <style> partial gets a custom message
        const sug = getSuggestion("<style>:partial", client.id, framework);
        const fix = getCodeFix("<style>", client.id, framework);
        addWarning({
          severity: "warning",
          client: client.id,
          property: "<style>",
          message: `${client.name} has partial <style> support (head only, with limitations). Inline styles recommended.`,
          suggestion: sug.text,
          fix,
          fixType: getFixType("<style>"),
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<style>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // 2. Parse <style> blocks with css-tree
  const parsedAtRules = new Set<string>();
  const parsedProperties = new Set<string>();
  const propertyLines = new Map<string, number>();
  const detectedCssFunctions = new Set<string>();
  const detectedPseudoClasses = new Set<string>();
  const detectedPseudoElements = new Set<string>();

  $("style").each((_, el) => {
    const cssText = $(el).text();
    try {
      const ast = csstree.parse(cssText, { parseCustomProperty: true, positions: true });
      csstree.walk(ast, {
        enter(node: csstree.CssNode) {
          if (node.type === "Atrule") {
            parsedAtRules.add(`@${node.name}`);
          }
          // Detect pseudo-classes and pseudo-elements in selectors
          if (node.type === "PseudoClassSelector") {
            detectedPseudoClasses.add(`:${node.name}`);
          }
          if (node.type === "PseudoElementSelector") {
            detectedPseudoElements.add(`::${node.name}`);
          }
          if (node.type === "Declaration") {
            const prop = node.property.toLowerCase();
            parsedProperties.add(prop);
            if (node.loc && !propertyLines.has(prop)) {
              propertyLines.set(prop, node.loc.start.line);
            }

            // Data-driven compound value detection
            const valueStr = csstree.generate(node.value);
            for (const det of COMPOUND_DETECTORS) {
              if (prop === det.property && valueStr.includes(det.valueIncludes)) {
                parsedProperties.add(det.key);
                if (node.loc && !propertyLines.has(det.key)) {
                  propertyLines.set(det.key, node.loc.start.line);
                }
              }
            }

            // Data-driven CSS function detection
            for (const fn of CSS_FUNCTION_DETECTORS) {
              if (valueStr.includes(fn.pattern)) {
                detectedCssFunctions.add(fn.key);
                if (node.loc && !propertyLines.has(fn.key)) {
                  propertyLines.set(fn.key, node.loc.start.line);
                }
              }
            }
          }
        },
      });
    } catch {
      // If css-tree can't parse, skip
    }
  });

  // 3. Data-driven at-rule checking
  for (const atRule of AT_RULE_FEATURES) {
    if (!parsedAtRules.has(atRule)) continue;
    checkPropertySupport(atRule, addWarning, framework);
  }

  // 4. Scan inline styles
  const cssPropertiesToCheck = Object.keys(CSS_SUPPORT).filter(
    (k) => !k.startsWith("<") && !k.startsWith("@")
  );

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseStyleProperties(style);
    const selector = describeSelector(el);

    for (const prop of props) {
      // Data-driven compound value detection in inline styles
      for (const det of COMPOUND_DETECTORS) {
        if (prop === det.property) {
          const value = getStyleValue(style, prop);
          if (value?.includes(det.valueIncludes)) {
            checkPropertySupport(det.key, addWarning, framework, selector);
          }
        }
      }

      if (cssPropertiesToCheck.includes(prop)) {
        checkPropertySupport(prop, addWarning, framework, selector);
      }

      // Data-driven CSS function detection in inline styles
      const value = getStyleValue(style, prop);
      if (value) {
        for (const fn of CSS_FUNCTION_DETECTORS) {
          if (value.includes(fn.pattern)) {
            checkPropertySupport(fn.key, addWarning, framework, selector);
          }
        }
      }
    }
  });

  // 5. Check CSS properties from <style> blocks
  for (const prop of parsedProperties) {
    if (prop.includes(":")) continue;
    if (!cssPropertiesToCheck.includes(prop)) continue;
    checkPropertySupport(prop, addWarning, framework, undefined, propertyLines.get(prop));
  }

  // Data-driven compound values from <style> blocks (display:flex, display:grid, display:none)
  for (const compound of COMPOUND_VALUE_FEATURES) {
    // Only check actual compound values (property:value pairs), not pseudo-selectors
    if (compound.startsWith(":") || compound.startsWith("::")) continue;
    if (parsedProperties.has(compound)) {
      checkPropertySupport(compound, addWarning, framework, undefined, propertyLines.get(compound));
    }
  }

  // Data-driven pseudo-class/element detection from <style> blocks
  for (const pseudo of detectedPseudoClasses) {
    if (CSS_SUPPORT[pseudo]) {
      checkPropertySupport(pseudo, addWarning, framework);
    }
  }
  for (const pseudo of detectedPseudoElements) {
    if (CSS_SUPPORT[pseudo]) {
      checkPropertySupport(pseudo, addWarning, framework);
    }
  }

  // Data-driven CSS functions from <style> blocks
  for (const fn of detectedCssFunctions) {
    checkPropertySupport(fn, addWarning, framework, undefined, propertyLines.get(fn));
  }

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return warnings;
}

/**
 * Analyze an HTML email and return CSS compatibility warnings
 * for all target email clients.
 *
 * The `framework` parameter controls which fix snippets are attached
 * to warnings — it does NOT change which warnings fire. Analysis always
 * runs on compiled HTML (what email clients actually receive). Fix
 * snippets reference source-level constructs so users know how to
 * modify their framework source code.
 */
export function analyzeEmail(html: string, framework?: Framework): CSSWarning[] {
  if (!html || !html.trim()) {
    return [];
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const $ = cheerio.load(html);
  return analyzeEmailFromDom($, framework);
}

function getFixType(prop: string): FixType {
  return STRUCTURAL_FIX_PROPERTIES.has(prop) ? "structural" : "css";
}

function checkPropertySupport(
  prop: string,
  addWarning: (w: CSSWarning) => void,
  framework?: Framework,
  selector?: string,
  line?: number,
) {
  const supportData = CSS_SUPPORT[prop];
  if (!supportData) return;

  const fixType = getFixType(prop);

  for (const client of EMAIL_CLIENTS) {
    const support: SupportLevel = supportData[client.id] || "unknown";
    if (support === "unsupported") {
      const sug = getSuggestion(prop, client.id, framework);
      const fix = getCodeFix(prop, client.id, framework);
      addWarning({
        severity: "warning",
        client: client.id,
        property: prop,
        message: `${client.name} does not support "${prop}".`,
        suggestion: sug.text,
        fix,
        fixType,
        ...(selector ? { selector } : {}),
        ...(line !== undefined ? { line } : {}),
        ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback(prop, client.id, framework)))
          ? { fixIsGenericFallback: true } : {}),
      });
    } else if (support === "partial") {
      const sug = getSuggestion(prop, client.id, framework);
      const fix = getCodeFix(prop, client.id, framework);
      addWarning({
        severity: "info",
        client: client.id,
        property: prop,
        message: `${client.name} has partial support for "${prop}".`,
        suggestion: sug.text,
        fix,
        fixType,
        ...(selector ? { selector } : {}),
        ...(line !== undefined ? { line } : {}),
        ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback(prop, client.id, framework)))
          ? { fixIsGenericFallback: true } : {}),
      });
    }
  }
}


/**
 * Generate a summary of CSS compatibility for the email.
 */
export function generateCompatibilityScore(
  warnings: CSSWarning[]
): Record<string, { score: number; errors: number; warnings: number; info: number }> {
  const result: Record<string, { score: number; errors: number; warnings: number; info: number }> = {};

  for (const client of EMAIL_CLIENTS) {
    const clientWarnings = warnings.filter((w) => w.client === client.id);
    const errors = clientWarnings.filter((w) => w.severity === "error").length;
    const warns = clientWarnings.filter((w) => w.severity === "warning").length;
    const info = clientWarnings.filter((w) => w.severity === "info").length;

    // Score: 100 minus penalties, clamped to 0-100
    const score = Math.max(0, Math.min(100, 100 - errors * 15 - warns * 5 - info * 1));

    result[client.id] = { score, errors, warnings: warns, info };
  }

  return result;
}

/** Filter warnings for a specific client. */
export function warningsForClient(warnings: CSSWarning[], clientId: string): CSSWarning[] {
  return warnings.filter(w => w.client === clientId);
}

/** Get only error-severity warnings. */
export function errorWarnings(warnings: CSSWarning[]): CSSWarning[] {
  return warnings.filter(w => w.severity === "error");
}

/** Get only structural fix warnings. */
export function structuralWarnings(warnings: CSSWarning[]): CSSWarning[] {
  return warnings.filter(w => w.fixType === "structural");
}
