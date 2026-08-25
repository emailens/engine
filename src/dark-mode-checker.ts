import type { CheerioAPI } from "cheerio";
import * as csstree from "css-tree";
import { getClient } from "./clients";
import { parseColor, relativeLuminance, backgroundShorthandColor } from "./color-utils";
import { LIGHT_THRESHOLD, PREFERS_COLOR_SCHEME_CLIENTS } from "./dark-mode";
import { parseInlineStyle } from "./style-utils";
import { locInAttr, locOfAttr, locOfFirst } from "./source-location";
import type { CSSWarning } from "./types";

/** Matches `@media (prefers-color-scheme: dark)`, whitespace/case tolerant. */
const DARK_MEDIA_RE = /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i;

/** Most elements a partial-coverage warning is raised for, to bound output. */
const MAX_UNCOVERED_ELEMENTS = 3;

/** Selectors from a dark block that repaint the background, split by `!important`. */
interface DarkBlock {
  /** Every dark-block selector setting a background: beats a `bgcolor` attribute. */
  any: string[];
  /** Only the `!important` ones: the only thing that beats an inline style. */
  important: string[];
  /** Rules read out of the dark block(s): zero means nothing inverts, so nothing half-inverts. */
  rules: number;
}

/** A solid, opaque-enough colour above the light-luminance threshold. */
function isLight(value: string): boolean {
  const c = parseColor(value);
  if (!c || c.a < 0.5) return false;
  return relativeLuminance(c.r, c.g, c.b) > LIGHT_THRESHOLD;
}

/** Collect the background-setting selectors inside every dark media block. */
function collectDarkBlocks($: CheerioAPI): DarkBlock | null {
  const block: DarkBlock = { any: [], important: [], rules: 0 };
  let found = false;

  $("style").each((_, el) => {
    const cssText = $(el).text();
    if (!DARK_MEDIA_RE.test(cssText)) return;
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(cssText);
    } catch {
      // Unparseable CSS still proves a dark block exists, so rule 1 stands, but
      // we can't read its selectors, so it contributes nothing to coverage.
      found = true;
      return;
    }
    csstree.walk(ast, {
      visit: "Atrule",
      enter(node: csstree.CssNode) {
        if (node.type !== "Atrule" || node.name.toLowerCase() !== "media") return;
        if (!node.prelude || !DARK_MEDIA_RE.test(csstree.generate(node.prelude))) return;
        found = true;
        if (!node.block) return;
        csstree.walk(node.block, {
          visit: "Rule",
          enter(rule: csstree.CssNode) {
            if (rule.type !== "Rule") return;
            block.rules++;
            let setsBackground = false;
            let important = false;
            rule.block.children.forEach((child) => {
              if (child.type !== "Declaration") return;
              const prop = child.property.toLowerCase();
              if (prop !== "background" && prop !== "background-color") return;
              setsBackground = true;
              if (child.important) important = true;
            });
            if (!setsBackground) return;
            const selector = csstree.generate(rule.prelude).trim();
            if (!selector) return;
            block.any.push(selector);
            if (important) block.important.push(selector);
          },
        });
      },
    });
  });

  return found ? block : null;
}

/** Resolve dark-block selectors to the elements they actually match. */
function matchedElements($: CheerioAPI, selectors: string[]): Set<unknown> {
  const matched = new Set<unknown>();
  for (const selector of selectors) {
    try {
      $(selector).each((_, el) => {
        matched.add(el);
      });
    } catch {
      // Selector cheerio can't evaluate (e.g. a pseudo-class); treat as no match.
    }
  }
  return matched;
}

/** Short human-readable handle for the offending element. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeSelector($: CheerioAPI, el: any): string {
  const $el = $(el);
  const tag = (el.tagName as string)?.toLowerCase() || "element";
  const id = $el.attr("id");
  if (id) return `${tag}#${id}`;
  const cls = $el.attr("class");
  if (cls) return `${tag}.${cls.split(/\s+/)[0]}`;
  return tag;
}

/**
 * Dark-mode correctness checks for emails that ship dark styling. Both rules
 * are gated on the email actually having a `@media (prefers-color-scheme: dark)`
 * block; an email with no dark styling comes back completely clean.
 *
 *  1. Dark CSS with no `<meta name="color-scheme">` /
 *     `<meta name="supported-color-schemes">` opt-in: Apple Mail and friends
 *     may never enter dark mode, so the media query silently never fires.
 *  2. Partial coverage: an element carries a hardcoded light background that
 *     the dark block never overrides, so it stays white while the rest of the
 *     email inverts; a half-inverted render (dark text on a still-white card).
 *
 * ponytail: coverage analysis only looks at *inline* light backgrounds
 * (`bgcolor` attribute or inline `background`/`background-color`), because
 * cascade order there is unambiguous: an inline style needs an `!important`
 * dark rule to lose, a `bgcolor` attribute loses to any dark rule. Light
 * backgrounds set in `<style>` rules, and dark inline *text* colours stranded
 * on an inverted background, are not analysed; that needs real cascade
 * resolution, and a false positive here is worse than a miss.
 *
 * @internal
 */
export function checkDarkModeFromDom($: CheerioAPI, source?: string): CSSWarning[] {
  const darkBlock = collectDarkBlocks($);
  if (!darkBlock) return []; // No dark styling, nothing to say.

  const warnings: CSSWarning[] = [];

  // Rule 1: dark styles with no opt-in meta may never activate.
  const hasOptIn = $("meta").toArray().some((el) => {
    const name = ($(el).attr("name") || "").trim().toLowerCase();
    return name === "color-scheme" || name === "supported-color-schemes";
  });

  if (!hasOptIn) {
    const headLoc = locOfFirst($, "head");
    for (const clientId of PREFERS_COLOR_SCHEME_CLIENTS) {
      warnings.push({
        severity: "warning",
        client: clientId,
        property: "dark-mode-opt-in",
        message:
          `The email has @media (prefers-color-scheme: dark) styles but no dark-mode opt-in meta tag. ` +
          `${getClient(clientId)?.name ?? clientId} may keep the email in light mode, so the dark styles never activate.`,
        suggestion:
          'Add both opt-in tags to <head>: <meta name="color-scheme" content="light dark"> and ' +
          '<meta name="supported-color-schemes" content="light dark">.',
        fixType: "structural",
        ...(headLoc ? { loc: headLoc, locs: [headLoc] } : {}),
      });
    }
  }

  // Rule 2: light backgrounds the dark block leaves untouched. A dark block we
  // read no rules out of (empty, truncated, unparseable) repaints nothing, so
  // there is nothing for a light background to be half-inverted against.
  if (darkBlock.rules === 0) return warnings;
  const coveredByImportant = matchedElements($, darkBlock.important);
  const coveredByAny = matchedElements($, darkBlock.any);
  let uncovered = 0;

  $("[bgcolor], [style]").each((_, el) => {
    if (uncovered >= MAX_UNCOVERED_ELEMENTS) return false;
    const $el = $(el);
    const style = parseInlineStyle($el.attr("style") || "");
    // An inline background wins over the bgcolor attribute, so only one of the
    // two is ever the colour on screen, and they need different overrides.
    const inline = style.get("background-color") ?? backgroundShorthandColor(style.get("background"));
    const color = inline ?? $el.attr("bgcolor");
    if (!color || !isLight(color)) return;
    if (inline ? coveredByImportant.has(el) : coveredByAny.has(el)) return;

    uncovered++;
    const selector = describeSelector($, el);
    // The declaration that set the colour, where the raw source lets us find
    // it; this warning is about one background, and the attribute around it
    // may hold five other declarations that are perfectly fine.
    const attrLoc = locOfAttr(el, inline ? "style" : "bgcolor");
    const loc = inline
      ? (locInAttr(attrLoc, source, style.get("background-color") !== undefined
          ? "background-color" : "background") ?? attrLoc)
      : attrLoc;
    for (const clientId of PREFERS_COLOR_SCHEME_CLIENTS) {
      warnings.push({
        severity: "warning",
        client: clientId,
        property: "dark-mode-coverage",
        message:
          `<${selector}> keeps its hardcoded light background (${color}) in dark mode; the dark block never overrides it. ` +
          `The rest of the email inverts around it, producing a half-inverted render (e.g. light text left on a still-white background).`,
        suggestion: inline
          ? `Override it inside @media (prefers-color-scheme: dark) with a dark background-color and !important (an inline style beats a plain rule), or move the colour onto a class the dark block already targets.`
          : `Override it inside @media (prefers-color-scheme: dark) with a dark background-color, or give the element a class the dark block already targets.`,
        fixType: "css",
        selector,
        ...(loc ? { loc, locs: [loc] } : {}),
      });
    }
  });

  return warnings;
}
