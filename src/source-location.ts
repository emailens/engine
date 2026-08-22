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
 * Location of an element's opening tag — `<a href="…">`, not the element plus
 * all of its children. That keeps editor ranges tight enough to squiggle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function locOfElement(el: any): SourceLocation | undefined {
  const raw = (el as LocatedNode)?.sourceCodeLocation;
  if (!raw) return undefined;
  return toLoc(raw.startTag ?? raw);
}

/**
 * Location of one attribute — `href="https://…"` including the name, the `=`
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

/** Location of the first element matching `selector`, if any. */
export function locOfFirst($: CheerioAPI, selector: string): SourceLocation | undefined {
  const el = $(selector).first()[0];
  return el ? locOfElement(el) : undefined;
}

/** A `<style>` block's start position plus how to undo newline normalization. */
export interface CssBlockAnchor {
  loc: Parse5Location;
  /**
   * Extra source characters consumed before a given index of the decoded text,
   * or `null` when that can't be determined (see `crOffsetter`).
   */
  extraBefore: ((index: number) => number) | null;
  /** The block's decoded CSS text, used to count newlines. */
  text: string;
}

/**
 * The document position where a `<style>` element's CSS text begins.
 *
 * `<style>` content is RAWTEXT — parse5 decodes no entities inside it — but it
 * does normalize CRLF to LF, so on a Windows-authored file the decoded text is
 * shorter than its source and offsets need adjusting. Returns `undefined` for a
 * style element whose content isn't a single text node.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cssBlockAnchor(styleEl: any, cssText: string): CssBlockAnchor | undefined {
  const children = (styleEl as LocatedNode)?.children;
  if (!children || children.length !== 1) return undefined;
  const loc = children[0]?.sourceCodeLocation;
  if (!loc) return undefined;
  return { loc, extraBefore: crOffsetter(cssText, loc.endOffset - loc.startOffset), text: cssText };
}

/**
 * Maps an index in decoded text to the number of extra source characters that
 * preceded it — the `\r`s parse5 dropped.
 *
 * Returns a zero function when the text wasn't normalized at all, and `null`
 * when the difference isn't explained by uniform CRLF endings (character
 * references, or a file mixing CRLF and LF inside one node). Callers then fall
 * back to the node's own start, which is always consistent even if coarser.
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

  // Newline normalization can't be undone for this block — point at the block
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

  return { line, column, endLine, endColumn, offset: start, length: end - start };
}

/**
 * Position of a substring inside a text node.
 *
 * Falls back to the start of the node when the node's decoded text is a
 * different length than its source (i.e. it contains character references, so
 * indices no longer map onto the document) — the node is still the right node,
 * only the column within it is approximate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function locInTextNode(node: any, index: number, length: number): SourceLocation | undefined {
  const anchor = (node as LocatedNode)?.sourceCodeLocation;
  if (!anchor) return undefined;

  const data = (node as LocatedNode).data ?? "";
  const rawLength = anchor.endOffset - anchor.startOffset;
  const extraBefore = crOffsetter(data, rawLength);

  // Character references shifted every index in this node — point at the node,
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
