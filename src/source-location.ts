import type { CheerioAPI } from "cheerio";
import type { SourceLocation } from "./types";

/**
 * Source position helpers.
 *
 * Positions come from parse5, which records them only when the DOM was parsed
 * with `sourceCodeLocationInfo: true` (see `parse-html.ts`). Every helper here
 * returns `undefined` when that information is absent, so analyzers can call
 * them unconditionally and simply attach `loc: undefined` in legacy mode.
 */

/** parse5's location record, attached to nodes as `sourceCodeLocation`. */
export interface Parse5Location {
  startLine: number;
  startCol: number;
  startOffset: number;
  endLine: number;
  endCol: number;
  endOffset: number;
  attrs?: Record<string, Parse5Location>;
  startTag?: Parse5Location;
}

interface LocatedNode {
  sourceCodeLocation?: Parse5Location;
  children?: LocatedNode[];
  type?: string;
  data?: string;
}

/** css-tree's position record (`positions: true`). */
export interface CssTreeLocation {
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
}

function toLoc(p: Parse5Location): SourceLocation {
  return {
    line: p.startLine,
    column: p.startCol,
    endLine: p.endLine,
    endColumn: p.endCol,
    offset: p.startOffset,
    length: p.endOffset - p.startOffset,
  };
}

/**
 * Location of an element's opening tag: `<a href="…">`, not the element plus
 * all of its children. That keeps editor ranges tight enough to squiggle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function locOfElement(el: any): SourceLocation | undefined {
  const raw = (el as LocatedNode)?.sourceCodeLocation;
  if (!raw) return undefined;
  return toLoc(raw.startTag ?? raw);
}

/**
 * Location of one attribute: `href="https://…"` including the name, the `=`
 * and the quotes. Falls back to the element when the attribute has no recorded
 * position (it was added after parsing, or locations are off).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function locOfAttr(el: any, attr: string): SourceLocation | undefined {
  const raw = (el as LocatedNode)?.sourceCodeLocation;
  if (!raw) return undefined;
  const attrLoc = raw.attrs?.[attr] ?? raw.startTag?.attrs?.[attr];
  return attrLoc ? toLoc(attrLoc) : locOfElement(el);
}

/**
 * Where a single declaration sits inside a `style="…"` attribute.
 *
 * `locOfAttr` gives the whole attribute, which is a fair place to act but a
 * poor place to look: `style="margin:0;padding:0;font-size:1rem;color:#333"`
 * underlined end to end says "something in here", when the engine knows
 * exactly which declaration it means.
 *
 * Needs the raw source, because the DOM keeps the decoded attribute value and
 * an index into that is not an index into the file. Returns undefined rather
 * than a guess whenever the declaration cannot be found exactly, an entity in
 * the attribute, a property that only exists after decoding, and the caller
 * falls back to the whole attribute.
 *
 * `occurrence` picks among repeats: `style="display:block;display:flex"` is
 * two declarations of one property, and they are different places.
 */
export function locInAttr(
  attrLoc: SourceLocation | undefined,
  source: string | undefined,
  property: string,
  occurrence = 0,
): SourceLocation | undefined {
  if (!attrLoc || !source) return undefined;
  const raw = source.slice(attrLoc.offset, attrLoc.offset + attrLoc.length);
  // Everything from the first quote to the last: the value, without the
  // attribute name or the quotes themselves.
  const open = raw.search(/["']/);
  const close = raw.lastIndexOf(raw[open]);
  if (open === -1 || close <= open) return undefined;

  const found = declarationsIn(raw.slice(open + 1, close), property);
  const hit = found[occurrence];
  if (!hit) return undefined;

  const start = attrLoc.offset + open + 1 + hit.start;
  const end = attrLoc.offset + open + 1 + hit.end;
  const from = positionOf(source, start);
  const to = positionOf(source, end);
  return {
    line: from.line,
    column: from.column,
    endLine: to.line,
    endColumn: to.column,
    offset: start,
    length: end - start,
  };
}

/**
 * Every `property: value` in a style attribute's value, by index.
 *
 * Split on semicolons outside parentheses, so `background:url(a;b.png)` stays
 * one declaration, and match the property at the head of its own declaration,
 * not inside a value, where `background: url(font-size.png)` would otherwise
 * look like a `font-size`.
 */
function declarationsIn(value: string, property: string): Array<{ start: number; end: number }> {
  const wanted = property.toLowerCase();
  const found: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let start = 0;

  const consider = (from: number, to: number) => {
    const text = value.slice(from, to);
    const colon = text.indexOf(":");
    if (colon === -1) return;
    if (text.slice(0, colon).trim().toLowerCase() !== wanted) return;
    // Trim the surrounding whitespace off the range, so the underline covers
    // the declaration and not the space before it.
    const lead = text.length - text.trimStart().length;
    const trail = text.length - text.trimEnd().length;
    if (from + lead < to - trail) found.push({ start: from + lead, end: to - trail });
  };

  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      consider(start, i);
      start = i + 1;
    }
  }
  consider(start, value.length);
  return found;
}

/** Location of the first element matching `selector`, if any. */
export function locOfFirst($: CheerioAPI, selector: string): SourceLocation | undefined {
  const el = $(selector).first()[0];
  return el ? locOfElement(el) : undefined;
}

/** A `<style>` block's start position plus how to map offsets inside it. */
export interface CssBlockAnchor {
  loc: Parse5Location;
  /** Extra source characters before a given index of the decoded text. */
  extraBefore: ((index: number) => number) | null;
  /** The whole document, when the caller had it: makes positions exact. */
  source?: string;
}

/**
 * The document position where a `<style>` element's CSS text begins.
 *
 * Returns `undefined` for a style element whose content isn't a single text
 * node. Pass `source` (the original HTML) to get exact offsets whatever the
 * file's line endings; without it the mapping holds only for a block whose
 * endings are uniform.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cssBlockAnchor(
  styleEl: any,
  cssText: string,
  source?: string,
): CssBlockAnchor | undefined {
  const children = (styleEl as LocatedNode)?.children;
  if (!children || children.length !== 1) return undefined;
  const loc = children[0]?.sourceCodeLocation;
  if (!loc) return undefined;

  // `<style>` content is RAWTEXT: parse5 decodes no references inside it, so
  // the only divergence from the source is newline normalization.
  const mapper = source ? crMapper(source.slice(loc.startOffset, loc.endOffset), cssText) : null;
  const extraBefore = mapper
    ? (index: number) => mapper(index) - index
    : crOffsetter(cssText, loc.endOffset - loc.startOffset);

  return { loc, extraBefore, ...(mapper ? { source } : {}) };
}

/**
 * Maps an index in decoded text to the source offset it came from.
 *
 * parse5 hands analyzers decoded text: CRLF collapsed to LF, character
 * references resolved, so an index into that text is not an index into the
 * file. Walking the raw and decoded spans in step records exactly where they
 * diverge, which is what makes `&amp;` and mixed line endings resolvable at
 * all. Returns `null` if the two don't line up, so callers fall back rather
 * than emit a position built on a guess.
 */
function crMapper(raw: string, decoded: string): ((index: number) => number) | null {
  if (raw.length === decoded.length) return (index) => index;

  const points: number[] = []; // decoded index where raw ran ahead
  const extras: number[] = []; // cumulative extra raw characters from there on
  let r = 0;
  let d = 0;
  let extra = 0;

  while (d < decoded.length) {
    if (r >= raw.length) return null;
    if (raw[r] === decoded[d]) {
      r++;
      d++;
      continue;
    }
    // The only divergence possible in raw text is a normalized line ending.
    if (raw[r] === "\r" && decoded[d] === "\n") {
      const consumed = raw[r + 1] === "\n" ? 2 : 1;
      extra += consumed - 1;
      points.push(d);
      extras.push(extra);
      r += consumed;
      d += 1;
      continue;
    }
    return null;
  }

  if (r !== raw.length) return null;
  return (index) => index + lookup(points, extras, index);
}

/** Cumulative extra characters recorded at or before `index`. */
function lookup(points: number[], extras: number[], index: number): number {
  let lo = 0;
  let hi = points.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid] < index) {
      found = extras[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Where a decoded substring sits in the raw source.
 *
 * Walking the two in step doesn't work for text: `&amp;` decodes to `&`, so a
 * left-to-right walk can't tell a literal ampersand from the start of a
 * reference without backtracking. Counting occurrences sidesteps it, the nth
 * occurrence of the token in the decoded text is the nth in the source, as
 * long as the token itself wasn't encoded. Returns -1 when it was.
 */
function findRawOffset(raw: string, decoded: string, index: number, token: string): number {
  if (!token) return -1;

  let occurrence = 0;
  for (let at = decoded.indexOf(token); at !== -1 && at < index; at = decoded.indexOf(token, at + 1)) {
    occurrence++;
  }

  let found = -1;
  let from = 0;
  for (let i = 0; i <= occurrence; i++) {
    found = raw.indexOf(token, from);
    if (found === -1) return -1;
    from = found + 1;
  }
  return found;
}

/** Line and column (both 1-based) of an absolute offset in the source. */
export function positionOf(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, offset);
  return { line: prefix.split("\n").length, column: offset - prefix.lastIndexOf("\n") };
}

/**
 * Fallback for when the raw source isn't available: assume every newline in
 * the block was a CRLF, which is true of a normally-authored Windows file.
 * Returns a zero function when nothing was normalized, and `null` when the
 * difference isn't explained by uniform endings.
 */
function crOffsetter(text: string, rawLength: number): ((index: number) => number) | null {
  const removed = rawLength - text.length;
  if (removed === 0) return () => 0;
  const newlines = countNewlines(text, text.length);
  if (removed !== newlines || newlines === 0) return null;
  return (index) => countNewlines(text, index);
}

function countNewlines(text: string, upTo: number): number {
  let n = 0;
  for (let i = 0; i < upTo && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Translate a css-tree position inside a `<style>` block into a document
 * position, given that block's anchor from `cssBlockAnchor()`.
 */
export function locInCssBlock(
  anchor: CssBlockAnchor | undefined,
  cssLoc: CssTreeLocation | null | undefined,
): SourceLocation | undefined {
  if (!anchor || !cssLoc) return undefined;
  const { loc: block, extraBefore } = anchor;

  // Newline normalization can't be undone for this block: point at the block
  // itself rather than emit an offset that disagrees with its line/column.
  if (!extraBefore) {
    return {
      line: block.startLine,
      column: block.startCol,
      endLine: block.startLine,
      endColumn: block.startCol,
      offset: block.startOffset,
      length: 0,
    };
  }

  // css-tree lines and columns are 1-based and relative to the parsed string;
  // only the first line shares a line with the anchor's column offset.
  const line = block.startLine + cssLoc.start.line - 1;
  const column =
    cssLoc.start.line === 1 ? block.startCol + cssLoc.start.column - 1 : cssLoc.start.column;
  const endLine = block.startLine + cssLoc.end.line - 1;
  const endColumn =
    cssLoc.end.line === 1 ? block.startCol + cssLoc.end.column - 1 : cssLoc.end.column;

  const start = block.startOffset + cssLoc.start.offset + extraBefore(cssLoc.start.offset);
  const end = block.startOffset + cssLoc.end.offset + extraBefore(cssLoc.end.offset);

  // With the source, read the line and column off the offset rather than
  // deriving them: they can't disagree with each other that way.
  if (anchor.source) {
    const from = positionOf(anchor.source, start);
    const to = positionOf(anchor.source, end);
    return {
      line: from.line,
      column: from.column,
      endLine: to.line,
      endColumn: to.column,
      offset: start,
      length: end - start,
    };
  }

  return { line, column, endLine, endColumn, offset: start, length: end - start };
}

/**
 * Position of a substring inside a text node.
 *
 * Falls back to the start of the node when the node's decoded text is a
 * different length than its source (i.e. it contains character references, so
 * indices no longer map onto the document); the node is still the right node,
 * only the column within it is approximate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function locInTextNode(
  node: any,
  index: number,
  length: number,
  source?: string,
): SourceLocation | undefined {
  const anchor = (node as LocatedNode)?.sourceCodeLocation;
  if (!anchor) return undefined;

  const data = (node as LocatedNode).data ?? "";
  const rawLength = anchor.endOffset - anchor.startOffset;

  // The exact path: find the matched text in the node's raw source, so a
  // `&amp;` or a CRLF earlier in the node shifts the result by the right amount
  // instead of forcing a fallback.
  if (source) {
    const raw = source.slice(anchor.startOffset, anchor.endOffset);
    const token = data.slice(index, index + length);
    const at = findRawOffset(raw, data, index, token);
    if (at !== -1) {
      const start = anchor.startOffset + at;
      const from = positionOf(source, start);
      const to = positionOf(source, start + token.length);
      return {
        line: from.line,
        column: from.column,
        endLine: to.line,
        endColumn: to.column,
        offset: start,
        length: token.length,
      };
    }
  }

  const extraBefore = crOffsetter(data, rawLength);

  // Character references shifted every index in this node: point at the node,
  // which is still the right node, with a range that stays inside it.
  if (!extraBefore) {
    const clamped = Math.min(length, rawLength);
    return {
      line: anchor.startLine,
      column: anchor.startCol,
      endLine: anchor.startLine,
      endColumn: anchor.startCol + clamped,
      offset: anchor.startOffset,
      length: clamped,
    };
  }

  const start = positionAt(data, index, anchor);
  const end = positionAt(data, index + length, anchor);
  const startOffset = anchor.startOffset + index + extraBefore(index);
  const endOffset = anchor.startOffset + index + length + extraBefore(index + length);

  return {
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    offset: startOffset,
    length: endOffset - startOffset,
  };
}

function positionAt(
  data: string,
  index: number,
  anchor: Parse5Location,
): { line: number; column: number } {
  const prefix = data.slice(0, index);
  const newlines = prefix.split("\n").length - 1;
  if (newlines === 0) {
    return { line: anchor.startLine, column: anchor.startCol + index };
  }
  return { line: anchor.startLine + newlines, column: index - prefix.lastIndexOf("\n") };
}
