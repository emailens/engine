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
/**
 * Every variable in `text`, each once. Patterns run in order and a later one
 * can't match inside an earlier one's span, so `{{name}}` and `${name}` are not
 * also reported as the single-brace `{name}` they contain.
 */
function findVariables(text: string): Array<{ variable: string; label: string; index: number }> {
  const found: Array<{ variable: string; label: string; index: number }> = [];
  for (const [pattern, label] of TEMPLATE_VARIABLE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (found.some((f) => start < f.index + f.variable.length && f.index < end)) continue;
      found.push({ variable: match[0], label, index: start });
    }
  }
  return found;
}

/**
 * Links the sending platform writes itself: unsubscribe, preferences, web
 * version (`*|UNSUB|*`, `{{unsubscribe_url}}`, `%unsubscribe_url%`). Every
 * email built for an ESP carries one by design, so in an href it is expected,
 * not a broken link. Any other variable stays an error.
 */
const ESP_SYSTEM_LINK = /unsub|opt[-_ ]?out|preference|update_profile|manage|archive|web_?version|view_?in_?browser/i;

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
    for (const { variable, label, index } of findVariables(data)) {
      const key = `text:${variable}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const loc = locInTextNode(node, index, variable.length, source);
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

  const textContent = textNodes.map((n) => n.data ?? "").join("");
  for (const { variable, label } of findVariables(textContent)) {
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

  // ── Scan attributes (href, src, alt) ──
  const attrSelectors = ["[href]", "[src]", "[alt]"];
  for (const sel of attrSelectors) {
    $(sel).each((_, el) => {
      const attrs = ["href", "src", "alt"] as const;
      for (const attr of attrs) {
        const value = $(el).attr(attr);
        if (!value) continue;

        for (const { variable, label } of findVariables(value)) {
          const key = `attr:${attr}:${variable}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const loc = locOfAttr(el, attr);
          const espLink = attr === "href" && ESP_SYSTEM_LINK.test(variable);
          issues.push({
            rule: "unresolved-variable",
            severity: espLink ? "info" : "error",
            message: espLink
              ? `${label} placeholder "${variable}" in href: your sending platform fills this link in at send time.`
              : `Unresolved ${label} variable "${variable}" found in ${attr} attribute.`,
            variable,
            location: "attribute",
            ...(loc ? { loc } : {}),
          });
        }
      }
    });
  }

  return { unresolvedCount: issues.filter((i) => i.severity !== "info").length, issues };
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
