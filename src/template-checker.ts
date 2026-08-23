import type { CheerioAPI } from "cheerio";
import { TEMPLATE_VARIABLE_PATTERNS, EMPTY_TEMPLATE } from "./constants";
import { fromHtml, type ParseOptions } from "./parse-html";
import { visibleTextNodes } from "./dom-text";
import { locInTextNode, locOfAttr } from "./source-location";
import type { TemplateIssue, TemplateReport } from "./types";

/**
 * Scan DOM text nodes and attributes for unresolved template variables.
 *
 * Scans DOM text (not raw HTML) to avoid false positives from CSS/style
 * blocks. Also checks href, src, and alt attributes for merge tags.
 *
 * @internal Used by audit pipeline with pre-parsed DOM.
 */
export function checkTemplateVariablesFromDom($: CheerioAPI, source?: string): TemplateReport {
  const issues: TemplateIssue[] = [];
  const seen = new Set<string>();

  // ── Scan visible text content ──
  // Node by node first, so each finding carries the position of the text it
  // was found in; then over the same nodes concatenated, which catches
  // variables that straddle a node boundary (`{{ <b>name</b> }}`) and have no
  // single node to point at.
  const textNodes = visibleTextNodes($);
  // Scanning node by node costs one regex pass per node instead of one over the
  // whole document, and only buys something when the nodes carry positions.
  const positioned = textNodes.some((n) => n.sourceCodeLocation);

  for (const node of positioned ? textNodes : []) {
    const data: string = node.data ?? "";
    for (const [pattern, label] of TEMPLATE_VARIABLE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(data)) !== null) {
        const variable = match[0];
        const key = `text:${variable}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const loc = locInTextNode(node, match.index, variable.length, source);
        issues.push({
          rule: "unresolved-variable",
          severity: "error",
          message: `Unresolved ${label} variable "${variable}" found in text content.`,
          variable,
          location: "text",
          ...(loc ? { loc } : {}),
        });
      }
    }
  }

  const textContent = textNodes.map((n) => n.data ?? "").join("");
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
            const loc = locOfAttr(el, attr);
            issues.push({
              rule: "unresolved-variable",
              severity: "error",
              message: `Unresolved ${label} variable "${variable}" found in ${attr} attribute.`,
              variable,
              location: "attribute",
              ...(loc ? { loc } : {}),
            });
          }
        }
      }
    });
  }

  return { unresolvedCount: issues.length, issues };
}

/**
 * Scan HTML email for unresolved template/merge variables.
 *
 * Detects patterns like `{{var}}`, `${var}`, `<%= %>`, `*|TAG|*`,
 * `%%tag%%`, and `{merge_field}` in text content and key attributes.
 *
 * Returns the count of unresolved variables and detailed issues.
 */
export function checkTemplateVariables(html: string, options?: ParseOptions): TemplateReport {
  return fromHtml(
    html,
    EMPTY_TEMPLATE,
    ($, h) => checkTemplateVariablesFromDom($, options?.positions ? h : undefined),
    options,
  );
}
