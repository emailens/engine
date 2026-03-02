import type { CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import { MAX_HTML_SIZE, TEMPLATE_VARIABLE_PATTERNS } from "./constants";
import type { TemplateIssue, TemplateReport } from "./types";

/**
 * Scan DOM text nodes and attributes for unresolved template variables.
 *
 * Scans DOM text (not raw HTML) to avoid false positives from CSS/style
 * blocks. Also checks href, src, and alt attributes for merge tags.
 *
 * @internal Used by audit pipeline with pre-parsed DOM.
 */
export function checkTemplateVariablesFromDom($: CheerioAPI): TemplateReport {
  const issues: TemplateIssue[] = [];
  const seen = new Set<string>();

  // ── Scan visible text content ──
  const textContent = extractTextContent($);
  for (const [pattern, label] of TEMPLATE_VARIABLE_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(textContent)) !== null) {
      const variable = match[0];
      const key = `text:${variable}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        rule: "unresolved-variable",
        severity: "error",
        message: `Unresolved ${label} variable "${variable}" found in text content.`,
        variable,
        location: "text",
      });
    }
  }

  // ── Scan attributes (href, src, alt) ──
  const attrSelectors = ["[href]", "[src]", "[alt]"];
  for (const sel of attrSelectors) {
    $(sel).each((_, el) => {
      const attrs = ["href", "src", "alt"] as const;
      for (const attr of attrs) {
        const value = $(el).attr(attr);
        if (!value) continue;

        for (const [pattern, label] of TEMPLATE_VARIABLE_PATTERNS) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(value)) !== null) {
            const variable = match[0];
            const key = `attr:${attr}:${variable}`;
            if (seen.has(key)) continue;
            seen.add(key);
            issues.push({
              rule: "unresolved-variable",
              severity: "error",
              message: `Unresolved ${label} variable "${variable}" found in ${attr} attribute.`,
              variable,
              location: "attribute",
            });
          }
        }
      }
    });
  }

  return { unresolvedCount: issues.length, issues };
}

/**
 * Extract visible text content from DOM (excluding style/script).
 */
function extractTextContent($: CheerioAPI): string {
  const clone = $.root().clone();
  clone.find("style, script, head").remove();
  return clone.text();
}

/**
 * Scan HTML email for unresolved template/merge variables.
 *
 * Detects patterns like `{{var}}`, `${var}`, `<%= %>`, `*|TAG|*`,
 * `%%tag%%`, and `{merge_field}` in text content and key attributes.
 *
 * Returns the count of unresolved variables and detailed issues.
 */
export function checkTemplateVariables(html: string): TemplateReport {
  if (!html || !html.trim()) {
    return { unresolvedCount: 0, issues: [] };
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const $ = cheerio.load(html);
  return checkTemplateVariablesFromDom($);
}
