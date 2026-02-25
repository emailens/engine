import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import { CSS_SUPPORT } from "./rules/css-support";
import { EMAIL_CLIENTS } from "./clients";
import { getCodeFix, getSuggestion, isCodeFixGenericFallback } from "./fix-snippets";
import { parseStyleProperties, getStyleValue } from "./style-utils";
import type { CSSWarning, Framework, SupportLevel } from "./types";

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

  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];
  const seenWarnings = new Set<string>();

  function addWarning(w: CSSWarning) {
    const key = `${w.client}:${w.property}:${w.severity}`;
    if (!seenWarnings.has(key)) {
      seenWarnings.add(key);
      warnings.push(w);
    }
  }

  // 1. Check for <style> block usage
  if ($("style").length > 0) {
    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT["<style>"]?.[client.id];
      if (support === "unsupported") {
        const sug = getSuggestion("<style>", client.id, framework);
        const fix = getCodeFix("<style>", client.id, framework);
        addWarning({
          severity: "error",
          client: client.id,
          property: "<style>",
          message: `${client.name} strips <style> blocks. Styles must be inlined.`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<style>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      } else if (support === "partial") {
        const sug = getSuggestion("<style>:partial", client.id, framework);
        const fix = getCodeFix("<style>", client.id, framework);
        addWarning({
          severity: "warning",
          client: client.id,
          property: "<style>",
          message: `${client.name} has partial <style> support (head only, with limitations). Inline styles recommended.`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<style>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // 2. Check for <link> stylesheet usage
  if ($("link[rel='stylesheet']").length > 0) {
    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT["<link>"]?.[client.id];
      if (support === "unsupported") {
        const sug = getSuggestion("<link>", client.id, framework);
        const fix = getCodeFix("<link>", client.id, framework);
        addWarning({
          severity: "error",
          client: client.id,
          property: "<link>",
          message: `${client.name} does not support external stylesheets.`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<link>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // 3. Check for SVG usage
  if ($("svg").length > 0) {
    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT["<svg>"]?.[client.id];
      if (support === "unsupported") {
        const sug = getSuggestion("<svg>", client.id, framework);
        const fix = getCodeFix("<svg>", client.id, framework);
        addWarning({
          severity: "error",
          client: client.id,
          property: "<svg>",
          message: `${client.name} does not support inline SVG.`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<svg>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // 4. Check for video
  if ($("video").length > 0) {
    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT["<video>"]?.[client.id];
      if (support === "unsupported") {
        const sug = getSuggestion("<video>", client.id, framework);
        const fix = getCodeFix("<video>", client.id, framework);
        addWarning({
          severity: "warning",
          client: client.id,
          property: "<video>",
          message: `${client.name} does not support <video> elements.`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<video>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // 5. Check for form elements
  if ($("form").length > 0 || $("input").length > 0 || $("button[type='submit']").length > 0) {
    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT["<form>"]?.[client.id];
      if (support === "unsupported") {
        const sug = getSuggestion("<form>", client.id, framework);
        const fix = getCodeFix("<form>", client.id, framework);
        addWarning({
          severity: "error",
          client: client.id,
          property: "<form>",
          message: `${client.name} strips form elements.`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<form>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // 6-7. Parse <style> blocks with css-tree for accurate at-rule and property detection
  const parsedAtRules = new Set<string>();
  const parsedProperties = new Set<string>();

  $("style").each((_, el) => {
    const cssText = $(el).text();
    try {
      const ast = csstree.parse(cssText, { parseCustomProperty: true });
      csstree.walk(ast, {
        enter(node: csstree.CssNode) {
          if (node.type === "Atrule") {
            parsedAtRules.add(`@${node.name}`);
          }
          if (node.type === "Declaration") {
            parsedProperties.add(node.property.toLowerCase());
            // Check for display:flex / display:grid values
            if (node.property.toLowerCase() === "display") {
              const value = csstree.generate(node.value);
              if (value.includes("flex")) parsedProperties.add("display:flex");
              if (value.includes("grid")) parsedProperties.add("display:grid");
            }
            // Check for gradient values
            const valueStr = csstree.generate(node.value);
            if (valueStr.includes("linear-gradient") || valueStr.includes("radial-gradient")) {
              parsedProperties.add("linear-gradient");
            }
          }
        },
      });
    } catch {
      // If css-tree can't parse, skip
    }
  });

  // Check @font-face
  if (parsedAtRules.has("@font-face")) {
    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT["@font-face"]?.[client.id];
      if (support === "unsupported") {
        const sug = getSuggestion("@font-face", client.id, framework);
        const fix = getCodeFix("@font-face", client.id, framework);
        addWarning({
          severity: "warning",
          client: client.id,
          property: "@font-face",
          message: `${client.name} does not support web fonts (@font-face).`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("@font-face", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // Check @media queries
  if (parsedAtRules.has("@media")) {
    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT["@media"]?.[client.id];
      if (support === "unsupported") {
        const sug = getSuggestion("@media", client.id, framework);
        const fix = getCodeFix("@media", client.id, framework);
        addWarning({
          severity: "warning",
          client: client.id,
          property: "@media",
          message: `${client.name} does not support @media queries.`,
          suggestion: sug.text,
          fix,
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("@media", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  // 8. Scan inline styles for unsupported CSS properties
  const cssPropertiesToCheck = Object.keys(CSS_SUPPORT).filter(
    (k) => !k.startsWith("<") && !k.startsWith("@")
  );

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseStyleProperties(style);

    for (const prop of props) {
      // Check for flex/grid in display value
      if (prop === "display") {
        const value = getStyleValue(style, "display");
        if (value?.includes("flex")) {
          checkPropertySupport("display:flex", addWarning, framework);
        } else if (value?.includes("grid")) {
          checkPropertySupport("display:grid", addWarning, framework);
        }
      }

      // Check the property itself
      if (cssPropertiesToCheck.includes(prop)) {
        checkPropertySupport(prop, addWarning, framework);
      }

      // Check for gradient values in the property value
      const value = getStyleValue(style, prop);
      if (value && (value.includes("linear-gradient") || value.includes("radial-gradient"))) {
        checkPropertySupport("linear-gradient", addWarning, framework);
      }
    }
  });

  // 9. Check CSS properties found in <style> blocks (via css-tree parsing)
  for (const prop of parsedProperties) {
    if (prop.includes(":")) continue; // skip compound like display:flex (handled separately)
    if (!cssPropertiesToCheck.includes(prop)) continue;

    for (const client of EMAIL_CLIENTS) {
      const support = CSS_SUPPORT[prop]?.[client.id];
      if (support === "unsupported") {
        addWarning({
          severity: "warning",
          client: client.id,
          property: prop,
          message: `${client.name} does not support "${prop}" in <style> blocks.`,
        });
      }
    }
  }

  // Check compound properties from <style> blocks
  for (const compound of ["display:flex", "display:grid", "linear-gradient"]) {
    if (parsedProperties.has(compound)) {
      checkPropertySupport(compound, addWarning, framework);
    }
  }

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return warnings;
}

function checkPropertySupport(
  prop: string,
  addWarning: (w: CSSWarning) => void,
  framework?: Framework
) {
  const supportData = CSS_SUPPORT[prop];
  if (!supportData) return;

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
