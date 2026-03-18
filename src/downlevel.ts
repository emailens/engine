/**
 * Downlevel modern CSS in HTML emails to maximize email client compatibility.
 *
 * Transforms modern CSS features into widely-supported equivalents:
 * - Modern color functions (oklch, hsl, hwb) to rgb()
 * - Space-based rgb() to comma-based rgb()
 * - CSS logical properties to physical properties
 * - calc(infinity * 1px) to 9999px
 * - CSS nesting to flat rules
 * - Range media queries to legacy min/max syntax
 * - CSS variables (var()) resolved within same stylesheet
 */

import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import { parseColor, formatRgb } from "./color-utils";
import { parseInlineStyle, serializeStyle } from "./style-utils";

// --- Logical property mappings ---

const LOGICAL_PROPERTY_MAP: Record<string, [string, string]> = {
  "padding-inline": ["padding-left", "padding-right"],
  "padding-block": ["padding-top", "padding-bottom"],
  "margin-inline": ["margin-left", "margin-right"],
  "margin-block": ["margin-top", "margin-bottom"],
  "inset-inline": ["left", "right"],
  "inset-block": ["top", "bottom"],
  "border-inline": ["border-left", "border-right"],
  "border-block": ["border-top", "border-bottom"],
};

// --- Color conversion ---

/**
 * Regex matching modern color functions that need conversion.
 * Matches oklch(...), hsl(...), hsla(...), hwb(...), and space-based rgb(...).
 */
const MODERN_COLOR_RE =
  /\b(oklch|hsl|hsla|hwb|rgba?)\s*\(/g;

/**
 * Extract a balanced parenthesized expression starting at `(` position.
 * Returns the full function call including the function name prefix.
 */
function extractFunctionCall(
  str: string,
  fnStart: number,
  openParenIndex: number,
): string | null {
  let depth = 0;
  for (let i = openParenIndex; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") {
      depth--;
      if (depth === 0) {
        return str.slice(fnStart, i + 1);
      }
    }
  }
  return null;
}

/**
 * Check if an rgb/rgba call uses space syntax (needs conversion).
 */
function isSpaceSyntaxRgb(args: string): boolean {
  // Space syntax: "R G B" or "R G B / A" — no commas
  const inner = args.trim();
  return !inner.includes(",") && /^\d/.test(inner);
}

function convertModernColors(value: string): string {
  let result = value;
  let match: RegExpExecArray | null;

  // Reset regex state for each call
  MODERN_COLOR_RE.lastIndex = 0;

  // Collect replacements to apply from right to left (avoid index shifting)
  const replacements: { start: number; end: number; replacement: string }[] =
    [];

  while ((match = MODERN_COLOR_RE.exec(result)) !== null) {
    const fnName = match[1].toLowerCase();
    const fnStart = match.index;
    const openParen = fnStart + match[0].length - 1;

    const fullCall = extractFunctionCall(result, fnStart, openParen);
    if (!fullCall) continue;

    // For rgb/rgba, only convert if it uses space syntax
    if (fnName === "rgb" || fnName === "rgba") {
      const argsStr = fullCall.slice(fullCall.indexOf("(") + 1, -1);
      if (!isSpaceSyntaxRgb(argsStr)) continue;
    }

    const parsed = parseColor(fullCall);
    if (parsed) {
      replacements.push({
        start: fnStart,
        end: fnStart + fullCall.length,
        replacement: formatRgb(parsed),
      });
    }
  }

  // Apply replacements right-to-left to preserve indices
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  }

  return result;
}

// --- Logical properties ---

function convertLogicalProperty(
  prop: string,
  value: string,
): [string, string][] | null {
  const mapping = LOGICAL_PROPERTY_MAP[prop];
  if (!mapping) return null;

  const parts = value.trim().split(/\s+/);
  const [first, second] = mapping;

  if (parts.length >= 2) {
    return [
      [first, parts[0]],
      [second, parts[1]],
    ];
  }
  return [
    [first, parts[0]],
    [second, parts[0]],
  ];
}

// --- calc(infinity) ---

const CALC_INFINITY_RE = /calc\(\s*infinity\s*\*\s*1(px|em|rem|%|vh|vw)\s*\)/gi;
const CALC_INFINITY_SIMPLE_RE = /calc\(\s*infinity\s*\)/gi;

function resolveCalcInfinity(value: string): string {
  let result = value.replace(CALC_INFINITY_RE, (_match, unit: string) => {
    return `9999${unit}`;
  });
  result = result.replace(CALC_INFINITY_SIMPLE_RE, "9999px");
  return result;
}

// --- CSS nesting (unnest) ---

/**
 * Unnest CSS rules where @media is nested inside a selector.
 * `.sm_p-4{@media (min-width:40rem){padding:1rem!important}}`
 * becomes:
 * `@media (min-width:40rem){.sm_p-4{padding:1rem!important}}`
 */
function unnestCSSRules(css: string): string {
  // Match: selector { @media ... { ... } }
  // Use brace-balancing to find the boundaries
  let result = "";
  let i = 0;

  while (i < css.length) {
    // Look for a pattern: <selector> { ... @media ... }
    const atMediaInside = findNestedAtRule(css, i);
    if (atMediaInside) {
      result += css.slice(i, atMediaInside.outerStart);
      // Emit any preamble declarations that preceded the nested @-rule
      if (atMediaInside.preamble) {
        result += `${atMediaInside.selector}{${atMediaInside.preamble}}`;
      }
      // Emit: @media <query> { <selector> { <declarations> } }
      result += `${atMediaInside.atRule}{${atMediaInside.selector}{${atMediaInside.body}}}`;
      i = atMediaInside.outerEnd;
    } else {
      result += css.slice(i);
      break;
    }
  }

  return result;
}

interface NestedAtRule {
  outerStart: number;
  outerEnd: number;
  selector: string;
  atRule: string;
  body: string;
  /** Declarations before the nested @-rule that stay in the selector block. */
  preamble?: string;
}

function findNestedAtRule(css: string, startPos: number): NestedAtRule | null {
  // Find a { that is followed (eventually) by @media inside
  for (let i = startPos; i < css.length; i++) {
    if (css[i] === "{") {
      // Check what's inside this block
      const selector = css.slice(startPos, i).trim();
      if (!selector || selector.startsWith("@")) {
        // Skip @-rules at top level, just find matching close brace
        const closeIdx = findMatchingBrace(css, i);
        if (closeIdx === -1) return null;
        // Look further after this block
        const rest = findNestedAtRule(css, closeIdx + 1);
        if (rest) return rest;
        return null;
      }

      // We have a selector. Check if the content contains @media (or @supports)
      const innerStart = i + 1;
      const closeIdx = findMatchingBrace(css, i);
      if (closeIdx === -1) return null;

      const innerContent = css.slice(innerStart, closeIdx).trim();

      // Find any @media or @supports nested inside (may not be at the start)
      const atMatch = innerContent.match(/@(media|supports)\s/);
      if (atMatch && atMatch.index !== undefined) {
        const atPos = atMatch.index;
        const atBraceIdx = innerContent.indexOf("{", atPos);
        if (atBraceIdx === -1) continue;

        const atRule = innerContent.slice(atPos, atBraceIdx).trim();
        const atCloseIdx = findMatchingBrace(innerContent, atBraceIdx);
        if (atCloseIdx === -1) continue;

        const body = innerContent.slice(atBraceIdx + 1, atCloseIdx).trim();

        // Content before the @-rule stays as regular declarations in the selector
        const beforeAt = innerContent.slice(0, atPos).trim();

        return {
          outerStart: findSelectorStart(css, i, startPos),
          outerEnd: closeIdx + 1,
          selector,
          atRule,
          body,
          // If there are declarations before the nested @-rule, keep them
          ...(beforeAt ? { preamble: beforeAt } : {}),
        };
      }
    }
  }
  return null;
}

function findSelectorStart(css: string, braceIdx: number, minPos: number): number {
  // Walk backwards from the opening brace to find where the selector starts
  let i = braceIdx - 1;
  while (i >= minPos && css[i] !== "}" && css[i] !== ";") {
    i--;
  }
  return i + 1;
}

function findMatchingBrace(css: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// --- Range media queries ---

/**
 * Convert Media Queries Level 4 range syntax to legacy min/max.
 * (width >= 40rem) -> (min-width: 40rem)
 * (width <= 40rem) -> (max-width: 40rem)
 * (width > 40rem)  -> (min-width: 40rem)
 * (width < 40rem)  -> (max-width: 40rem)
 */
function convertRangeMediaQueries(css: string): string {
  return css.replace(
    /\(\s*width\s*(>=?|<=?)\s*([\d.]+\w*)\s*\)/g,
    (_match, op: string, value: string) => {
      if (op === ">=" || op === ">") {
        return `(min-width: ${value})`;
      }
      return `(max-width: ${value})`;
    },
  );
}

// --- CSS variable resolution ---

/** Universal selectors that apply to all elements. */
const UNIVERSAL_SELECTORS = new Set([":root", "*", "html"]);

/** Check if a definition's selector could apply to a usage's selector scope. */
function selectorsCouldMatch(defSelector: string, useSelector: string): boolean {
  if (defSelector === useSelector) return true;
  if (UNIVERSAL_SELECTORS.has(defSelector)) return true;
  return false;
}

function resolveCSSVariables(ast: csstree.CssNode): void {
  // Collect variable definitions: { selector, varName, value }
  const varDefs: { selector: string; varName: string; value: string }[] = [];

  csstree.walk(ast, {
    visit: "Rule",
    enter(rule) {
      if (rule.type !== "Rule" || !rule.prelude || !rule.block) return;

      const selector = csstree.generate(rule.prelude);

      rule.block.children.forEach((node) => {
        if (
          node.type === "Declaration" &&
          node.property.startsWith("--")
        ) {
          varDefs.push({
            selector,
            varName: node.property,
            value: csstree.generate(node.value),
          });
        }
      });
    },
  });

  if (varDefs.length === 0) return;

  // Resolve var() references — track the enclosing Rule selector for scoping
  csstree.walk(ast, {
    visit: "Rule",
    enter(rule) {
      if (rule.type !== "Rule" || !rule.prelude || !rule.block) return;
      const useSelector = csstree.generate(rule.prelude);

      csstree.walk(rule.block, {
        visit: "Function",
        enter(node, item, list) {
          if (node.name !== "var" || !list) return;

          const args: string[] = [];
          if (node.children) {
            node.children.forEach((child) => {
              args.push(csstree.generate(child));
            });
          }

          const fullArgs = args.join("");
          const commaIdx = fullArgs.indexOf(",");
          const varName = commaIdx !== -1 ? fullArgs.slice(0, commaIdx).trim() : fullArgs.trim();
          const fallback = commaIdx !== -1 ? fullArgs.slice(commaIdx + 1).trim() : null;

          // Look up the variable — only from scopes that could apply to this selector
          let resolved: string | null = null;

          // Priority: same selector > universal selectors (:root, *, html)
          for (const def of varDefs) {
            if (def.varName === varName && def.selector === useSelector) {
              resolved = def.value;
              break;
            }
          }
          if (!resolved) {
            for (const def of varDefs) {
              if (def.varName === varName && selectorsCouldMatch(def.selector, useSelector)) {
                resolved = def.value;
                break;
              }
            }
          }

          if (!resolved && fallback) {
            resolved = fallback;
          }

          if (resolved && item) {
            const replacement = csstree.parse(resolved, {
              context: "value",
            }) as csstree.Value;

            if (replacement.children) {
              replacement.children.forEach((child) => {
                list.insertData(child, item);
              });
              list.remove(item);
            }
          }
        },
      });
    },
  });
}

// --- Declaration sanitization (AST-level) ---

function sanitizeDeclarations(ast: csstree.CssNode): void {
  csstree.walk(ast, {
    visit: "Declaration",
    enter(decl) {
      // Skip custom properties
      if (decl.property.startsWith("--")) return;

      // Convert colors and calc in values
      if (decl.value.type === "Value") {
        const raw = csstree.generate(decl.value);
        let converted = convertModernColors(raw);
        converted = resolveCalcInfinity(converted);

        if (converted !== raw) {
          try {
            const newValue = csstree.parse(converted, {
              context: "value",
            }) as csstree.Value;
            decl.value = newValue;
          } catch {
            // If parsing fails, leave as-is
          }
        }
      }
    },
  });

  // Second pass: expand logical properties
  csstree.walk(ast, {
    visit: "Rule",
    enter(rule) {
      if (rule.type !== "Rule" || !rule.block) return;

      const toInsert: { property: string; value: string; important: boolean; item: csstree.ListItem<csstree.CssNode> }[] = [];

      rule.block.children.forEach(function (node, item) {
        if (node.type !== "Declaration") return;

        const mapping = LOGICAL_PROPERTY_MAP[node.property];
        if (!mapping) return;

        const valueStr = csstree.generate(node.value);
        const parts = valueStr.trim().split(/\s+/);
        const [first, second] = mapping;
        const val1 = parts[0];
        const val2 = parts.length >= 2 ? parts[1] : parts[0];

        toInsert.push(
          { property: first, value: val1, important: !!node.important, item },
          { property: second, value: val2, important: !!node.important, item },
        );
      });

      // Replace logical property declarations with physical ones
      for (const { property, value, important, item } of toInsert) {
        try {
          const newDecl: csstree.Declaration = {
            type: "Declaration",
            important,
            property,
            value: csstree.parse(value, { context: "value" }) as csstree.Value,
          };
          rule.block.children.insertData(newDecl, item);
        } catch {
          // Skip on parse failure
        }
      }

      // Remove original logical property declarations (deduplicate removal)
      const removed = new Set<csstree.ListItem<csstree.CssNode>>();
      for (const { item } of toInsert) {
        if (!removed.has(item)) {
          removed.add(item);
          rule.block.children.remove(item);
        }
      }
    },
  });
}

// --- Main export ---

/**
 * Downlevel modern CSS in an HTML email to maximize email client compatibility.
 *
 * Transformations:
 * 1. Convert modern color functions (oklch, hsl, hwb) to rgb()
 * 2. Convert space-based rgb() to comma-based rgb()
 * 3. Convert CSS logical properties to physical properties
 * 4. Resolve calc(infinity * 1px) to 9999px
 * 5. Unnest CSS nesting to flat rules
 * 6. Convert range media queries to legacy min/max syntax
 * 7. Resolve CSS variables (var()) within same stylesheet
 */
export function downlevelCSS(html: string): string {
  const $ = cheerio.load(html);

  // Process <style> blocks
  $("style").each((_, el) => {
    let css = $(el).text();

    // 1. Text-level transformations (nesting, range queries)
    css = unnestCSSRules(css);
    css = convertRangeMediaQueries(css);

    // 2. AST-level transformations
    try {
      const ast = csstree.parse(css, { parseCustomProperty: true });
      resolveCSSVariables(ast);
      sanitizeDeclarations(ast);
      $(el).text(csstree.generate(ast));
    } catch {
      // If CSS can't be parsed, still apply text-level transforms
      $(el).text(css);
    }
  });

  // Process inline styles
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    let changed = false;

    const newProps = new Map<string, string>();
    props.forEach((value, prop) => {
      // Convert modern colors in values
      const converted = convertModernColors(value);
      if (converted !== value) changed = true;

      // Convert logical properties
      const physical = convertLogicalProperty(prop, converted);
      if (physical) {
        changed = true;
        for (const [p, v] of physical) {
          newProps.set(p, v);
        }
      } else {
        // Check for calc(infinity)
        const calcFixed = resolveCalcInfinity(converted);
        if (calcFixed !== converted) changed = true;
        newProps.set(prop, calcFixed);
      }
    });

    if (changed) {
      $(el).attr("style", serializeStyle(newProps));
    }
  });

  return $.html();
}
