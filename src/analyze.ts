import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import {
  CSS_SUPPORT,
  CSS_SUPPORT_NOTES,
  GRACEFUL_FEATURES,
  STRUCTURAL_FIX_PROPERTIES,
  HTML_ELEMENT_FEATURES,
  HTML_ATTRIBUTE_FEATURES,
  HTML_MISC_FEATURES,
  AT_RULE_FEATURES,
  COMPOUND_VALUE_FEATURES,
  CSS_FUNCTION_FEATURES,
  CSS_PROPERTY_FEATURES,
} from "./rules/css-support";
import type {
  AtRuleFeature,
  HtmlElementFeature,
  HtmlMiscFeature,
} from "./rules/css-support";
import { caveatApplies } from "./rules/value-caveats";
import { EMAIL_CLIENTS } from "./clients";
import { checkDarkModeFromDom } from "./dark-mode-checker";
import { getCodeFix, getSuggestion, isCodeFixGenericFallback } from "./fix-snippets";
import { parseStyleProperties, getStyleValue, getStyleValues } from "./style-utils";
import { MAX_HTML_SIZE, MAX_WARNING_LOCATIONS } from "./constants";
import { loadHtml, type ParseOptions } from "./parse-html";
import { resolveMsoBranch } from "./vml-render";

/** The one client that reads conditional comments. */
const WORD_ENGINE_CLIENT = "outlook-windows-legacy";
import { cssBlockAnchor, locInAttr, locInCssBlock, locOfAttr, locOfElement } from "./source-location";
import type { CSSWarning, FixType, Framework, SourceLocation, SupportLevel } from "./types";

// ── Data-driven detection config ─────────────────────────────────────────────

/**
 * HTML element detection rules.
 * Each maps a feature key to a CSS selector for DOM detection.
 * Special cases (like <form> also matching <input>/<button>) are listed explicitly.
 */
const HTML_ELEMENT_SELECTORS: Partial<Record<HtmlElementFeature, string>> = {
  "<style>": "style",
  "<link>": "link[rel='stylesheet']",
  "<svg>": "svg",
  "<video>": "video",
  "<form>": "form, input, button[type='submit']",
  "<audio>": "audio",
  "<picture>": "picture",
  "<dialog>": "dialog",
  "<meter>": "meter",
  "<progress>": "progress",
  "<select>": "select",
  "<textarea>": "textarea",
  "<marquee>": "marquee",
  "<object>": "object",
  "<base>": "base",
  // Every email has a <body>, so grading its presence would put the same nine
  // warnings on every report forever, which is a constant rather than a
  // finding. What these clients actually drop is the styling on it: they
  // rewrite <body> into a <div>, or hoist its content out. So look for a body
  // that carries something to lose.
  "<body>": "body[style], body[bgcolor], body[background], body[class], body[id]",
  '<input type="checkbox">': "input[type='checkbox']",
  '<input type="hidden">': "input[type='hidden']",
  '<input type="radio">': "input[type='radio']",
  '<input type="reset">': "input[type='reset']",
  '<input type="submit">': "input[type='submit']",
  '<input type="text">': "input[type='text']",
  '<button type="reset">': "button[type='reset']",
  '<button type="submit">': "button[type='submit']",
};

/**
 * The selector for an element feature. Most are just the tag: caniemail keys
 * them `<abbr>`, `<ruby>`, `<wbr>` and so on, and looking for one is looking
 * for that tag. Only the features whose detection is not one tag, or that
 * carry a bespoke severity or message, need an entry above.
 */
function htmlElementSelector(feature: HtmlElementFeature): string | undefined {
  const explicit = HTML_ELEMENT_SELECTORS[feature];
  if (explicit) return explicit;
  const tag = /^<([a-z][a-z0-9]*)>$/.exec(feature)?.[1];
  return tag;
}

/**
 * Is there any client this feature could be reported for? Running a detector
 * whose row says "supported" everywhere costs a DOM query (or, for comments, a
 * full tree walk) and can only ever produce nothing.
 */
function isActionable(feature: string): boolean {
  const row = CSS_SUPPORT[feature];
  if (!row) return false;
  return Object.values(row).some((l) => l === "unsupported" || l === "partial");
}

/** Severity for HTML element detection (some are error, some warning). */
const HTML_ELEMENT_SEVERITY: Partial<Record<HtmlElementFeature, "error" | "warning">> = {
  "<style>": "error",
  "<link>": "error",
  "<svg>": "error",
  "<form>": "error",
  "<video>": "warning",
  "<audio>": "warning",
  "<picture>": "warning",
  "<dialog>": "warning",
  "<marquee>": "warning",
  "<meter>": "warning",
  "<progress>": "warning",
  "<select>": "warning",
  "<textarea>": "warning",
  "<object>": "warning",
  "<base>": "warning",
};

/** Custom messages for HTML elements. Falls back to generic message. */
const HTML_ELEMENT_MESSAGES: Partial<Record<HtmlElementFeature, (clientName: string) => string>> = {
  "<style>": (n) => `${n} strips <style> blocks. Styles must be inlined.`,
  "<link>": (n) => `${n} does not support external stylesheets.`,
  "<svg>": (n) => `${n} does not support inline SVG.`,
  "<video>": (n) => `${n} does not support <video> elements.`,
  "<form>": (n) => `${n} strips form elements.`,
};

/** Compound value detection: maps compound feature keys to {property, valueIncludes}. */
const COMPOUND_DETECTORS: Array<{
  key: string;
  property: string;
  valueIncludes: string;
}> = [
  { key: "display:flex", property: "display", valueIncludes: "flex" },
  { key: "display:grid", property: "display", valueIncludes: "grid" },
  { key: "display:none", property: "display", valueIncludes: "none" },
];

/** CSS function detection: require opening paren to avoid false positives (e.g., "min" in "Minion"). */
const CSS_FUNCTION_DETECTORS = CSS_FUNCTION_FEATURES.map((fn) => ({
  key: fn,
  pattern: `${fn}(`, // require opening paren, matches "min(" but not "Minion"
}));

/** Plain CSS property names. Both declaration scans, inline and `<style>`, test against it. */
const CSS_PROPERTY_SET: ReadonlySet<string> = new Set<string>(CSS_PROPERTY_FEATURES);

/**
 * Which media feature a `@media` prelude actually asks about.
 *
 * `@media` support and `@media (prefers-color-scheme: dark)` support are
 * different questions with different answers: Gmail runs the first (partially)
 * and ignores the second. Matching the prelude is what lets each be graded on its own row.
 */
const MEDIA_FEATURE_DETECTORS: ReadonlyArray<readonly [AtRuleFeature, RegExp]> = [
  ["@media prefers-color-scheme", /prefers-color-scheme/],
  ["@media prefers-reduced-motion", /prefers-reduced-motion/],
  // `(hover: hover)`, never the `:hover` pseudo-class.
  ["@media hover", /\(\s*(?:any-)?hover\s*[:)]/],
  ["@media orientation", /\borientation\s*:/],
  ["@media device-pixel-ratio", /device-pixel-ratio|\bresolution\s*:/],
];

/** Document-level and link-shaped features a cheerio selector can find. */
const HTML_MISC_SELECTORS: Partial<Record<HtmlMiscFeature, string>> = {
  // `href="#"` is a placeholder for a link nobody has written yet, not a
  // local anchor, and it is all over half-built templates.
  "anchor-links": 'a[href^="#"]:not([href="#"])',
  "mailto-links": 'a[href^="mailto:"]',
  "image-maps": "map, area",
  "meta-color-scheme": 'meta[name="color-scheme"]',
  "html5-semantics":
    "article, aside, figcaption, figure, footer, header, main, nav, section",
};

/** How a feature key reads in a sentence. */
const MISC_FEATURE_LABELS: Partial<Record<HtmlMiscFeature, string>> = {
  "amp4email": "AMP for Email",
  "anchor-links": "local anchor links",
  "doctype": "the HTML5 doctype",
  "html-comments": "HTML comments",
  "html5-semantics": "HTML5 semantic elements",
  "image-maps": "image maps",
  "mailto-links": "mailto: links",
  "meta-color-scheme": "the color-scheme meta tag",
};

/** The misc labels, asked about a key that may not be one. */
const MISC_LABEL_LOOKUP: Readonly<Record<string, string | undefined>> = MISC_FEATURE_LABELS;

function featureLabel(prop: string): string {
  const misc = MISC_LABEL_LOOKUP[prop];
  if (misc) return misc;
  if (prop.startsWith("[")) return `the ${prop.slice(1, -1)} attribute`;
  return `"${prop}"`;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Analyze a pre-parsed email DOM for CSS compatibility warnings.
 *
 * Uses data-driven detection: HTML_ELEMENT_FEATURES, AT_RULE_FEATURES,
 * COMPOUND_VALUE_FEATURES, and CSS_FUNCTION_FEATURES are iterated
 * automatically from the generated css-support.ts arrays.
 *
 * @internal
 */
export function analyzeEmailFromDom(
  $: cheerio.CheerioAPI,
  framework?: Framework,
  source?: string,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];
  const seenWarnings = new Map<string, CSSWarning>();

  function addWarning(w: CSSWarning) {
    const key = `${w.client}:${w.property}:${w.severity}:${w.selector || ""}`;
    const existing = seenWarnings.get(key);
    if (!existing) {
      seenWarnings.set(key, w);
      warnings.push(w);
      return;
    }
    // Same finding, another element. One warning still covers the property
    // (scores count properties, not elements), but the occurrence is worth
    // keeping so a consumer can flag all of them, not just the first.
    if (!existing.locs || !w.locs) return;
    for (const loc of w.locs) {
      if (existing.locs.some((l) => l.offset === loc.offset)) continue;
      if (existing.locs.length >= MAX_WARNING_LOCATIONS) {
        existing.locsTruncated = true;
        break;
      }
      existing.locs.push(loc);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function describeSelector(el: any): string {
    const $el = $(el);
    const tag = (el.tagName as string)?.toLowerCase() || "";
    const cls = $el.attr("class");
    const id = $el.attr("id");
    if (id) return `${tag}#${id}`;
    if (cls) return `${tag}.${cls.split(/\s+/)[0]}`;
    const href = $el.attr("href");
    if (href) return `${tag}[href]`;
    return tag;
  }

  // 1. Data-driven HTML element detection
  for (const feature of HTML_ELEMENT_FEATURES) {
    if (!isActionable(feature)) continue;
    const selector = htmlElementSelector(feature);
    if (!selector) continue; // No way to find it in a DOM; skip
    const matches = $(selector);
    if (matches.length === 0) continue;

    const supportData = CSS_SUPPORT[feature];
    if (!supportData) continue;

    const baseSeverity = HTML_ELEMENT_SEVERITY[feature] || "warning";
    const found = matches
      .toArray()
      .map((m) => locOfElement(m))
      .filter((l): l is SourceLocation => l !== undefined);
    const featureOccurrences: Occurrences | undefined = found.length
      ? {
          locs: found.slice(0, MAX_WARNING_LOCATIONS),
          ...(found.length > MAX_WARNING_LOCATIONS ? { truncated: true } : {}),
        }
      : undefined;
    const featureLoc = featureOccurrences?.locs[0];

    for (const client of EMAIL_CLIENTS) {
      const support = supportData[client.id];
      if (support === "unsupported") {
        const msgFn = HTML_ELEMENT_MESSAGES[feature];
        const message = msgFn
          ? msgFn(client.name)
          : `${client.name} does not support ${feature}.`;
        const sug = getSuggestion(feature, client.id, framework);
        const fix = getCodeFix(feature, client.id, framework);
        addWarning({
          severity: baseSeverity,
          client: client.id,
          property: feature,
          message,
          suggestion: sug.text,
          fix,
          fixType: getFixType(feature),
          ...(featureOccurrences ? occurrenceFields(featureOccurrences) : {}),
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback(feature, client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      } else if (support === "partial" && feature === "<style>") {
        // Special case: <style> partial gets a custom message
        const sug = getSuggestion("<style>:partial", client.id, framework);
        const fix = getCodeFix("<style>", client.id, framework);
        addWarning({
          severity: "warning",
          client: client.id,
          property: "<style>",
          message: `${client.name} has partial <style> support (head only, with limitations). Inline styles recommended.`,
          suggestion: sug.text,
          fix,
          fixType: getFixType("<style>"),
          ...(featureOccurrences ? occurrenceFields(featureOccurrences) : {}),
          ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback("<style>", client.id, framework)))
            ? { fixIsGenericFallback: true } : {}),
        });
      }
    }
  }

  /** Positions of the nodes that triggered a DOM-detected feature. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function occurrencesOfNodes(nodes: any[]): Occurrences | undefined {
    const found = nodes
      .map((m) => locOfElement(m))
      .filter((l): l is SourceLocation => l !== undefined);
    if (!found.length) return undefined;
    return {
      locs: found.slice(0, MAX_WARNING_LOCATIONS),
      ...(found.length > MAX_WARNING_LOCATIONS ? { truncated: true } : {}),
    };
  }

  // 1b. HTML attributes. Every attribute feature key is its own selector.
  for (const feature of HTML_ATTRIBUTE_FEATURES) {
    if (!isActionable(feature)) continue;
    const matches = $(feature).toArray();
    if (!matches.length) continue;
    checkPropertySupport(
      feature, addWarning, framework, undefined, undefined, undefined,
      occurrencesOfNodes(matches),
    );
  }

  // 1c. Document-level HTML features (doctype, comments, anchors, AMP, ...).
  for (const feature of HTML_MISC_FEATURES) {
    if (!isActionable(feature)) continue;
    const selector = HTML_MISC_SELECTORS[feature];
    const matches = selector ? $(selector).toArray() : miscNodes($, feature);
    if (!matches.length) continue;
    checkPropertySupport(
      feature, addWarning, framework, undefined, undefined, undefined,
      occurrencesOfNodes(matches),
    );
  }

  // 2. Parse <style> blocks with css-tree
  const parsedAtRules = new Set<string>();
  const selectorLocs = new Map<string, Occurrences>();
  const parsedProperties = new Set<string>();
  const propertyLines = new Map<string, number>();
  const propertyLocs = new Map<string, Occurrences>();
  const propertyValues = new Map<string, string[]>();
  const detectedCssFunctions = new Set<string>();
  const detectedPseudoClasses = new Set<string>();
  const detectedPseudoElements = new Set<string>();

  /** Set inside the per-block walk below so `recordLoc` can see the block. */
  let blockAnchor: ReturnType<typeof cssBlockAnchor>;
  /** At-rules and pseudo-selectors are keyed by name, not by property. */
  function recordSelectorLoc(key: string, cssLoc: csstree.CssLocation | null | undefined) {
    if (!cssLoc) return;
    const loc = locInCssBlock(blockAnchor, cssLoc);
    if (!loc) return;
    const seen = selectorLocs.get(key);
    if (!seen) {
      selectorLocs.set(key, { locs: [loc] });
      return;
    }
    if (seen.locs.some((l) => l.offset === loc.offset)) return;
    if (seen.locs.length >= MAX_WARNING_LOCATIONS) {
      seen.truncated = true;
      return;
    }
    seen.locs.push(loc);
  }

  function recordLoc(key: string, cssLoc: csstree.CssLocation, value?: string) {
    const loc = locInCssBlock(blockAnchor, cssLoc);
    if (!loc) return;
    const seen = propertyLocs.get(key);
    if (!seen) {
      propertyLocs.set(key, { locs: [loc], ...(value !== undefined ? { values: [value] } : {}) });
      return;
    }
    if (seen.locs.some((l) => l.offset === loc.offset)) return;
    if (seen.locs.length >= MAX_WARNING_LOCATIONS) {
      seen.truncated = true;
      return;
    }
    seen.locs.push(loc);
    if (seen.values && value !== undefined) seen.values.push(value);
  }

  $("style").each((_, el) => {
    const cssText = $(el).text();
    blockAnchor = cssBlockAnchor(el, cssText, source);
    // The try covers parsing only. It used to wrap the walk as well, so a throw
    // anywhere in a detector abandoned the rest of the block and the report
    // just came back shorter, with nothing said. A detector that throws is our
    // bug and should read as one.
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(cssText, { parseCustomProperty: true, positions: true });
    } catch {
      return; // malformed CSS: there is nothing in this block to grade
    }
    {
      csstree.walk(ast, {
        enter(node: csstree.CssNode) {
          if (node.type === "Atrule") {
            parsedAtRules.add(`@${node.name}`);
            recordSelectorLoc(`@${node.name}`, node.loc);
            if (node.name === "media" && node.prelude) {
              const prelude = csstree.generate(node.prelude).toLowerCase();
              for (const [feature, pattern] of MEDIA_FEATURE_DETECTORS) {
                if (!pattern.test(prelude)) continue;
                parsedAtRules.add(feature);
                recordSelectorLoc(feature, node.loc);
              }
            }
          }
          // Detect pseudo-classes and pseudo-elements in selectors
          if (node.type === "PseudoClassSelector") {
            detectedPseudoClasses.add(`:${node.name}`);
            recordSelectorLoc(`:${node.name}`, node.loc);
          }
          if (node.type === "PseudoElementSelector") {
            detectedPseudoElements.add(`::${node.name}`);
            recordSelectorLoc(`::${node.name}`, node.loc);
          }
          if (node.type === "Declaration") {
            const prop = node.property.toLowerCase();
            parsedProperties.add(prop);

            // Capture value(s) for value-aware support checks (a property may
            // appear multiple times across rules).
            const valueStr = csstree.generate(node.value);
            const seenValues = propertyValues.get(prop);
            if (seenValues) seenValues.push(valueStr);
            else propertyValues.set(prop, [valueStr]);

            if (node.loc) {
              if (!propertyLines.has(prop)) propertyLines.set(prop, node.loc.start.line);
              recordLoc(prop, node.loc, valueStr);
            }

            // Data-driven compound value detection
            for (const det of COMPOUND_DETECTORS) {
              if (prop === det.property && valueStr.toLowerCase().includes(det.valueIncludes)) {
                parsedProperties.add(det.key);
                if (node.loc) {
                  if (!propertyLines.has(det.key)) propertyLines.set(det.key, node.loc.start.line);
                  recordLoc(det.key, node.loc);
                }
              }
            }

            // Data-driven CSS function detection
            for (const fn of CSS_FUNCTION_DETECTORS) {
              if (valueStr.includes(fn.pattern)) {
                detectedCssFunctions.add(fn.key);
                if (node.loc) {
                  if (!propertyLines.has(fn.key)) propertyLines.set(fn.key, node.loc.start.line);
                  recordLoc(fn.key, node.loc);
                }
              }
            }
          }
        },
      });
    }
  });

  // 3. Data-driven at-rule checking
  for (const atRule of AT_RULE_FEATURES) {
    if (!parsedAtRules.has(atRule)) continue;
    checkPropertySupport(atRule, addWarning, framework, undefined, undefined, undefined, selectorLocs.get(atRule));
  }

  // 4. Scan inline styles

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseStyleProperties(style);
    const selector = describeSelector(el);
    const attrLoc = locOfAttr(el, "style");
    /**
     * The declaration, where the raw source lets us find it exactly, and the
     * whole `style="…"` attribute where it does not. An attribute holding six
     * declarations underlined end to end says "something in here", when the
     * engine knows which one it means.
     */
    const declarationLocs = (prop: string, occurrence = 0) =>
      elementLocs(locInAttr(attrLoc, source, prop, occurrence)) ?? elementLocs(attrLoc);
    const locs = elementLocs(attrLoc);

    for (const prop of props) {
      // Data-driven compound value detection in inline styles
      for (const det of COMPOUND_DETECTORS) {
        if (prop === det.property) {
          const value = getStyleValue(style, prop);
          if (value?.toLowerCase().includes(det.valueIncludes)) {
            checkPropertySupport(
              det.key, addWarning, framework, selector, undefined, undefined,
              declarationLocs(prop),
            );
          }
        }
      }

      if (CSS_PROPERTY_SET.has(prop)) {
        const declared = getStyleValues(style, prop);
        // A property declared twice is two places, not one, and the value at
        // each is what decides whether a given client's caveat applies there.
        // Values and locations stay in step, so a client that only breaks on
        // the second is pointed at the second.
        const placed: Array<{ value: string; loc: SourceLocation }> = [];
        declared.forEach((value, i) => {
          const at = locInAttr(attrLoc, source, prop, i);
          if (at) placed.push({ value, loc: at });
        });
        const occurrences =
          placed.length === declared.length && placed.length > 0
            ? { locs: placed.map((p) => p.loc), values: placed.map((p) => p.value) }
            : locs;
        checkPropertySupport(
          prop, addWarning, framework, selector, undefined,
          declared.length ? declared : undefined, occurrences,
        );
      }

      // Data-driven CSS function detection in inline styles
      const value = getStyleValue(style, prop);
      if (value) {
        for (const fn of CSS_FUNCTION_DETECTORS) {
          if (value.includes(fn.pattern)) {
            checkPropertySupport(
              fn.key, addWarning, framework, selector, undefined, undefined,
              declarationLocs(prop),
            );
          }
        }
      }
    }
  });

  // 5. Check CSS properties from <style> blocks
  for (const prop of parsedProperties) {
    if (prop.includes(":")) continue;
    if (!CSS_PROPERTY_SET.has(prop)) continue;
    const values = propertyValues.get(prop);
    checkPropertySupport(
      prop, addWarning, framework, undefined, propertyLines.get(prop),
      values, propertyLocs.get(prop),
    );
  }

  // Data-driven compound values from <style> blocks (display:flex, display:grid, display:none)
  for (const compound of COMPOUND_VALUE_FEATURES) {
    if (parsedProperties.has(compound)) {
      checkPropertySupport(compound, addWarning, framework, undefined, propertyLines.get(compound), undefined, propertyLocs.get(compound));
    }
  }

  // Data-driven pseudo-class/element detection from <style> blocks
  for (const pseudo of detectedPseudoClasses) {
    if (CSS_SUPPORT[pseudo]) {
      checkPropertySupport(pseudo, addWarning, framework, undefined, undefined, undefined, selectorLocs.get(pseudo));
    }
  }
  for (const pseudo of detectedPseudoElements) {
    if (CSS_SUPPORT[pseudo]) {
      checkPropertySupport(pseudo, addWarning, framework, undefined, undefined, undefined, selectorLocs.get(pseudo));
    }
  }

  // Data-driven CSS functions from <style> blocks
  for (const fn of detectedCssFunctions) {
    checkPropertySupport(fn, addWarning, framework, undefined, propertyLines.get(fn), undefined, propertyLocs.get(fn));
  }

  // 6. Dark-mode opt-in / coverage (no-ops unless the email ships dark styles)
  for (const w of checkDarkModeFromDom($, source)) addWarning(w);

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return warnings;
}

/**
 * Analyze an HTML email and return CSS compatibility warnings
 * for all target email clients.
 *
 * The `framework` parameter controls which fix snippets are attached
 * to warnings; it does NOT change which warnings fire. Analysis always
 * runs on compiled HTML (what email clients actually receive). Fix
 * snippets reference source-level constructs so users know how to
 * modify their framework source code.
 */
export function analyzeEmail(
  html: string,
  framework?: Framework,
  options?: ParseOptions,
): CSSWarning[] {
  if (!html || !html.trim()) {
    return [];
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const $ = loadHtml(html, options);
  return analyzeAllBranches($, html, framework, options?.positions ? html : undefined);
}

/**
 * The entry point every caller should use: the DOM pass, plus the Word engine
 * re-graded on the branch it actually reads.
 *
 * `analyzeEmailFromDom` remains DOM-only and cannot see conditional comments,
 * because a DOM is exactly the thing that has already discarded them. Calling
 * it directly leaves the Word engine graded on markup it never receives, which
 * is what auditEmail and createSession were doing.
 */
export function analyzeAllBranches(
  $: cheerio.CheerioAPI,
  html: string,
  framework?: Framework,
  source?: string,
): CSSWarning[] {
  return withOutlookBranch(html, analyzeEmailFromDom($, framework, source), framework);
}

/**
 * Re-analyse the Word engine against the branch it actually reads.
 *
 * Every other client sees the `<!--[if !mso]>` fallback, which the DOM pass
 * above covers. Outlook Classic sees the `<!--[if mso]>` branch instead, and to
 * a parser that branch is a comment node: CSS inside a conditional `<style>`
 * block is invisible, so the highest-leverage rules in the file are never
 * graded. Measured on a real template: the same declarations produce 41
 * warnings in a plain `<style>` and none at all inside a conditional one.
 *
 * The renderer already resolves this branch. Analysing a different branch from
 * the one we draw would leave the preview and the findings describing two
 * different emails, which is the state this repairs.
 *
 * ponytail: a second parse, not a second analyzer. The existing rules run
 * unchanged against resolved markup, and only Word-engine findings are taken
 * from it, so no other client's results can move.
 */
function withOutlookBranch(
  html: string,
  warnings: CSSWarning[],
  framework?: Framework,
): CSSWarning[] {
  if (!/<!--\[if/i.test(html)) return warnings;

  let branchWarnings: CSSWarning[];
  try {
    const resolved = resolveMsoBranch(html);
    if (resolved === html) return warnings;
    branchWarnings = analyzeEmailFromDom(loadHtml(resolved), framework)
      .filter((w) => w.client === WORD_ENGINE_CLIENT);
  } catch {
    // A malformed conditional comment must not cost the caller every other
    // finding: fall back to the fallback-branch result.
    return warnings;
  }

  // Locations come from the first pass, which is the only one anchored to the
  // source the caller holds. Findings unique to the branch carry none rather
  // than a position into rewritten markup.
  const kept = warnings.filter((w) => w.client !== WORD_ENGINE_CLIENT);
  const firstPassWord = warnings.filter((w) => w.client === WORD_ENGINE_CLIENT);
  const byKey = new Map(firstPassWord.map((w) => [`${w.property}:${w.severity}`, w]));
  const merged = branchWarnings.map((w) => byKey.get(`${w.property}:${w.severity}`) ?? w);
  for (const w of firstPassWord) {
    if (!merged.some((m) => m.property === w.property && m.severity === w.severity)) merged.push(w);
  }
  return [...kept, ...merged];
}

function getFixType(prop: string): FixType {
  // An attribute or a doctype is changed in the markup; there is no CSS value
  // to swap. Elements are left to STRUCTURAL_FIX_PROPERTIES, because some of
  // them (a stripped `<style>`) really are fixed by moving CSS around.
  if (prop.startsWith("[") || MISC_LABEL_LOOKUP[prop]) return "structural";
  return STRUCTURAL_FIX_PROPERTIES.has(prop) ? "structural" : "css";
}

/**
 * Turn caniemail cell notes into a message suffix. Strips the redundant
 * "Partial."/"Buggy."/"Not supported." prefix since the message already states
 * the support level.
 */
function noteSuffix(notes: string[] | undefined): string {
  if (!notes?.length) return "";
  const cleaned = notes
    .map((n) => n.replace(/^(?:Partial|Buggy|Not supported)\.\s*/i, "").trim())
    .filter(Boolean);
  return cleaned.length ? ` ${cleaned.join(" ")}` : "";
}

/** Misc features no cheerio selector can express: doctype, comments, AMP. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function miscNodes($: cheerio.CheerioAPI, feature: string): any[] {
  if (feature === "doctype") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = $.root()[0] as any;
    return (root?.children ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.type === "directive" && String(c.name).toLowerCase() === "!doctype",
    );
  }
  if (feature === "html-comments") return ordinaryComments($.root()[0]);
  if (feature === "amp4email") {
    return $("html")
      .toArray()
      .filter((el) =>
        Object.keys((el as { attribs?: Record<string, string> }).attribs ?? {}).some(
          (a) => a === "amp4email" || a === "⚡4email",
        ),
      );
  }
  return [];
}

/**
 * Comment nodes that are actually comments. An Outlook conditional is a
 * comment to a parser and a control structure to Word, so grading one as
 * "this client strips comments" would be a finding about nothing.
 *
 * caniemail rates every client "supported" for HTML comments today, so the
 * detector finds nothing. Exported so the exclusion is tested directly rather
 * than through a detector that cannot fire.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ordinaryComments(node: any, out: any[] = []): any[] {
  for (const child of node?.children ?? []) {
    if (child.type === "comment") {
      const data = String(child.data ?? "").trim();
      if (!/^\[if\b/i.test(data) && !/^<!\[endif\]/i.test(data)) out.push(child);
    }
    if (child.children) ordinaryComments(child, out);
  }
  return out;
}

function checkPropertySupport(
  prop: string,
  addWarning: (w: CSSWarning) => void,
  framework?: Framework,
  selector?: string,
  line?: number,
  values?: string[],
  occurrences?: Occurrences,
) {
  const loc = occurrences?.locs[0];
  // With positions on, the legacy `line` reports the document line rather than
  // the line within the <style> block; a strict improvement for consumers
  // still reading it.
  const reportedLine = loc?.line ?? line;
  const supportData = CSS_SUPPORT[prop];
  if (!supportData) return;

  const fixType = getFixType(prop);

  for (const client of EMAIL_CLIENTS) {
    const support: SupportLevel = supportData[client.id] || "unknown";
    const notes = CSS_SUPPORT_NOTES[prop]?.[client.id];
    if (support === "unsupported") {
      const sug = getSuggestion(prop, client.id, framework);
      const fix = getCodeFix(prop, client.id, framework);
      // Ignored, not broken: say so, and do not spend a warning on it.
      const graceful = GRACEFUL_FEATURES.has(prop);
      addWarning({
        severity: graceful ? "info" : "warning",
        client: client.id,
        property: prop,
        message: graceful
          ? `${client.name} ignores ${featureLabel(prop)}.${noteSuffix(notes)}`
          : `${client.name} does not support ${featureLabel(prop)}.${noteSuffix(notes)}`,
        suggestion: sug.text,
        fix,
        fixType,
        ...(selector ? { selector } : {}),
        ...(reportedLine !== undefined ? { line: reportedLine } : {}),
        ...(occurrences ? occurrenceFields(occurrences) : {}),
        ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback(prop, client.id, framework)))
          ? { fixIsGenericFallback: true } : {}),
      });
    } else if (support === "partial") {
      // Value-aware: skip when we know the values written and this client's
      // caveat doesn't apply to any of them (e.g. margin: 16px, font-size: 14px,
      // or position: relative on a client that only breaks on fixed/sticky).
      if (!caveatApplies(prop, values, notes)) continue;
      const hits = triggeringOccurrences(prop, occurrences, notes);
      const sug = getSuggestion(prop, client.id, framework);
      const fix = getCodeFix(prop, client.id, framework);
      addWarning({
        severity: "info",
        client: client.id,
        property: prop,
        message: `${client.name} has partial support for ${featureLabel(prop)}.${noteSuffix(notes)}`,
        suggestion: sug.text,
        fix,
        fixType,
        ...(selector ? { selector } : {}),
        ...((hits?.locs[0]?.line ?? reportedLine) !== undefined
          ? { line: hits?.locs[0]?.line ?? reportedLine } : {}),
        ...(hits ? occurrenceFields(hits) : {}),
        ...(framework && (sug.isGenericFallback || (fix && isCodeFixGenericFallback(prop, client.id, framework)))
          ? { fixIsGenericFallback: true } : {}),
      });
    }
  }
}


/**
 * Generate a summary of CSS compatibility for the email.
 */
export function generateCompatibilityScore(
  warnings: CSSWarning[]
): Record<string, { score: number; errors: number; warnings: number; info: number }> {
  const result: Record<string, { score: number; errors: number; warnings: number; info: number }> = {};

  for (const client of EMAIL_CLIENTS) {
    const clientWarnings = warnings.filter((w) => w.client === client.id);

    // Count unique properties per severity so repeated elements don't inflate the score
    const errorProps = new Set(clientWarnings.filter((w) => w.severity === "error").map((w) => w.property));
    const warnProps = new Set(clientWarnings.filter((w) => w.severity === "warning").map((w) => w.property));
    const infoProps = new Set(clientWarnings.filter((w) => w.severity === "info").map((w) => w.property));

    const errors = errorProps.size;
    const warns = warnProps.size;
    const info = infoProps.size;

    // Score: 100 minus penalties, clamped to 0-100
    // Partial-support (info) items are not penalised; they mostly work
    const score = Math.max(0, Math.min(100, 100 - errors * 10 - warns * 3));

    result[client.id] = { score, errors, warnings: warns, info };
  }

  return result;
}

/** The warning fields that carry a finding's positions. */
function occurrenceFields({ locs, truncated }: Occurrences) {
  return { loc: locs[0], locs: [...locs], ...(truncated ? { locsTruncated: true } : {}) };
}

/**
 * Narrow a property's occurrences to the declarations that actually trigger
 * this client's caveat. A sheet setting `font-size: 14px` in one rule and
 * `font-size: 1rem` in another reports once, and it should underline the
 * `1rem`: pointing at the `14px` next to "rem values are not supported" is
 * worse than no position at all. Falls back to the full list when the
 * declaration behind each location is unknown (inline styles, where the
 * location is the whole `style` attribute) or when nothing narrows.
 */
function triggeringOccurrences(
  prop: string,
  occurrences: Occurrences | undefined,
  notes: string[] | undefined,
): Occurrences | undefined {
  const values = occurrences?.values;
  if (!occurrences || !values) return occurrences;
  const locs = occurrences.locs.filter((_, i) => caveatApplies(prop, [values[i]], notes));
  if (!locs.length || locs.length === occurrences.locs.length) return occurrences;
  return { locs, ...(occurrences.truncated ? { truncated: true } : {}) };
}

/** Where a finding occurred, and whether that list is complete. */
interface Occurrences {
  locs: SourceLocation[];
  truncated?: boolean;
  /**
   * The declaration value behind `locs[i]`, where one is known (the `<style>`
   * path). Value-gated properties use it to point the warning at the
   * declarations that actually triggered the caveat rather than at every
   * declaration of the property.
   */
  values?: string[];
}

/** Wrap a single optional location as the occurrence list a warning carries. */
function elementLocs(loc: SourceLocation | undefined): Occurrences | undefined {
  return loc ? { locs: [loc] } : undefined;
}

/** Filter warnings for a specific client. */
export function warningsForClient(warnings: CSSWarning[], clientId: string): CSSWarning[] {
  return warnings.filter(w => w.client === clientId);
}

/** Get only error-severity warnings. */
export function errorWarnings(warnings: CSSWarning[]): CSSWarning[] {
  return warnings.filter(w => w.severity === "error");
}

/** Get only structural fix warnings. */
export function structuralWarnings(warnings: CSSWarning[]): CSSWarning[] {
  return warnings.filter(w => w.fixType === "structural");
}
