import type { CheerioAPI } from "cheerio";
import * as csstree from "css-tree";
import { EMPTY_VISUAL, WEB_SAFE_FONTS, GENERIC_FONT_FAMILIES } from "./constants";
import { fromHtml } from "./parse-html";
import { parseInlineStyle } from "./style-utils";
import { parseColor } from "./color-utils";
import type { VisualIssue, VisualReport } from "./types";

const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
const GRADIENT_RE = /(?:linear|radial|conic)-gradient\(/i;

/** A parseable, non-transparent solid colour. */
function isSolidColor(value: string | undefined): boolean {
  if (!value) return false;
  const c = parseColor(value.trim());
  return c !== null && c.a !== 0;
}

/** First real colour stop in a gradient/background value — the natural solid fallback. */
function firstColor(value: string): string | null {
  const tokens = value.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|\b[a-zA-Z]{3,}\b/g) || [];
  for (const t of tokens) {
    const lc = t.toLowerCase();
    if (lc === "transparent") continue;
    if (/^(?:linear|radial|conic|gradient|deg|turn|rad|grad|to|at|from|in|circle|ellipse|closest|farthest|side|corner|url)$/.test(lc)) continue;
    const c = parseColor(t);
    if (c && c.a !== 0) return t;
  }
  return null;
}

/**
 * Remove the contents of every parenthesised function (gradients, url(), and
 * the rgb()/hsl() colours *inside* them), keeping top-level tokens. A balanced
 * scan — a plain `\([^)]*\)` regex breaks on nested parens like
 * `linear-gradient(…, rgb(255,0,0), …)` and mistakes the gradient's own colour
 * for a solid fallback.
 */
function stripFunctionArgs(value: string): string {
  let out = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { if (depth > 0) depth--; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

/** Does an inline style declare a solid background colour anywhere? */
function hasBackgroundFallback(style: Map<string, string>): boolean {
  if (isSolidColor(style.get("background-color"))) return true;
  const bg = style.get("background");
  if (!bg) return false;
  // Look for a solid colour that sits *outside* any gradient/url() function.
  return firstColor(stripFunctionArgs(bg)) !== null;
}

/** A font stack has a fallback if any token is web-safe or a generic family. */
function hasFontFallback(value: string): boolean {
  return value.split(",").some((raw) => {
    const t = raw.replace(/['"]/g, "").trim().toLowerCase();
    return (
      WEB_SAFE_FONTS.has(t) ||
      GENERIC_FONT_FAMILIES.has(t) ||
      t.startsWith("-apple-system") ||
      t === "blinkmacsystemfont"
    );
  });
}

/** Run the visual checks over one declaration block (inline style or a rule). */
function inspectDeclarations(style: Map<string, string>, issues: VisualIssue[], seen: Set<string>): void {
  // 1. Background image/gradient without a solid colour fallback.
  const combined = `${style.get("background-image") ?? ""} ${style.get("background") ?? ""}`;
  const isGradient = GRADIENT_RE.test(combined);
  const isImage = isGradient || /url\(/i.test(combined);

  if (isImage && !hasBackgroundFallback(style)) {
    const stop = isGradient ? firstColor(combined) : null;
    const fix = stop
      ? `background-color: ${stop};`
      : `background-color: <solid colour matching the image>;`;
    const key = `bg:${fix}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({
        rule: "missing-background-fallback",
        severity: "warning",
        message: `${isGradient ? "Gradient" : "Background image"} has no background-color fallback — it renders as a blank area (and can hide overlaid text) in Outlook and other clients that drop image backgrounds.`,
        detail: isGradient
          ? `Add a solid fallback beneath the gradient using its first colour stop.`
          : `Add a solid background-color so the area still has colour when the image is dropped.`,
        fix,
      });
    }
  }

  // 2. font-family without a web-safe / generic fallback.
  const font = style.get("font-family");
  if (font && !CSS_WIDE_KEYWORDS.has(font.trim().toLowerCase()) && !hasFontFallback(font)) {
    const fix = `font-family: ${font.trim()}, Arial, sans-serif;`;
    const key = `font:${font.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({
        rule: "missing-font-fallback",
        severity: "warning",
        message: `font-family "${font.trim()}" has no web-safe fallback — clients that strip web fonts (Gmail, Outlook) fall back to Times New Roman.`,
        detail: `End the stack with a web-safe font and a generic family.`,
        fix,
      });
    }
  }
}

/** Collect a CSS rule's declarations into a property→value map. */
function ruleToMap(node: csstree.Rule): Map<string, string> {
  const map = new Map<string, string>();
  node.block.children.forEach((child) => {
    if (child.type === "Declaration") {
      map.set(child.property.toLowerCase(), csstree.generate(child.value));
    }
  });
  return map;
}

/**
 * Detect probable visual bugs in a stylized email — styled features that break
 * with no fallback, producing a visibly wrong render (not just a stripped
 * property). Each issue carries a concrete `fix`. Two checks:
 *
 *  1. Background image / gradient with no solid `background-color` — renders as
 *     a blank area (and often hides text) in Outlook and other clients that
 *     drop image backgrounds. For gradients the fix is computed from the first
 *     colour stop.
 *  2. `font-family` with no web-safe or generic fallback — clients that strip
 *     web fonts fall back to Times New Roman.
 *
 * Scans both inline styles and `<style>` block rules (incl. inside @media).
 */
export function checkVisualFromDom($: CheerioAPI): VisualReport {
  const issues: VisualIssue[] = [];
  const seen = new Set<string>();

  $("[style]").each((_, el) => {
    inspectDeclarations(parseInlineStyle($(el).attr("style") || ""), issues, seen);
  });

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
        if (node.type === "Rule") inspectDeclarations(ruleToMap(node), issues, seen);
      },
    });
  });

  return { issues };
}

/**
 * Detect probable visual bugs in a stylized email: background images/gradients
 * with no colour fallback, and font stacks with no web-safe fallback. Each
 * issue includes a concrete fix.
 */
export function checkVisual(html: string): VisualReport {
  return fromHtml(html, EMPTY_VISUAL, checkVisualFromDom);
}
