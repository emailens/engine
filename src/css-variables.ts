import type { CheerioAPI } from "cheerio";
import * as csstree from "css-tree";
import { splitStyleDeclarations } from "./style-utils";

export const MAX_VAR_DEPTH = 10;

export interface VarResolutionResult {
  resolved: string;
  hadUnresolved: boolean;
  usedVars: string[];
}

/**
 * Check if a CSS declaration or value uses CSS Custom Properties
 * either as a custom property declaration (`--*`) or via `var(...)`.
 */
export function usesCustomProperties(property: string, value?: string): boolean {
  if (property.startsWith("--")) return true;
  if (value && /var\(\s*--[\w-]+/i.test(value)) return true;
  return false;
}

/**
 * Extract all CSS Custom Properties (`--*`) declared in `<style>` blocks
 * and inline `style` attributes.
 *
 * In emails, custom properties are almost exclusively defined in `:root`,
 * `html`, `body`, or top-level containers.
 */
export function extractCssVariables($: CheerioAPI): Map<string, string> {
  const vars = new Map<string, string>();

  // 1. Extract from <style> blocks
  $("style").each((_, el) => {
    const css = $(el).text();
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(css, { parseCustomProperty: true });
    } catch {
      return;
    }

    csstree.walk(ast, {
      visit: "Declaration",
      enter(node: csstree.CssNode) {
        if (node.type === "Declaration" && node.property.startsWith("--")) {
          const val = csstree.generate(node.value).trim();
          vars.set(node.property.toLowerCase(), val);
        }
      },
    });
  });

  // 2. Extract from inline style attributes
  $("[style*='--']").each((_, el) => {
    const style = $(el).attr("style") || "";
    const parts = splitStyleDeclarations(style);
    for (const part of parts) {
      const colonIdx = part.indexOf(":");
      if (colonIdx === -1) continue;
      const prop = part.slice(0, colonIdx).trim().toLowerCase();
      if (prop.startsWith("--")) {
        const val = part.slice(colonIdx + 1).trim();
        vars.set(prop, val);
      }
    }
  });

  return vars;
}

/**
 * Parse arguments of a single `var(...)` call starting at `startIndex` in `str`.
 * Returns the parsed varName, fallback, and the index after the closing paren.
 */
function parseVarCall(str: string, startIndex: number): {
  varName: string;
  fallback: string | null;
  endIndex: number;
} | null {
  const openParen = str.indexOf("(", startIndex);
  if (openParen === -1) return null;

  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let commaIndex = -1;
  let endIndex = -1;

  for (let i = openParen + 1; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0) {
          endIndex = i + 1;
          break;
        }
      } else if (ch === "," && depth === 1 && commaIndex === -1) {
        commaIndex = i;
      }
    }
  }

  if (endIndex === -1) return null;

  let varName: string;
  let fallback: string | null = null;

  if (commaIndex !== -1) {
    varName = str.slice(openParen + 1, commaIndex).trim();
    fallback = str.slice(commaIndex + 1, endIndex - 1).trim();
  } else {
    varName = str.slice(openParen + 1, endIndex - 1).trim();
  }

  return { varName, fallback, endIndex };
}

/**
 * Resolves all `var(--name, fallback)` expressions in a CSS value.
 *
 * Supports:
 * - Direct variable substitution: `var(--brand)` -> `#007bff`
 * - Fallback values: `var(--unknown, #333)` -> `#333`
 * - Nested fallbacks: `var(--unknown, var(--brand, red))` -> `#007bff`
 * - Cyclic reference detection (stops cycles safely)
 * - Nested expressions within functions like `calc()`, `rgb()`, etc.
 */
export function resolveCssValue(
  value: string,
  variables: Map<string, string>,
  depth = 0,
  visited = new Set<string>(),
): VarResolutionResult {
  if (!value || depth > MAX_VAR_DEPTH) {
    return { resolved: value, hadUnresolved: false, usedVars: [] };
  }

  const varRegex = /\bvar\(/i;
  if (!varRegex.test(value)) {
    return { resolved: value, hadUnresolved: false, usedVars: [] };
  }

  let result = "";
  let lastIndex = 0;
  let hadUnresolved = false;
  const usedVars: string[] = [];

  const searchRegex = /\bvar\(/gi;
  let match: RegExpExecArray | null;

  while ((match = searchRegex.exec(value)) !== null) {
    const varStart = match.index;
    result += value.slice(lastIndex, varStart);

    const parsed = parseVarCall(value, varStart);
    if (!parsed) {
      result += match[0];
      lastIndex = varStart + match[0].length;
      continue;
    }

    const { varName, fallback, endIndex } = parsed;
    const cleanVarName = varName.toLowerCase();
    usedVars.push(cleanVarName);

    if (visited.has(cleanVarName)) {
      hadUnresolved = true;
      if (fallback) {
        const fbRes = resolveCssValue(fallback, variables, depth + 1, visited);
        result += fbRes.resolved;
        usedVars.push(...fbRes.usedVars);
      } else {
        result += `var(${varName})`;
      }
    } else if (variables.has(cleanVarName)) {
      const rawVal = variables.get(cleanVarName)!;
      const nextVisited = new Set(visited);
      nextVisited.add(cleanVarName);
      const valRes = resolveCssValue(rawVal, variables, depth + 1, nextVisited);
      if (valRes.hadUnresolved && fallback !== null) {
        const fbRes = resolveCssValue(fallback, variables, depth + 1, visited);
        result += fbRes.resolved;
        usedVars.push(...fbRes.usedVars);
        hadUnresolved = true;
      } else {
        result += valRes.resolved;
        usedVars.push(...valRes.usedVars);
        if (valRes.hadUnresolved) hadUnresolved = true;
      }
    } else if (fallback !== null) {
      const fbRes = resolveCssValue(fallback, variables, depth + 1, visited);
      result += fbRes.resolved;
      usedVars.push(...fbRes.usedVars);
      if (fbRes.hadUnresolved) hadUnresolved = true;
    } else {
      hadUnresolved = true;
      result += `var(${varName})`;
    }

    lastIndex = endIndex;
    searchRegex.lastIndex = endIndex;
  }

  result += value.slice(lastIndex);
  return { resolved: result, hadUnresolved, usedVars };
}
