import type { CheerioAPI } from "cheerio";
import { TEMPLATE_VARIABLE_PATTERNS, EMPTY_TEMPLATE } from "./constants";
import { fromHtml, type ParseOptions } from "./parse-html";
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
export function checkTemplateVariablesFromDom(
  $: CheerioAPI,
  options?: ParseOptions,
): TemplateReport {
  const issues: TemplateIssue[] = [];
  const seen = new Set<string>();

  // ── Scan visible text content ──
  // With positions on, go node by node first so each finding carries the
  // position of the text it was found in; the concatenated pass below then
  // catches variables that straddle a node boundary (`{{ <b>name</b> }}`),
  // which have no single node to point at. Without positions the node walk
  // would find nothing the concatenated pass doesn't, so it is skipped.
  for (const node of options?.positions ? visibleTextNodes($) : []) {
    const data: string = node.data ?? "";
    for (const [pattern, label] of TEMPLATE_VARIABLE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(data)) !== null) {
        const variable = match[0];
        const key = `text:${variable}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const loc = locInTextNode(node, match.index, variable.length);
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
 * Visible text nodes in document order, excluding head/style/script — the same
 * content `extractTextContent()` concatenates, one node at a time so positions
 * survive.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function visibleTextNodes($: CheerioAPI): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any) {
    const tag = (node.tagName as string | undefined)?.toLowerCase();
    if (tag === "style" || tag === "script" || tag === "head") return;
    if (node.type === "text") {
      nodes.push(node);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  }
  for (const child of $.root()[0]?.children ?? []) walk(child);
  return nodes;
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
export function checkTemplateVariables(html: string, options?: ParseOptions): TemplateReport {
  return fromHtml(html, EMPTY_TEMPLATE, ($) => checkTemplateVariablesFromDom($, options), options);
}
