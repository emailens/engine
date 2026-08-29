import type { CheerioAPI } from "cheerio";
import * as csstree from "css-tree";
import { EMAIL_MAX_WIDTH, UNBREAKABLE_STRING_LENGTH, EMPTY_OVERFLOW, MAX_WARNING_LOCATIONS } from "./constants";

/**
 * Below this, a fixed width is a deliberate column or spacer rather than a
 * statement about the layout. 320px is the narrowest viewport still in common
 * use, so anything at least this wide has to survive a phone somehow.
 */
const RESPONSIVE_MIN_WIDTH = 320;
import { fromHtml, type ParseOptions } from "./parse-html";
import { visibleTextNodes } from "./dom-text";
import { cssBlockAnchor, locInCssBlock, locInTextNode, locOfAttr } from "./source-location";
import type { OverflowIssue, OverflowReport, SourceLocation } from "./types";

/**
 * Read an element's fixed pixel width, from either an inline `width: Npx`
 * style or a numeric `width` HTML attribute (which is px). Returns null for
 * percentage / auto / missing widths; those are responsive, not fixed.
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

/**
 * Record a too-wide element once per (label, width), keeping every place it
 * occurs so a consumer can flag them all rather than only the first.
 */
function addWidthIssue(
  width: number,
  label: string,
  issues: OverflowIssue[],
  seen: Map<string, OverflowIssue>,
  loc?: SourceLocation,
): void {
  const key = `w:${label}:${width}`;
  const existing = seen.get(key);
  if (existing) {
    addOccurrence(existing, loc);
    return;
  }
  const issue: OverflowIssue = {
    rule: "fixed-width-overflow",
    severity: "warning",
    message: `${label} has a fixed width of ${width}px, wider than the ${EMAIL_MAX_WIDTH}px email frame; it will force horizontal scrolling, especially on mobile.`,
    detail: `Use width:100% with max-width:${EMAIL_MAX_WIDTH}px instead of a fixed width beyond the frame.`,
    ...(loc ? { loc, locs: [loc] } : {}),
  };
  seen.set(key, issue);
  issues.push(issue);
}

/**
 * Resolve a position in the concatenated text back to the node it starts in.
 *
 * A run that spans nodes (`<b>aaa</b>bbb`) is anchored where it begins, with
 * the length clipped to that node: one range cannot cover both halves, and
 * the start is what a reader needs.
 */
function locateInNodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: any[],
  starts: number[],
  index: number,
  length: number,
  source?: string,
): SourceLocation | undefined {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= index) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found === -1) return undefined;

  const node = nodes[found];
  const within = index - starts[found];
  const available = ((node.data as string) ?? "").length - within;
  return locInTextNode(node, within, Math.min(length, available), source);
}

/** Append another place this issue occurs, respecting the cap. */
function addOccurrence(issue: { locs?: SourceLocation[]; locsTruncated?: boolean }, loc?: SourceLocation) {
  if (!loc || !issue.locs) return;
  if (issue.locs.some((l) => l.offset === loc.offset)) return;
  if (issue.locs.length >= MAX_WARNING_LOCATIONS) {
    issue.locsTruncated = true;
    return;
  }
  issue.locs.push(loc);
}

/**
 * Detect content that will overflow the email frame / mobile viewport, a
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
 * somewhere, assume the author is handling wrapping, trading recall for far
 * fewer false positives.
 */
export function checkOverflowFromDom($: CheerioAPI, source?: string): OverflowReport {
  const issues: OverflowIssue[] = [];
  const seen = new Map<string, OverflowIssue>();
  const tokensSeen = new Set<string>();

  // 1a. Fixed widths (inline attr/style) wider than the email frame.
  $("[width], [style*='width']").each((_, el) => {
    const $el = $(el);
    const width = fixedPxWidth($el);
    if (width === null || width <= EMAIL_MAX_WIDTH) return;
    if (isFluid($el.attr("style") || "")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = ((el as any).tagName || "element").toLowerCase();
    // Point at whichever of the two declared the width.
    const fromStyle = /(?:^|[;\s])width\s*:\s*\d+px/i.test($el.attr("style") || "");
    addWidthIssue(width, `<${tag}>`, issues, seen, locOfAttr(el, fromStyle ? "style" : "width"));
  });

  // 1b. Fixed widths declared in <style> block rules (incl. inside @media).
  $("style").each((_, el) => {
    const cssText = $(el).text();
    const anchor = cssBlockAnchor(el, cssText, source);
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(cssText, { positions: true });
    } catch {
      return;
    }
    csstree.walk(ast, {
      visit: "Rule",
      enter(node: csstree.CssNode) {
        if (node.type !== "Rule") return;
        let widthPx: number | null = null;
        let fluid = false;
        let widthLoc: SourceLocation | undefined;
        node.block.children.forEach((child) => {
          if (child.type !== "Declaration") return;
          const prop = child.property.toLowerCase();
          const val = csstree.generate(child.value);
          if (prop === "width") {
            const m = val.match(/^(\d+)px$/);
            if (m) {
              widthPx = parseInt(m[1], 10);
              widthLoc = locInCssBlock(anchor, child.loc);
            }
            if (/\b100%/.test(val)) fluid = true;
          } else if (prop === "max-width" && /\b100%/.test(val)) {
            fluid = true;
          }
        });
        if (widthPx !== null && widthPx > EMAIL_MAX_WIDTH && !fluid) {
          const selector = csstree.generate(node.prelude).trim().slice(0, 40);
          addWidthIssue(widthPx, selector || "rule", issues, seen, widthLoc);
        }
      },
    });
  });

  // 2. Long unbreakable strings in visible text: skip if the email already
  //    opts into wrapping anywhere (author is handling it).
  const usesWrapGuard = /overflow-wrap|word-break|word-wrap/i.test($.html());
  if (!usesWrapGuard) {
    // Scan the concatenated text, not each node: `<b>aaa</b>bbb` renders as one
    // unbroken run, and it is that run's length that decides whether it
    // overflows. Node boundaries are tracked alongside so the run can still be
    // pointed at; it is anchored where it starts.
    const nodes = visibleTextNodes($);
    const starts: number[] = [];
    let text = "";
    for (const node of nodes) {
      starts.push(text.length);
      text += (node.data as string) ?? "";
    }

    let at = 0;
    for (const token of text.split(/(\s+)/)) {
      const start = at;
      at += token.length;
      if (/^\s*$/.test(token)) continue;
      if (token.length <= UNBREAKABLE_STRING_LENGTH || tokensSeen.has(token)) continue;
      tokensSeen.add(token);
      const preview = token.length > 50 ? `${token.slice(0, 50)}…` : token;
      const loc = locateInNodes(nodes, starts, start, token.length, source);
      issues.push({
        rule: "unbreakable-string",
        severity: "warning",
        message: `A ${token.length}-character unbroken string ("${preview}") can't wrap and will force horizontal scrolling on narrow screens.`,
        detail: `Add overflow-wrap: anywhere (or word-break: break-word) to its container.`,
        ...(loc ? { loc, locs: [loc] } : {}),
      });
    }
  }

  // 3. A fixed-width layout with no responsive rules at all.
  //
  //    checkOverflow's other rules ask whether something is *wider* than the
  //    frame. This asks whether the email has any instructions for a narrow
  //    one. A 600px design with no @media block is not broken on any single
  //    client, which is why it passes everything else: it is broken across
  //    them, because each mobile client then invents its own behaviour.
  //
  //    Observed on a real template of ours: Outlook Android stretched the
  //    fixed table to fill the viewport while the hero image, correctly
  //    written as `width:100%; max-width:600px`, held at 600 and left grey
  //    gutters down both sides. The markup was textbook; the absence of a
  //    breakpoint was the fault.
  if (!/@media/i.test($.html())) {
    let widest = 0;
    let widestLabel = "";
    let widestLoc: SourceLocation | undefined;
    $("table, td, div").each((_, el) => {
      const $el = $(el);
      const width = fixedPxWidth($el);
      // A fixed width only matters here if it is layout-bearing. Spacer cells
      // and small columns are fixed on purpose and say nothing about the
      // design's responsiveness.
      if (width === null || width < RESPONSIVE_MIN_WIDTH) return;
      if (isFluid($el.attr("style") || "")) return;
      if (width <= widest) return;
      widest = width;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      widestLabel = `<${((el as any).tagName || "element").toLowerCase()}>`;
      const fromStyle = /(?:^|[;\s])width\s*:\s*\d+px/i.test($el.attr("style") || "");
      widestLoc = locOfAttr(el, fromStyle ? "style" : "width");
    });

    if (widest > 0) {
      issues.push({
        rule: "no-responsive-rules",
        severity: "warning",
        message: `${widestLabel} is a fixed ${widest}px wide and the email has no @media rules, so nothing tells a narrow screen what to do.`,
        detail:
          `Each mobile client then decides for itself: one scales the layout to fit, another leaves it to ` +
          `scroll, a third stretches the container while any child with a px max-width stays put and leaves ` +
          `gutters. Give the container width:100% with max-width:${widest}px, and add a breakpoint for the ` +
          `parts that need to stack.`,
        ...(widestLoc ? { loc: widestLoc, locs: [widestLoc] } : {}),
      });
    }
  }

  return { hasOverflow: issues.length > 0, issues };
}

/**
 * Detect content likely to overflow the email frame or mobile viewport:
 * fixed pixel widths wider than the frame, and long unbreakable strings.
 */
export function checkOverflow(html: string, options?: ParseOptions): OverflowReport {
  return fromHtml(
    html,
    EMPTY_OVERFLOW,
    ($, h) => checkOverflowFromDom($, options?.positions ? h : undefined),
    options,
  );
}
