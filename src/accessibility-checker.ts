import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import type { AccessibilityIssue, AccessibilityReport } from "./types";
import { GENERIC_LINK_TEXT, EMPTY_ACCESSIBILITY } from "./constants";
import { fromHtml, type ParseOptions } from "./parse-html";
import { simulateDarkMode } from "./dark-mode";
import { locOfAttr, locOfElement, locOfFirst } from "./source-location";
import { getStyleValue, splitStyleDeclarations, splitTopLevel } from "./style-utils";
import { parseColor, relativeLuminance, contrastRatio, wcagGrade, alphaBlend, backgroundShorthandColor, gradientStops, formatRgb } from "./color-utils";
import type { RGBA } from "./color-utils";

// Per-rule penalty caps; only the score penalty is capped, all issues are still reported
const RULE_PENALTY_CAPS: Record<string, number> = {
  "img-missing-alt": 3,
  "link-generic-text": 3,
  "link-no-accessible-name": 3,
  "table-missing-role": 2,
  "low-contrast": 3,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeElement($: cheerio.CheerioAPI, el: any): string {
  const tag = (el.tagName as string)?.toLowerCase() || "unknown";
  const src = $(el).attr("src");
  const href = $(el).attr("href");
  if (src) return `<${tag} src="${src.slice(0, 60)}${src.length > 60 ? "..." : ""}">`;
  if (href) return `<${tag} href="${href.slice(0, 60)}${href.length > 60 ? "..." : ""}">`;
  const text = $(el).text().trim().slice(0, 40);
  if (text) return `<${tag}>${text}${$(el).text().trim().length > 40 ? "..." : ""}</${tag}>`;
  return `<${tag}>`;
}

function checkLangAttribute($: cheerio.CheerioAPI): AccessibilityIssue | null {
  const lang = $("html").attr("lang");
  if (!lang || !lang.trim()) {
    const loc = locOfFirst($, "html");
    return {
      severity: "error",
      rule: "missing-lang",
      message: "Missing lang attribute on <html> element",
      ...(loc ? { loc } : {}),
      details: 'Screen readers use the lang attribute to determine pronunciation. Add lang="en" (or appropriate language code).',
    };
  }
  return null;
}

/** The empty <title> when there is one, otherwise the <head> that should hold it. */
function titleLoc($: cheerio.CheerioAPI) {
  return $("title").length ? locOfFirst($, "title") : locOfFirst($, "head");
}

function checkTitle($: cheerio.CheerioAPI): AccessibilityIssue | null {
  const title = $("title").text().trim();
  if (!title) {
    const loc = titleLoc($);
    return {
      severity: "warning",
      rule: "missing-title",
      message: "Missing or empty <title> element",
      ...(loc ? { loc } : {}),
      details: "The <title> helps screen readers identify the email content.",
    };
  }
  return null;
}

function checkImageAlt($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    const src = $(el).attr("src") || "";
    const role = $(el).attr("role");
    const elLoc = locOfElement(el);

    if (role === "presentation" || role === "none") return;

    if (alt === undefined) {
      issues.push({
        severity: "error",
        rule: "img-missing-alt",
        message: "Image missing alt attribute",
        element: describeElement($, el),
        ...(elLoc ? { loc: elLoc } : {}),
        details: 'Every image must have an alt attribute. Use alt="" for decorative images.',
      });
    } else if (alt.trim() === "") {
      const isLikelyContent =
        !src.includes("spacer") &&
        !src.includes("pixel") &&
        !src.includes("tracking") &&
        !src.includes("1x1") &&
        !src.includes("transparent");

      if (isLikelyContent && ($(el).attr("width") || "0") !== "1") {
        issues.push({
          severity: "info",
          rule: "img-empty-alt",
          message: "Image has empty alt text; verify it is decorative",
          element: describeElement($, el),
        ...(locOfAttr(el, "alt") ? { loc: locOfAttr(el, "alt") } : {}),
          details: "Empty alt is correct for decorative images, but content images need descriptive alt text.",
        });
      }
    } else if (/\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(alt)) {
      issues.push({
        severity: "error",
        rule: "img-filename-alt",
        message: "Image alt text is a filename, not a description",
        element: describeElement($, el),
        ...(locOfAttr(el, "alt") ? { loc: locOfAttr(el, "alt") } : {}),
        details: `Alt "${alt}" should describe the image content, not the file name.`,
      });
    }
  });

  return issues;
}

function checkLinkAccessibility($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  $("a").each((_, el) => {
    const elLoc = locOfElement(el);
    const text = $(el).text().trim().toLowerCase();
    const ariaLabel = $(el).attr("aria-label");
    const title = $(el).attr("title");
    const imgAlt = $(el).find("img").attr("alt");

    if (!text && !ariaLabel && !title && !imgAlt) {
      issues.push({
        severity: "error",
        rule: "link-no-accessible-name",
        message: "Link has no accessible name",
        element: describeElement($, el),
        ...(elLoc ? { loc: elLoc } : {}),
        details: "Links need visible text, aria-label, or an image with alt text.",
      });
      return;
    }

    if (text && GENERIC_LINK_TEXT.has(text) && !ariaLabel) {
      issues.push({
        severity: "warning",
        rule: "link-generic-text",
        message: `Link text "${$(el).text().trim()}" is not descriptive`,
        element: describeElement($, el),
        ...(elLoc ? { loc: elLoc } : {}),
        details: "Screen readers often list links out of context. Use text that describes the destination.",
      });
    }
  });

  return issues;
}

function checkTableAccessibility($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  $("table").each((_, el) => {
    // Skip inner tables that are inside a presentation/none ancestor
    if ($(el).parents('table[role="presentation"], table[role="none"]').length > 0) return;

    const role = $(el).attr("role");
    const tableLoc = locOfElement(el);
    const hasHeaders = $(el).find("th").length > 0;
    const looksLikeLayout = !hasHeaders;

    if (looksLikeLayout && role !== "presentation" && role !== "none") {
      const nestedTables = $(el).find("table").length;
      if (nestedTables > 0 || $(el).find("td").length > 2) {
        issues.push({
          severity: "info",
          rule: "table-missing-role",
          message: 'Layout table missing role="presentation"',
          ...(tableLoc ? { loc: tableLoc } : {}),
          element: `<table> with ${$(el).find("td").length} cells`,
          details: 'Add role="presentation" to tables used for layout so screen readers don\'t announce them as data tables.',
        });
      }
    }
  });

  return issues;
}

/** The colour an email renders on when nothing in the document paints one. */
const CLIENT_DEFAULT_BACKGROUND = { r: 255, g: 255, b: 255 };

/** The colour text renders in when nothing in the document declares one. */
const CLIENT_DEFAULT_TEXT: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** A background value that paints something we cannot reduce to a colour. */
const UNRESOLVABLE_PAINT_RE = /url\(|(?:linear|radial|conic)-gradient\(/i;

/** Tags that never paint text, so they are not worth a contrast check. */
const NON_RENDERING_TAGS = new Set(["head", "style", "script", "title", "meta", "link"]);

/** The properties the contrast check resolves through the cascade. */
const CASCADE_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "background-image",
  "font-size",
  "font-weight",
  // Not for contrast itself, for deciding whether the text renders at all.
  "display",
  "visibility",
  "opacity",
]);

/**
 * The render a cascade is being resolved for.
 *
 * An email has more than one correct answer: the same CSS produces a different
 * palette on a phone and in dark mode, and a contrast bug can live in only one
 * of them. Resolving against an explicit context is what lets the same
 * machinery grade all three.
 */
export interface RenderContext {
  /** Viewport width in px, for width media queries. */
  width: number;
  /** Whether `prefers-color-scheme: dark` matches. */
  dark: boolean;
}

/** A desktop reading pane: the default render. */
const DESKTOP_RENDER: RenderContext = { width: 640, dark: false };
/** A phone, narrow enough to satisfy the usual 480/600px breakpoints. */
const MOBILE_RENDER: RenderContext = { width: 375, dark: false };
/** A client that honours `prefers-color-scheme: dark` (Apple Mail, Superhuman, …). */
const DARK_RENDER: RenderContext = { width: 640, dark: true };

/** Length in px from a media feature value; em/rem both appear in email CSS. */
function mediaPx(raw: string): number | null {
  const m = raw.match(/([\d.]+)\s*(px|em|rem)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return (m[2] || "px").toLowerCase() === "px" ? n : n * 16;
}

/**
 * Does a media block apply to the render being analysed?
 *
 * Evaluates the two features that decide whether a declaration is part of what
 * the reader sees: colour scheme and viewport width. Everything else
 * (`screen`, `all`, vendor conditions) counts as applying, because that is how
 * email authors use it: `@media screen` exists to hide CSS from Outlook, not
 * to make a rule conditional.
 *
 * ponytail: no `not`/`only` negation and no comma-separated media lists, both
 * are vanishingly rare in email CSS, and treating them as applying errs toward
 * reading a declaration that is there rather than inventing one that is not.
 */
function mediaApplies(prelude: string, ctx: RenderContext): boolean {
  const text = prelude.toLowerCase();
  if (/\bprint\b/.test(text) && !/\bscreen\b/.test(text)) return false;

  const scheme = text.match(/prefers-color-scheme\s*:\s*(dark|light)/);
  if (scheme && (scheme[1] === "dark") !== ctx.dark) return false;

  for (const m of text.matchAll(/(max|min)-width\s*:\s*([^)]+)/g)) {
    const px = mediaPx(m[2]);
    if (px === null) continue;
    if (m[1] === "max" ? ctx.width > px : ctx.width < px) return false;
  }
  return true;
}

/** CSS specificity: [#id, .class/[attr]/:pseudo, element], compared left to right. */
type Specificity = [number, number, number];

/** Pseudo-classes that take the specificity of their most specific argument. */
const FORWARDING_PSEUDOS = new Set(["not", "is", "has", "matches", "any"]);

/** The most specific selector in a list. */
function maxSpecificity(list: csstree.SelectorList): Specificity {
  let best: Specificity = [0, 0, 0];
  list.children.forEach((sel) => {
    const s = specificityOfSelector(sel);
    if (moreSpecific(s, best)) best = s;
  });
  return best;
}

/** Specificity of one parsed `Selector` node, per Selectors Level 4. */
function specificityOfSelector(node: csstree.CssNode): Specificity {
  const acc: Specificity = [0, 0, 0];
  if (node.type !== "Selector") return acc;

  node.children.forEach((child) => {
    switch (child.type) {
      case "IdSelector":
        acc[0]++;
        break;
      case "ClassSelector":
      case "AttributeSelector":
        acc[1]++;
        break;
      case "TypeSelector":
        // The universal selector contributes nothing.
        if (child.name !== "*") acc[2]++;
        break;
      case "PseudoElementSelector":
        acc[2]++;
        break;
      case "PseudoClassSelector": {
        const name = child.name.toLowerCase();
        // :where() is specificity-zero by definition.
        if (name === "where") break;
        const inner = child.children?.first;
        if (inner && inner.type === "SelectorList" && FORWARDING_PSEUDOS.has(name)) {
          const nested = maxSpecificity(inner);
          acc[0] += nested[0];
          acc[1] += nested[1];
          acc[2] += nested[2];
          break;
        }
        acc[1]++;
        break;
      }
      default:
        // Combinators and nesting markers carry no specificity.
        break;
    }
  });

  return acc;
}

/**
 * Token-counting fallback for a selector css-tree cannot parse.
 *
 * Exact for the flat class and id selectors that dominate email CSS; it
 * miscounts functional pseudo-classes, which is why it is only the fallback.
 */
function specificityFromTokens(selector: string): Specificity {
  const bare = selector.replace(/\([^)]*\)/g, "").replace(/["'][^"']*["']/g, "");
  return [
    (bare.match(/#[\w-]+/g) || []).length,
    (bare.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length,
    (bare.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length,
  ];
}

/**
 * A selector's specificity, parsed rather than pattern-matched.
 *
 * Getting this wrong picks the wrong background and reports a contrast error
 * on an email that reads fine, so it is worth the parse: `:where()` counts
 * zero, and `:not()`/`:is()`/`:has()` forward their most specific argument
 * instead of scoring as a plain pseudo-class.
 */
function specificityOf(selector: string): Specificity {
  try {
    const ast = csstree.parse(selector, { context: "selector" });
    return specificityOfSelector(ast);
  } catch {
    return specificityFromTokens(selector);
  }
}

function moreSpecific(a: Specificity, b: Specificity): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** One declaration competing for a property on one element. */
interface Decl {
  value: string;
  important: boolean;
  /** Inline styles outrank every selector. */
  inline: boolean;
  /** Presentational attributes (bgcolor) lose to every real declaration. */
  presentational: boolean;
  specificity: Specificity;
  /** Source order, for ties. */
  order: number;
}

/** Does `next` beat `current` in the cascade? */
function wins(next: Decl, current: Decl | undefined): boolean {
  if (!current) return true;
  if (next.important !== current.important) return next.important;
  if (next.presentational !== current.presentational) return current.presentational;
  if (next.inline !== current.inline) return next.inline;
  // ponytail: unreachable while buildCascade feeds declarations in ascending
  // order (the order tie-break below already returns true for this case). Kept so
  // wins() is a correct comparator on its own rather than only via its caller.
  if (moreSpecific(next.specificity, current.specificity)) return true;
  if (moreSpecific(current.specificity, next.specificity)) return false;
  return next.order >= current.order;
}

type Cascade = Map<unknown, Map<string, Decl>>;

/**
 * Resolve the colour-bearing declarations that actually win on each element.
 *
 * Reads presentational attributes, `<style>` rules (respecting `!important`,
 * specificity and source order) and inline styles. Only the handful of
 * properties in {@link CASCADE_PROPS} are tracked; this is a contrast check,
 * not a rendering engine.
 */
function computeCascade($: cheerio.CheerioAPI, ctx: RenderContext): Cascade {
  const cascade: Cascade = new Map();
  let order = 0;

  const record = (el: unknown, prop: string, decl: Decl) => {
    let props = cascade.get(el);
    if (!props) {
      props = new Map();
      cascade.set(el, props);
    }
    if (wins(decl, props.get(prop))) props.set(prop, decl);
  };

  // 1. Presentational attributes: the bottom of the cascade.
  $("[bgcolor]").each((_, el) => {
    const value = $(el).attr("bgcolor");
    if (!value) return;
    record(el, "background-color", {
      value,
      important: false,
      inline: false,
      presentational: true,
      specificity: [0, 0, 0],
      order: order++,
    });
  });

  // 2. Stylesheet rules, in source order.
  const handleRule = (node: csstree.Rule) => {
    const selectorList = csstree.generate(node.prelude).trim();
    if (!selectorList) return;

    const decls: { prop: string; value: string; important: boolean }[] = [];
    node.block.children.forEach((child) => {
      if (child.type !== "Declaration") return;
      const prop = child.property.toLowerCase();
      if (!CASCADE_PROPS.has(prop)) return;
      decls.push({ prop, value: csstree.generate(child.value), important: !!child.important });
    });
    if (!decls.length) return;

    // Each selector in a list carries its own specificity. Split at top level
    // only; `:is(#hero, .card)` is ONE selector, and splitting inside its
    // parentheses produces two that match nothing.
    for (const selector of splitTopLevel(selectorList).map((x) => x.trim()).filter(Boolean)) {
      const specificity = specificityOf(selector);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let matched: any[];
      try {
        matched = $(selector).toArray();
      } catch {
        continue; // a selector cheerio cannot evaluate; no match
      }
      for (const el of matched) {
        for (const d of decls) {
          record(el, d.prop, {
            ...d,
            inline: false,
            presentational: false,
            specificity,
            order: order++,
          });
        }
      }
    }
  };

  const visitBlock = (children: csstree.List<csstree.CssNode>) => {
    children.forEach((node) => {
      if (node.type === "Rule") {
        handleRule(node);
        return;
      }
      if (node.type !== "Atrule" || node.name.toLowerCase() !== "media" || !node.block) return;
      const prelude = node.prelude ? csstree.generate(node.prelude): "";
      if (!mediaApplies(prelude, ctx)) return;
      visitBlock(node.block.children);
    });
  };

  $("style").each((_, styleEl) => {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse($(styleEl).text());
    } catch {
      return;
    }
    if (ast.type !== "StyleSheet") return;
    visitBlock(ast.children);
  });

  // 3. Inline styles: beaten only by an `!important` rule.
  $("[style]").each((_, el) => {
    for (const part of splitStyleDeclarations($(el).attr("style") || "")) {
      const colon = part.indexOf(":");
      if (colon === -1) continue;
      const prop = part.slice(0, colon).trim().toLowerCase();
      if (!CASCADE_PROPS.has(prop)) continue;
      let value = part.slice(colon + 1).trim();
      const important = /!\s*important$/i.test(value);
      if (important) value = value.replace(/!\s*important$/i, "").trim();
      record(el, prop, {
        value,
        important,
        inline: true,
        presentational: false,
        specificity: [0, 0, 0],
        order: order++,
      });
    }
  });

  return cascade;
}

/**
 * The background an element paints: the candidate colours text could sit on,
 * "unknown", or null for none.
 *
 * More than one candidate means a gradient; every stop is a colour the text
 * actually crosses, so the worst one decides the verdict.
 */
type PaintedBackground = RGBA[] | "unknown" | null;

/**
 * Reduce any background-ish value to the colours it actually paints.
 *
 * A gradient is resolved to its stops: its colours are declared in the CSS, so
 * text over one can be graded rather than skipped. "unknown" is reserved for
 * a raster image (`url(...)`) with no colour behind it; that really does
 * depend on pixels, and `checkVisual` already tells the author to add a
 * background-color fallback for it.
 */
function paintedColor(value: string | undefined | null): PaintedBackground {
  if (!value) return null;

  const solid = backgroundShorthandColor(value);
  if (solid) {
    const c = parseColor(solid);
    // A solid colour sits *under* any gradient painted over it, so both are
    // surfaces the text can land on.
    if (c && c.a > 0) return [c, ...gradientStops(value)];
  }

  const stops = gradientStops(value);
  if (stops.length) return stops;

  return UNRESOLVABLE_PAINT_RE.test(value) ? "unknown" : null;
}

/** Just the resolvable colours out of a PaintedBackground. */
function asColors(painted: PaintedBackground): RGBA[] {
  return painted && painted !== "unknown" ? painted : [];
}

/** The effective background one element paints, from its cascade winners. */
function elementBackground(props: Map<string, Decl>): PaintedBackground {
  const shorthand = props.get("background");
  const longhand = props.get("background-color");
  const image = props.get("background-image");

  // A `background` shorthand resets background-color, so it supplies the
  // colour only when it outranks the longhand.
  const colorDecl = shorthand && wins(shorthand, longhand) ? shorthand : longhand;

  // The colour layer and a separate background-image layer both paint here.
  const candidates = [
    ...(colorDecl ? asColors(paintedColor(colorDecl.value)): []),
    ...(image ? asColors(paintedColor(image.value)): []),
  ];
  if (candidates.length) return candidates;

  // Nothing readable, but a raster image may still cover the area.
  for (const decl of [colorDecl, image]) {
    if (decl && UNRESOLVABLE_PAINT_RE.test(decl.value)) return "unknown";
  }
  return null;
}

/**
 * The background an element's text sits on: the nearest ancestor (itself
 * included) that paints one.
 *
 * Returns "unknown" when the nearest paint is an image or gradient with no
 * solid colour under it, and null when nothing in the document paints a
 * background at all: the one case where the client's white default is a safe
 * assumption.
 */
function resolveBackground(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any,
  cascade: Cascade,
): PaintedBackground {
  for (const node of [el, ...$(el).parents().toArray()]) {
    const props = cascade.get(node);
    if (!props) continue;
    const painted = elementBackground(props);
    if (painted !== null) return painted;
  }
  return null;
}

/** Is this text "large" by WCAG: >=18px, or >=14px bold? */
function isLargeText(size: string | undefined, weight: string | undefined): boolean {
  const match = size?.match(/^(\d+(?:\.\d+)?)(px|pt)/i);
  if (!match) return false;
  const px = match[2].toLowerCase() === "pt" ? parseFloat(match[1]) * 1.333 : parseFloat(match[1]);
  const w = weight?.trim().toLowerCase();
  const bold = w === "bold" || w === "bolder" || (!!w && parseInt(w, 10) >= 700);
  return px >= 18 || (px >= 14 && bold);
}

/**
 * The winning value of an inherited property, walking up from the element.
 *
 * `color`, `font-size` and `font-weight` all inherit, so the value that
 * actually paints a run of text may be declared several levels above it.
 */
function inherited(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any,
  cascade: Cascade,
  prop: string,
): { value: string; source: unknown } | null {
  for (const node of [el, ...$(el).parents().toArray()]) {
    const value = cascade.get(node)?.get(prop)?.value;
    if (value) return { value, source: node };
  }
  return null;
}

/**
 * Is this text invisible by design?
 *
 * Preheader text is routinely shipped as white-on-white inside a hidden
 * container. It is not a contrast defect, and reporting it trains people to
 * ignore the check.
 */
function isHiddenText(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any,
  cascade: Cascade,
): boolean {
  for (const node of [el, ...$(el).parents().toArray()]) {
    const props = cascade.get(node);
    if (!props) continue;
    const display = props.get("display")?.value?.trim().toLowerCase();
    if (display === "none") return true;
    const visibility = props.get("visibility")?.value?.trim().toLowerCase();
    if (visibility === "hidden" || visibility === "collapse") return true;
    const opacity = props.get("opacity")?.value?.trim();
    if (opacity !== undefined && parseFloat(opacity) === 0) return true;
    const size = props.get("font-size")?.value?.trim();
    if (size !== undefined && /^0(?:px|pt|em|rem|%)?$/i.test(size)) return true;
  }
  // The legacy Outlook idiom, which never reaches the cascade as a property.
  return $(el).closest("[style*='mso-hide']").length > 0;
}

/** Does this element hold visible text of its own (not just via children)? */
function hasOwnText(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any,
): boolean {
  return $(el)
    .contents()
    .toArray()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .some((n: any) => n.type === "text" && typeof n.data === "string" && n.data.trim().length > 0);
}

/**
 * Contrast check over every run of text the email actually paints.
 *
 * Anchored on elements that hold their own text, not on elements that happen
 * to declare a colour. `color` inherits, so a colour set on `<body>` is judged
 * where it lands: against the background of the card the text sits in, rather
 * than against the page behind it. Checking at the declaration instead reports
 * body text as unreadable whenever any descendant repaints its own background.
 */
function checkContrast($: cheerio.CheerioAPI, cascade: Cascade): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  $("*").each((_, el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tag = ((el as any).tagName || "").toLowerCase();
    if (NON_RENDERING_TAGS.has(tag)) return;
    if (!hasOwnText($, el)) return;
    if (isHiddenText($, el, cascade)) return;

    const declared = inherited($, el, cascade, "color");
    const fg = declared ? parseColor(declared.value): CLIENT_DEFAULT_TEXT;
    if (!fg) return;
    const colorValue = declared?.value ?? "the client default";

    const background = resolveBackground($, el, cascade);
    // Text over a raster image; the real contrast is a matter of pixels we
    // cannot see, so say nothing rather than guess.
    if (background === "unknown") return;

    // Grade against the worst surface the text crosses: one colour normally,
    // every stop when the background is a gradient.
    const surfaces: Array<RGBA | null> = background ?? [null];
    let ratio = Infinity;
    let worst = "";
    for (const surface of surfaces) {
      let { r: bgR, g: bgG, b: bgB } = surface ?? CLIENT_DEFAULT_BACKGROUND;
      if (surface && surface.a < 1) {
        // Semi-transparent bg: blend against the client default beneath it.
        [bgR, bgG, bgB] = alphaBlend(surface, 255, 255, 255);
      }
      const [fR, fG, fB] = fg.a < 1 ? alphaBlend(fg, bgR, bgG, bgB): [fg.r, fg.g, fg.b];
      const candidate = contrastRatio(relativeLuminance(fR, fG, fB), relativeLuminance(bgR, bgG, bgB));
      if (candidate < ratio) {
        ratio = candidate;
        worst = formatRgb(surface ?? { ...CLIENT_DEFAULT_BACKGROUND, a: 1 });
      }
    }
    const against = surfaces.length > 1 ? ` (worst gradient stop ${worst})` : "";

    const large = isLargeText(
      inherited($, el, cascade, "font-size")?.value,
      inherited($, el, cascade, "font-weight")?.value,
    );
    const grade = wcagGrade(ratio);
    // Point at wherever the colour was actually declared, which may be an
    // ancestor rather than the element holding the text.
    const styleLoc = locOfAttr((declared?.source ?? el), "style") ?? locOfAttr(el, "style");

    if (grade === "Fail") {
      issues.push({
        severity: "error",
        rule: "low-contrast",
        message: `Low contrast ratio ${ratio.toFixed(1)}:1, fails WCAG minimum`,
        element: describeElement($, el),
        ...(styleLoc ? { loc: styleLoc } : {}),
        details: `Foreground ${colorValue} on background${against} needs at least ${large ? "3:1" : "4.5:1"} contrast ratio.`,
      });
    } else if (!large && grade === "AA Large") {
      issues.push({
        severity: "warning",
        rule: "low-contrast",
        message: `Low contrast ratio ${ratio.toFixed(1)}:1, fails WCAG AA for normal text`,
        element: describeElement($, el),
        ...(styleLoc ? { loc: styleLoc } : {}),
        details: `Foreground ${colorValue} on background${against} needs at least 4.5:1 for normal-sized text.`,
      });
    }
  });

  return issues;
}

/** Very small text, read from inline styles. */
function checkTextSize($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  let smallTextCount = 0;

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const styleLoc = locOfAttr(el, "style");

    // --- Small text check (threshold lowered to 9px) ---
    const fontSizeMatch = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?)(px|pt)/i);
    if (fontSizeMatch) {
      const size = parseFloat(fontSizeMatch[1]);
      const unit = fontSizeMatch[2].toLowerCase();
      const pxSize = unit === "pt" ? size * 1.333 : size;

      if (pxSize < 9 && pxSize > 0) {
        smallTextCount++;
        if (smallTextCount <= 3) {
          issues.push({
            severity: "warning",
            rule: "small-text",
            message: `Very small text (${fontSizeMatch[0].trim()})`,
            element: describeElement($, el),
            ...(styleLoc ? { loc: styleLoc } : {}),
            details: "Text smaller than 9px is difficult to read, especially on mobile devices.",
          });
        }
      }
    }

  });

  if (smallTextCount > 3) {
    issues.push({
      severity: "warning",
      rule: "small-text-multiple",
      message: `${smallTextCount} elements with text smaller than 9px`,
      details: "Consider using a minimum font size of 12-14px for readability.",
    });
  }

  return issues;
}

function checkCharsetDeclaration($: cheerio.CheerioAPI): AccessibilityIssue | null {
  // Check for <meta charset="...">
  const metaCharset = $('meta[charset]');
  if (metaCharset.length > 0) return null;

  // Check for <meta http-equiv="Content-Type" content="...charset=...">
  const httpEquiv = $('meta[http-equiv="Content-Type"]');
  if (httpEquiv.length > 0) {
    const content = httpEquiv.attr("content") || "";
    if (/charset\s*=/i.test(content)) return null;
  }

  const loc = locOfFirst($, "head");
  return {
    severity: "warning",
    rule: "missing-charset",
    message: "Missing charset declaration",
    ...(loc ? { loc } : {}),
    details: 'Add <meta charset="utf-8"> in <head> to prevent encoding issues across email clients.',
  };
}

function checkSemanticStructure($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  const headings: { level: number; text: string; loc: ReturnType<typeof locOfElement> }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = parseInt(el.tagName.replace(/h/i, ""), 10);
    headings.push({ level, text: $(el).text().trim().slice(0, 60), loc: locOfElement(el) });
  });

  for (let i = 1; i < headings.length; i++) {
    const gap = headings[i].level - headings[i - 1].level;
    if (gap > 1) {
      issues.push({
        severity: "info",
        rule: "heading-skip",
        message: `Heading level skipped: h${headings[i - 1].level} to h${headings[i].level}`,
        ...(headings[i].loc ? { loc: headings[i].loc } : {}),
        details: "Skipped heading levels can confuse screen readers. Use sequential heading levels.",
      });
      break;
    }
  }

  return issues;
}

/**
 * Audit a pre-parsed email DOM for accessibility issues.
 *
 * Accepts a Cheerio instance to avoid redundant HTML parsing when
 * called from `auditEmail()` or `createSession()`.
 *
 * @internal
 */
export function checkAccessibilityFromDom($: cheerio.CheerioAPI): AccessibilityReport {
  const issues: AccessibilityIssue[] = [];

  const langIssue = checkLangAttribute($);
  if (langIssue) issues.push(langIssue);

  const titleIssue = checkTitle($);
  if (titleIssue) issues.push(titleIssue);

  issues.push(...checkImageAlt($));
  issues.push(...checkLinkAccessibility($));
  issues.push(...checkTableAccessibility($));
  issues.push(...checkTextSize($));
  issues.push(...checkContrast($, computeCascade($, DESKTOP_RENDER)));
  issues.push(...checkSemanticStructure($));

  const charsetIssue = checkCharsetDeclaration($);
  if (charsetIssue) issues.push(charsetIssue);

  // Calculate score with per-rule penalty capping
  let penalty = 0;
  const seenRules = new Map<string, number>();

  for (const issue of issues) {
    const count = (seenRules.get(issue.rule) || 0) + 1;
    seenRules.set(issue.rule, count);

    const cap = RULE_PENALTY_CAPS[issue.rule];
    if (cap !== undefined && count > cap) continue;

    switch (issue.severity) {
      case "error": penalty += 12; break;
      case "warning": penalty += 6; break;
      case "info": penalty += 2; break;
    }
  }

  const score = Math.max(0, 100 - penalty);
  return { score, issues };
}

/**
 * Audit an HTML email for accessibility issues.
 *
 * Checks for missing lang attributes, image alt text, small fonts,
 * layout table roles, link accessibility, heading hierarchy, and
 * color contrast. Returns a 0–100 score and detailed issues.
 */
export function checkAccessibility(html: string, options?: ParseOptions): AccessibilityReport {
  return fromHtml(html, EMPTY_ACCESSIBILITY, checkAccessibilityFromDom, options);
}

/**
 * Contrast failures inside the email's own `@media (prefers-color-scheme: dark)`
 * styles.
 *
 * This is the other half of dark mode, and the half the author actually
 * controls: Apple Mail, Superhuman, Thunderbird and friends do not invert
 * anything, they just apply the dark block as written. A dark background
 * paired with body text that was never re-coloured is invisible there, and no
 * amount of inversion analysis finds it; the bug is in the CSS, not in what
 * the client does to it.
 *
 * Free to run: same DOM, resolved against a dark render, so positions stay
 * valid. Emails with no dark block resolve identically to the light pass and
 * report nothing.
 */
export function checkDarkStylesContrastFromDom(
  $: cheerio.CheerioAPI,
  lightIssues?: AccessibilityIssue[],
): AccessibilityIssue[] {
  const baseline = lightIssues ?? checkContrast($, computeCascade($, DESKTOP_RENDER));
  const dark = checkContrast($, computeCascade($, DARK_RENDER));
  return contrastDelta(
    dark,
    baseline,
    "low-contrast-dark",
    "Dark mode",
    "This pairing comes from the email's own @media (prefers-color-scheme: dark) block. " +
      "Clients that honour it (Apple Mail, Superhuman, Thunderbird) render exactly this, so re-colour the text alongside the background.",
  );
}

/**
 * The clients whose dark mode the contrast check simulates.
 *
 * Partial and full inversion are complementary, not redundant: partial
 * repaints a near-white background and leaves mid-tone text alone, while full
 * moves both ends and can strand a brand colour that partial never touched.
 * Measured across the fixture set, each finds real failures the other misses,
 * so both run and the results are deduped by element.
 */
const DARK_CONTRAST_CLIENTS = ["gmail-android", "gmail-ios"] as const;

/** Low-contrast issues only, out of a full accessibility report. */
function lowContrastOnly(issues: AccessibilityIssue[]): AccessibilityIssue[] {
  return issues.filter((i) => i.rule === "low-contrast");
}

/**
 * The contrast failures in `candidates` that the baseline render does not
 * already have, relabelled for the render they belong to.
 *
 * ponytail: deduped by the element description, so two genuinely identical
 * elements collapse into one report.
 */
function contrastDelta(
  candidates: AccessibilityIssue[],
  baseline: AccessibilityIssue[],
  rule: string,
  prefix: string,
  details: string,
): AccessibilityIssue[] {
  // Seeded with the baseline, then grown as candidates are taken, so one fault
  // is one report even when several renders surface it.
  const seen = new Set(lowContrastOnly(baseline).map((i) => i.element));
  return lowContrastOnly(candidates)
    .filter((issue) => {
      if (seen.has(issue.element)) return false;
      seen.add(issue.element);
      return true;
    })
    .map((issue) => ({
      severity: issue.severity,
      rule,
      message: `${prefix}: ${issue.message}`,
      ...(issue.element ? { element: issue.element } : {}),
      ...(issue.loc ? { loc: issue.loc } : {}),
      details,
    }));
}

/**
 * Contrast failures that only appear at mobile width.
 *
 * A breakpoint is free to restyle anything, and a palette that reads fine in a
 * desktop reading pane can invert a card or drop a background on a phone,
 * where most email is opened. Resolving the cascade at mobile width and
 * subtracting the desktop result leaves exactly the failures the narrow render
 * introduces.
 *
 * Unlike the dark-mode pass this needs no re-parse: it is the same DOM read
 * against a different set of media blocks, so positions stay valid.
 */
export function checkMobileContrastFromDom(
  $: cheerio.CheerioAPI,
  desktopIssues?: AccessibilityIssue[],
): AccessibilityIssue[] {
  const baseline = desktopIssues ?? checkContrast($, computeCascade($, DESKTOP_RENDER));
  const mobile = checkContrast($, computeCascade($, MOBILE_RENDER));
  return contrastDelta(
    mobile,
    baseline,
    "low-contrast-mobile",
    "At mobile width",
    "This colour pairing only appears below the email's breakpoint. Check the contrast of what the media query restyles, not just the desktop palette.",
  );
}

/**
 * Contrast failures that only appear at mobile width. See
 * {@link checkMobileContrastFromDom}.
 */
export function checkMobileContrast(html: string, options?: ParseOptions): AccessibilityIssue[] {
  return fromHtml(html, [] as AccessibilityIssue[], ($) => checkMobileContrastFromDom($), options);
}

/**
 * Contrast failures an email has *only* in dark mode.
 *
 * Clients that invert colours do it selectively, so a palette that passes in
 * light mode can collapse to unreadable once inverted, mid-tone text left
 * alone on a background repainted near-black. This runs the ordinary contrast
 * check over the simulated dark render and reports what is new there.
 *
 * Pass `lightIssues` when the light-mode report is already in hand (the audit
 * has it) to skip re-running the light pass.
 *
 * ponytail: deduped by the element description, so two genuinely identical
 * elements collapse into one report. Track them individually only if the
 * per-element count turns out to matter.
 */
export function checkDarkModeContrast(
  html: string,
  lightIssues?: AccessibilityIssue[],
): AccessibilityIssue[] {
  if (!html || !html.trim()) return [];

  const inverted: AccessibilityIssue[] = [];
  for (const client of DARK_CONTRAST_CLIENTS) {
    let darkHtml: string;
    try {
      darkHtml = simulateDarkMode(html, client).html;
    } catch {
      // The simulator enforces its own size limit; a dark-mode extra is not
      // worth failing the whole audit over.
      continue;
    }
    // Only the contrast check is wanted here: running the whole audit over
    // each inverted DOM re-does alt text, links, tables and headings for
    // results that are thrown away.
    const $dark = cheerio.load(darkHtml);
    // Positions are deliberately dropped: they would index the transformed
    // HTML, not the source the author would be sent to.
    for (const issue of checkContrast($dark, computeCascade($dark, DESKTOP_RENDER))) {
      const { loc, locs, locsTruncated, ...rest } = issue;
      void loc; void locs; void locsTruncated;
      inverted.push(rest);
    }
  }

  return contrastDelta(
    inverted,
    lightIssues ?? checkAccessibility(html).issues,
    "low-contrast-dark",
    "Dark mode",
    "Clients that force dark mode repaint backgrounds without re-colouring every text layer. " +
      "Set explicit colours inside @media (prefers-color-scheme: dark), or pick text that holds up on both.",
  );
}
