/**
 * Shared utilities for parsing inline CSS style declarations.
 *
 * Used by both the analyzer and the per-client transformers to avoid
 * duplicating the semicolon-aware splitting logic.
 */

/**
 * Split a CSS style string on semicolons while respecting
 * quoted strings and url()/function parentheses.
 */
export function splitStyleDeclarations(style: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let parenDepth = 0;

  for (let i = 0; i < style.length; i++) {
    const ch = style[i];

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === "(" && !inSingleQuote && !inDoubleQuote) {
      parenDepth++;
    } else if (ch === ")" && !inSingleQuote && !inDoubleQuote) {
      parenDepth = Math.max(0, parenDepth - 1);
    }

    if (ch === ";" && !inSingleQuote && !inDoubleQuote && parenDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

/**
 * Parse an inline style string into a list of property names.
 */
export function parseStyleProperties(style: string): string[] {
  const props: string[] = [];
  const parts = splitStyleDeclarations(style);
  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex === -1) continue;
    const prop = part.slice(0, colonIndex).trim().toLowerCase();
    if (prop) props.push(prop);
  }
  return props;
}

/**
 * Extract the value of a specific property from an inline style string.
 */
export function getStyleValue(style: string, property: string): string | null {
  const parts = splitStyleDeclarations(style);
  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex === -1) continue;
    const prop = part.slice(0, colonIndex).trim().toLowerCase();
    if (prop === property) {
      return part.slice(colonIndex + 1).trim();
    }
  }
  return null;
}

/**
 * Parse an inline style string into a Map of property → value.
 */
export function parseInlineStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  const declarations = splitStyleDeclarations(style);
  for (const decl of declarations) {
    const colonIndex = decl.indexOf(":");
    if (colonIndex === -1) continue;
    const prop = decl.slice(0, colonIndex).trim().toLowerCase();
    const value = decl.slice(colonIndex + 1).trim();
    if (prop && value) {
      map.set(prop, value);
    }
  }
  return map;
}

/**
 * Serialize a Map of property → value back to an inline style string.
 */
export function serializeStyle(map: Map<string, string>): string {
  const parts: string[] = [];
  map.forEach((value, prop) => {
    parts.push(`${prop}: ${value}`);
  });
  return parts.join("; ");
}
