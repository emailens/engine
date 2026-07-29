import type { CheerioAPI } from "cheerio";
import * as csstree from "css-tree";
import { EMAIL_MAX_WIDTH, UNBREAKABLE_STRING_LENGTH, EMPTY_OVERFLOW } from "./constants";
import { fromHtml } from "./parse-html";
import type { OverflowIssue, OverflowReport } from "./types";

/**
 * Read an element's fixed pixel width, from either an inline `width: Npx`
 * style or a numeric `width` HTML attribute (which is px). Returns null for
 * percentage / auto / missing widths — those are responsive, not fixed.
 */
function fixedPxWidth($el: ReturnType<CheerioAPI>): number | null {
  const style = $el.attr("style") || "";
  const styleMatch = style.match(/(?:^|[;\s])width\s*:\s*(\d+)px/i);
  if (styleMatch) return parseInt(styleMatch[1], 10);
  const attr = $el.attr("width");
  if (attr && /^\d+$/.test(attr.trim())) return parseInt(attr.trim(), 10);
  return null;
}

/** An inline `width:100%` / `max-width:100%` means the element flexes to fit. */
function isFluid(style: string): boolean {
  return /max-width\s*:\s*100%/i.test(style) || /width\s*:\s*100%/i.test(style);
}

/** Record a too-wide element once per (label, width). */
function addWidthIssue(width: number, label: string, issues: OverflowIssue[], seen: Set<string>): void {
  const key = `w:${label}:${width}`;
  if (seen.has(key)) return;
  seen.add(key);
  issues.push({
    rule: "fixed-width-overflow",
    severity: "warning",
    message: `${label} has a fixed width of ${width}px, wider than the ${EMAIL_MAX_WIDTH}px email frame — it will force horizontal scrolling, especially on mobile.`,
    detail: `Use width:100% with max-width:${EMAIL_MAX_WIDTH}px instead of a fixed width beyond the frame.`,
  });
}

/**
 * Detect content that will overflow the email frame / mobile viewport — a
 * client-agnostic layout check (not per-client CSS support). Two heuristics:
 *
 *  1. Fixed pixel widths wider than the standard email frame with no fluid
 *     escape (`width:100%` / `max-width:100%`).
 *  2. Long unbreakable strings (e.g. raw URLs, tokens) that can't wrap.
 *
 * ponytail: static heuristics, not a layout engine. It does not resolve nested
 * widths or media-query responsiveness, so a fixed-width element made fluid via
 * a media query may still be flagged (warning, not error). The unbreakable
 * check is skipped entirely when the email already uses overflow-wrap/word-break
 * somewhere — assume the author is handling wrapping — trading recall for far
 * fewer false positives.
 */
export function checkOverflowFromDom($: CheerioAPI): OverflowReport {
  const issues: OverflowIssue[] = [];
  const seen = new Set<string>();

  // 1a. Fixed widths (inline attr/style) wider than the email frame.
  $("[width], [style*='width']").each((_, el) => {
    const $el = $(el);
    const width = fixedPxWidth($el);
    if (width === null || width <= EMAIL_MAX_WIDTH) return;
    if (isFluid($el.attr("style") || "")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = ((el as any).tagName || "element").toLowerCase();
    addWidthIssue(width, `<${tag}>`, issues, seen);
  });

  // 1b. Fixed widths declared in <style> block rules (incl. inside @media).
  $("style").each((_, el) => {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse($(el).text());
    } catch {
      return;
    }
    csstree.walk(ast, {
      visit: "Rule",
      enter(node: csstree.CssNode) {
        if (node.type !== "Rule") return;
        let widthPx: number | null = null;
        let fluid = false;
        node.block.children.forEach((child) => {
          if (child.type !== "Declaration") return;
          const prop = child.property.toLowerCase();
          const val = csstree.generate(child.value);
          if (prop === "width") {
            const m = val.match(/^(\d+)px$/);
            if (m) widthPx = parseInt(m[1], 10);
            if (/\b100%/.test(val)) fluid = true;
          } else if (prop === "max-width" && /\b100%/.test(val)) {
            fluid = true;
          }
        });
        if (widthPx !== null && widthPx > EMAIL_MAX_WIDTH && !fluid) {
          const selector = csstree.generate(node.prelude).trim().slice(0, 40);
          addWidthIssue(widthPx, selector || "rule", issues, seen);
        }
      },
    });
  });

  // 2. Long unbreakable strings in visible text — skip if the email already
  //    opts into wrapping anywhere (author is handling it).
  const usesWrapGuard = /overflow-wrap|word-break|word-wrap/i.test($.html());
  if (!usesWrapGuard) {
    const $body = $("body");
    let text = "";
    if ($body.length) {
      const clone = $body.clone();
      clone.find("style, script").remove();
      text = clone.text();
    }
    for (const token of text.split(/\s+/)) {
      if (token.length <= UNBREAKABLE_STRING_LENGTH || seen.has(token)) continue;
      seen.add(token);
      const preview = token.length > 50 ? `${token.slice(0, 50)}…` : token;
      issues.push({
        rule: "unbreakable-string",
        severity: "warning",
        message: `A ${token.length}-character unbroken string ("${preview}") can't wrap and will force horizontal scrolling on narrow screens.`,
        detail: `Add overflow-wrap: anywhere (or word-break: break-word) to its container.`,
      });
    }
  }

  return { hasOverflow: issues.length > 0, issues };
}

/**
 * Detect content likely to overflow the email frame or mobile viewport:
 * fixed pixel widths wider than the frame, and long unbreakable strings.
 */
export function checkOverflow(html: string): OverflowReport {
  return fromHtml(html, EMPTY_OVERFLOW, checkOverflowFromDom);
}
