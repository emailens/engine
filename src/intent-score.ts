import type { CheerioAPI } from "cheerio";
import * as csstree from "css-tree";
import type { AnyNode } from "domhandler";
import { loadHtml } from "./parse-html";
import { getCodeFix, getStyleSurvivalNote, getSuggestion } from "./fix-snippets";
import { CSS_SUPPORT, CSS_SUPPORT_NOTES } from "./rules/css-support";
import {
  detectAtRuleTargetingScope,
  detectSelectorListTargetingScope,
  inlineTargetingScope,
} from "./rules/targeting-matchers";
import { checkSize } from "./size-checker";
import { checkStyleSurvival } from "./style-survival";
import type { CSSWarning, Framework, Severity, VmlReport } from "./types";
import { checkVml } from "./vml-checker";
import { resolveMsoBranch } from "./vml-render";

/**
 * Turn the raw warning list into the one the compatibility score should see.
 *
 * A quirk costs its client a point when the author asked for something that
 * client drops and nothing on that element restores it. The same quirk with
 * the fallback in place stays on the list as info. Style-survival failures,
 * Gmail's 16 KB `<style>` ceiling, and a VML shape `checkVml` already rejects
 * are lost CSS too, so they join the same list, once per rule.
 */

const WORD = "outlook-windows-legacy";
/** New Outlook reads the live document, not the MSO branch, and shares Word's partials. */
const NEW_OUTLOOK = "outlook-windows";
const GMAIL = ["gmail-web", "gmail-android", "gmail-ios"];

const FILL_SHAPES = new Set(["v:rect", "v:roundrect", "v:shape", "v:background", "v:group"]);
const COVERED = "A fallback this client can see carries this.";

type Decision = "warning" | "info" | "skip";

interface StyleRule {
  selector: string;
  body: string;
}

export function applyIntent(html: string, warnings: CSSWarning[], framework?: Framework): CSSWarning[] {
  const wordHtml = /<!--\[if/i.test(html) ? resolveMsoBranch(html) : html;
  const vml = checkVml(html);
  let next = adjustOutlook(loadHtml(wordHtml), loadHtml(html), warnings, framework);
  next = adjustSharedLosses(html, next, framework);
  next = adjustBody(html, next);
  return appendKillers(next, html, wordHtml, vml, framework);
}

type Bucket = "open" | "covered";
type StyleTest = (style: string) => boolean;
const hit = (re: RegExp): StyleTest => (style) => re.test(style);

const LAYER_TOKEN = {
  image: null,
  position: /\b(?:center|top|bottom|left|right)\b|\b-?\d+(?:\.\d+)?(?:px|%|em|rem)\b/i,
  repeat: /\b(?:no-repeat|repeat-x|repeat-y|repeat|space|round)\b/i,
  origin: /\b(?:padding-box|border-box|content-box)\b/i,
} as const;

/** Longhand, or the same intent written inside `background:`. A bare url() is only an image. */
function backgroundLayer(kind: keyof typeof LAYER_TOKEN): StyleTest {
  const longhand = {
    image: /background-image\s*:|(?:^|[^-])background\s*:[^;]*\burl\s*\(/i,
    position: /background-position\s*:/i,
    repeat: /background-repeat\s*:/i,
    origin: /background-origin\s*:/i,
  }[kind];
  const token = LAYER_TOKEN[kind];
  return (style) => {
    if (longhand.test(style)) return true;
    if (!token) return false;
    return shorthandValues(style).some((value) => token.test(stripCalls(value)));
  };
}

function shorthandValues(style: string): string[] {
  return [...style.matchAll(/(?:^|[^-])background\s*:\s*([^;]+)/gi)].map((match) => match[1]);
}

function stripCalls(value: string): string {
  let next = value;
  for (let i = 0; i < 3; i++) {
    const stripped = next.replace(/[a-z-]+\([^()]*\)/gi, " ");
    if (stripped === next) break;
    next = stripped;
  }
  return next.replace(/#[0-9a-f]{3,8}\b/gi, " ");
}

/** New Outlook reads the live document. An MSO wrapper is not a fallback it can see. */
function adjustOutlook(
  word$: CheerioAPI,
  live$: CheerioAPI,
  warnings: CSSWarning[],
  framework?: Framework,
): CSSWarning[] {
  const wordRules = styleRules(word$, WORD);
  const liveRules = styleRules(live$, NEW_OUTLOOK);
  let next = warnings;
  const apply = (
    $: CheerioAPI,
    rules: StyleRule[],
    client: string,
    property: string,
    test: StyleTest,
    cover: (el: AnyNode, style: string) => boolean,
    message: string,
    createInfo: boolean,
  ) => {
    const buckets = classify($, rules, test, cover, client);
    // One disagreeing row is a lost intent even when every cell is a td.
    if (property === "padding" && rowPaddingDisagrees($)) {
      for (const key of buckets.keys()) buckets.set(key, "open");
    }
    next = applyBuckets(next, client, property, buckets, message, framework, createInfo);
  };
  const never = () => false;
  const wordFill = (el: AnyNode) => coveredByFill(word$, el);

  apply(word$, wordRules, WORD, "border-radius", hit(/border-radius\s*:/i), (el) => coveredByRoundrect(word$, el), "Outlook Classic drops this corner radius, and no v:roundrect covers it.", true);
  apply(word$, wordRules, WORD, "background-image", backgroundLayer("image"), wordFill, "Outlook Classic drops this background image, and no v:fill covers it.", true);
  apply(word$, wordRules, WORD, "background-position", backgroundLayer("position"), wordFill, "Outlook Classic drops background-position, and no v:fill covers it.", true);
  apply(word$, wordRules, WORD, "background-repeat", backgroundLayer("repeat"), wordFill, "Outlook Classic drops background-repeat, and no v:fill covers it.", true);
  apply(word$, wordRules, WORD, "background-origin", backgroundLayer("origin"), wordFill, "Outlook Classic drops background-origin, and no v:fill covers it.", true);
  apply(word$, wordRules, WORD, "linear-gradient", hit(/linear-gradient\s*\(/i), wordFill, "Outlook Classic drops this linear-gradient, and no v:fill covers it.", true);
  apply(word$, wordRules, WORD, "max-width", hit(/max-width\s*:/i), (el, style) => maxWidthCovered(word$, el, style), "Outlook Classic only honours max-width on a table. Wrap the element in a table with a fixed width.", true);
  apply(word$, wordRules, WORD, "padding", hit(/(?:^|[^-])padding(?:-(?:top|right|bottom|left))?\s*:/i), (el) => paddingCovered(word$, el, true), "Outlook Classic drops this padding. Put it on a table cell, or set mso-padding-alt on one.", true);
  apply(word$, wordRules, WORD, "float", hit(/float\s*:/i), never, "Outlook Classic drops this float. The MSO branch needs a table with align.", true);
  apply(word$, wordRules, WORD, "display:flex", hit(/display\s*:\s*(?:inline-)?flex\b/i), never, "Outlook Classic receives this flex box. The MSO branch needs a table.", true);
  apply(word$, wordRules, WORD, "display:grid", hit(/display\s*:\s*(?:inline-)?grid\b/i), never, "Outlook Classic receives this grid box. The MSO branch needs a table.", true);
  apply(live$, liveRules, NEW_OUTLOOK, "max-width", hit(/max-width\s*:/i), (el, style) => maxWidthCovered(live$, el, style), "Outlook only honours max-width on a table. Set it on a table the client actually reads.", false);
  apply(live$, liveRules, NEW_OUTLOOK, "padding", hit(/(?:^|[^-])padding(?:-(?:top|right|bottom|left))?\s*:/i), (el) => paddingCovered(live$, el, false), "Outlook only keeps padding on table cells, and a row uses the largest vertical padding.", false);

  next = decide(next, WORD, "margin", marginDecision(word$, wordRules), "Outlook Classic drops this margin and nothing else is carrying the space.", framework);
  return decide(next, NEW_OUTLOOK, "margin", marginDecision(live$, liveRules), "Outlook drops this margin and nothing else is carrying the space.", framework, { createInfo: false });
}

/** [hit, property, note needle, message, suggestion, skip Word and New Outlook] */
type SharedLoss = [(live: string) => boolean, string, string, string, string, boolean];

const SHARED_LOSSES: SharedLoss[] = [
  [(live) => cssHas(live, /margin(?:-(?:top|right|bottom|left))?\s*:\s*([^;}]+)/gi, valueIsNegative), "margin", "negative", "This client drops a negative margin. Use padding on a parent cell instead.", "Negative margin is dropped. Use padding on a parent cell instead.", true],
  [(live) => /border-radius\s*:[^;}"'<]*\//i.test(live), "border-radius", "slash", "This client drops the elliptical border-radius slash syntax.", "Drop the / syntax. Use one radius, or longhands without a slash.", false],
  [(live) => /float\s*:\s*(?:inline-start|inline-end)\b/i.test(live), "float", "inline-start", "This client drops float: inline-start and inline-end.", "Use float: left or float: right.", false],
  [(live) => /display\s*:\s*inline-flex\b/i.test(live), "display:flex", "inline-flex", "This client drops display: inline-flex.", "Use display: flex, or a table.", false],
];

/** Losses that are the same on every client whose caniemail note names them. */
function adjustSharedLosses(html: string, warnings: CSSWarning[], framework?: Framework): CSSWarning[] {
  // Outlook-only conditional comments. Every other client reads the markup outside them.
  const live = html.replace(/<!--\[if(?![^\]]*!)[^\]]*(?:mso|vml)[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, "");
  return SHARED_LOSSES.reduce((next, [hit, property, needle, message, suggestion, skipOutlook]) => {
    if (!hit(live)) return next;
    return noteClients(property, needle).reduce((acc, client) => {
      if (skipOutlook && (client === WORD || client === NEW_OUTLOOK)) return acc;
      return decide(acc, client, property, "warning", message, framework, { createInfo: false, suggestion });
    }, next);
  }, warnings);
}

function noteClients(property: string, needle: string): string[] {
  const notes = CSS_SUPPORT_NOTES[property];
  if (!notes) return [];
  const needleLc = needle.toLowerCase();
  return Object.entries(notes)
    .filter(([, lines]) => lines.some((line) => line.toLowerCase().includes(needleLc)))
    .map(([id]) => id);
}

function cssHas(html: string, decl: RegExp, test: (value: string) => boolean): boolean {
  for (const match of html.matchAll(decl)) {
    if (test(match[1] ?? "")) return true;
  }
  return false;
}

function decide(
  warnings: CSSWarning[],
  client: string,
  property: string,
  decision: Decision,
  message: string,
  framework?: Framework,
  opts?: { createInfo?: boolean; suggestion?: string },
): CSSWarning[] {
  if (decision === "skip") return warnings;
  const createInfo = opts?.createInfo ?? true;
  const advice = fixFields(client, property, framework, opts?.suggestion ?? message);
  const has = warnings.some((w) => w.client === client && w.property === property);
  const text = decision === "info" ? COVERED : message;
  if (!has) {
    if (decision === "info" && !createInfo) return warnings;
    return [...warnings, { severity: decision, client, property, message: text, ...advice, suggestion: opts?.suggestion ?? advice.suggestion }];
  }
  return warnings.map((w) => {
    if (w.client !== client || w.property !== property) return w;
    return {
      ...w,
      severity: decision,
      message: decision === "info" ? COVERED : w.message,
      suggestion: opts?.suggestion ?? w.suggestion ?? advice.suggestion,
      ...(w.fix || !advice.fix ? {} : { fix: advice.fix }),
    };
  });
}

function fixFields(
  client: string,
  property: string,
  framework?: Framework,
  suggestion?: string,
): Pick<CSSWarning, "suggestion" | "fix" | "fixType" | "fixIsGenericFallback"> {
  const sug = getSuggestion(property, client, framework);
  const fix = getCodeFix(property, client, framework);
  return {
    suggestion: suggestion ?? sug.text,
    fixType: fix ? "structural" : "css",
    ...(fix ? { fix } : {}),
    ...(framework && sug.isGenericFallback ? { fixIsGenericFallback: true } : {}),
  };
}

/**
 * One bucket per finding selector. Inline findings use the same key as
 * `describeSelector` in analyze.ts. Stylesheet findings have no selector,
 * so they share "".
 *
 * ponytail: two elements with the same key stay one finding. The open one
 * wins, so the score still moves, and a consumer cannot tell them apart
 * until findings are split per element.
 */
function classify(
  $: CheerioAPI,
  rules: StyleRule[],
  test: StyleTest,
  cover: (el: AnyNode, style: string) => boolean,
  client: string,
): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  const mark = (key: string, open: boolean) => {
    if (open || buckets.get(key) === "open") buckets.set(key, "open");
    else if (!buckets.has(key)) buckets.set(key, "covered");
  };
  for (const el of $("[style]").toArray()) {
    if (!clientCanSee(inlineTargetingScope($(el)), client)) continue;
    const style = $(el).attr("style") ?? "";
    if (!test(style)) continue;
    mark(elementKey($, el), !cover(el, style));
  }
  for (const rule of rules) {
    if (!test(rule.body)) continue;
    const nodes = select($, rule.selector);
    mark("", nodes.length === 0 || nodes.some((el) => !cover(el, rule.body)));
  }
  return buckets;
}

function applyBuckets(
  warnings: CSSWarning[],
  client: string,
  property: string,
  buckets: Map<string, Bucket>,
  message: string,
  framework: Framework | undefined,
  createInfo: boolean,
): CSSWarning[] {
  if (buckets.size === 0) return warnings;
  const advice = fixFields(client, property, framework, message);
  const anyOpen = [...buckets.values()].some((bucket) => bucket === "open");
  let next = warnings.map((w) => {
    if (w.client !== client || w.property !== property) return w;
    // A finding with no selector is the whole property. One open element keeps it a warning.
    const bucket = w.selector
      ? buckets.get(w.selector)
      : buckets.get("") ?? (anyOpen ? "open" : "covered");
    if (!bucket) return w;
    const info = bucket === "covered";
    return { ...w, severity: info ? "info" as const : "warning" as const, message: info ? COVERED : message };
  });
  if (next.some((w) => w.client === client && w.property === property)) return next;
  const info = !anyOpen;
  if (info && !createInfo) return next;
  next = [...next, {
    severity: info ? "info" : "warning",
    client,
    property,
    message: info ? COVERED : message,
    suggestion: info ? COVERED : advice.suggestion,
    fixType: advice.fixType,
    ...(advice.fix ? { fix: advice.fix } : {}),
    ...(advice.fixIsGenericFallback ? { fixIsGenericFallback: true } : {}),
  }];
  return next;
}

function select($: CheerioAPI, selector: string): AnyNode[] {
  const sel = selector.replace(/::?[a-z-]+(\([^)]*\))?/gi, "").trim();
  if (!sel || sel.includes("@")) return [];
  try {
    return $(sel).toArray();
  } catch {
    return [];
  }
}

/** Same key analyze.ts stores on an inline finding. */
function elementKey($: CheerioAPI, el: AnyNode): string {
  if (el.type !== "tag") return "";
  const tag = ((el as { tagName?: string }).tagName ?? el.name).toLowerCase();
  const id = $(el).attr("id");
  if (id) return `${tag}#${id}`;
  const cls = $(el).attr("class");
  if (cls) return `${tag}.${cls.split(/\s+/)[0]}`;
  if ($(el).attr("href")) return `${tag}[href]`;
  return tag;
}

function clientCanSee(scope: readonly string[] | null, client: string): boolean {
  return scope === null || scope.includes(client);
}

function styleRules($: CheerioAPI, client: string): StyleRule[] {
  const rules: StyleRule[] = [];
  $("style").each((_, el) => {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse($(el).text());
    } catch {
      return;
    }
    const stack: Array<readonly string[] | null> = [];
    let atScope: readonly string[] | null = null;
    csstree.walk(ast, {
      enter(node: csstree.CssNode) {
        if (node.type === "Atrule") {
          const prelude = node.prelude ? csstree.generate(node.prelude) : "";
          stack.push(atScope);
          const own = prelude ? detectAtRuleTargetingScope(prelude) : null;
          if (own) atScope = own;
        }
        if (node.type !== "Rule") return;
        const selectors: string[] = [];
        if (node.prelude && node.prelude.type === "SelectorList") {
          node.prelude.children.forEach((child: csstree.CssNode) => {
            selectors.push(csstree.generate(child).trim());
          });
        }
        const scope = (selectors.length ? detectSelectorListTargetingScope(selectors) : null) ?? atScope;
        if (!clientCanSee(scope, client) || !node.block) return;
        rules.push({ selector: selectors.join(","), body: csstree.generate(node.block) });
      },
      leave(node: csstree.CssNode) {
        if (node.type === "Atrule") atScope = stack.pop() ?? null;
      },
    });
  });
  return rules;
}

function tagName(el: AnyNode): string {
  return el.type === "tag" ? el.name.toLowerCase() : "";
}

/** A roundrect covers the control it wraps, or the control whose only content it is. */
function coveredByRoundrect($: CheerioAPI, el: AnyNode): boolean {
  if ($(el).parents().toArray().some((parent) => tagName(parent) === "v:roundrect")) return true;
  const children = $(el).children().toArray();
  if (!children.some((child) => tagName(child) === "v:roundrect")) return false;
  const text = $(el).contents().toArray().some((node) => node.type === "text" && node.data.trim() !== "");
  if (text) return false;
  return children.every((child) => {
    const name = tagName(child);
    return name === "v:roundrect" || name.startsWith("v:") || name.startsWith("w:") || name === "center";
  });
}

/** A fill covers the container it paints. A bare v:rect does not, and neither does a nested card. */
function coveredByFill($: CheerioAPI, el: AnyNode): boolean {
  if (tagName(el) === "v:background" || (FILL_SHAPES.has(tagName(el)) && shapePaints($, el))) return true;
  if ($(el).children().toArray().some((child) => shapePaints($, child))) return true;
  const parent = $(el).parent().get(0);
  const host = tagName(el) === "center" || tagName(el) === "v:textbox";
  return !!parent && host && shapePaints($, parent);
}

function shapePaints($: CheerioAPI, el: AnyNode): boolean {
  const name = tagName(el);
  if (name === "v:fill" || name === "v:background") return true;
  if (!FILL_SHAPES.has(name) || name === "v:group") return false;
  return $(el).find("*").toArray().some((node) => tagName(node) === "v:fill");
}

function maxWidthCovered($: CheerioAPI, el: AnyNode, style: string): boolean {
  if (tagName(el) === "table") return true;
  const want = pxLength(/max-width\s*:\s*([^;]+)/i.exec(style)?.[1] ?? "");
  if (want === null) return false;
  return $(el).parents("table").toArray().some((table) => pxLength($(table).attr("width") ?? "") === want);
}

function pxLength(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  return match ? Number(match[1]) : null;
}

function paddingCovered($: CheerioAPI, el: AnyNode, msoAlt: boolean): boolean {
  const tag = tagName(el);
  if (tag === "td" || tag === "th") return true;
  if (!msoAlt) return false;
  return $(el).parents("td, th").toArray().some((cell) =>
    /mso-padding-alt\s*:/i.test($(cell).attr("style") ?? ""),
  );
}

function rowPaddingDisagrees($: CheerioAPI): boolean {
  let disagrees = false;
  $("tr").each((_, row) => {
    const values = new Set<string>();
    $(row).children("td, th").each((__, cell) => {
      const value = verticalPadding($(cell).attr("style") ?? "");
      if (value !== null) values.add(value);
    });
    if (values.size > 1) disagrees = true;
  });
  return disagrees;
}

function verticalPadding(style: string): string | null {
  const top = style.match(/(?:^|;)\s*padding-top\s*:\s*([^;]+)/i);
  const bottom = style.match(/(?:^|;)\s*padding-bottom\s*:\s*([^;]+)/i);
  if (top || bottom) {
    const above = top?.[1]?.trim() ?? "";
    const below = bottom?.[1]?.trim() ?? "";
    return above === below ? above || below : `${above}/${below}`;
  }
  const all = style.match(/(?:^|;)\s*padding\s*:\s*([^;]+)/i);
  if (!all) return null;
  const parts = all[1].trim().split(/\s+/);
  if (parts.length === 1 || parts.length === 2) return parts[0];
  return `${parts[0]}/${parts[2]}`;
}

function marginDecision($: CheerioAPI, rules: StyleRule[]): Decision {
  let relevant = false;
  let problem = false;
  const note = (style: string, el: AnyNode | null, selector?: string) => {
    for (const decl of style.matchAll(/margin(?:-(?:top|right|bottom|left))?\s*:\s*([^;]+)/gi)) {
      const value = decl[1].trim();
      if (value.split(/\s+/).every((part) => /^(0|0px|0%)$/i.test(part))) continue;
      const negative = valueIsNegative(value);
      const auto = /\bauto\b/i.test(value);
      const onSpanOrBody = el
        ? tagName(el) === "span" || tagName(el) === "body"
        : !!selector && isSpanOrBody(selector);
      if (!negative && !auto && !onSpanOrBody) continue;
      relevant = true;
      if (negative) {
        problem = true;
        continue;
      }
      if (auto) {
        if (el ? !centered($, el) : !selectorCentered($, selector ?? "")) problem = true;
        continue;
      }
      const carried = el
        ? tagName(el) === "body" ? documentHasPaddedCell($) : paddedCell($, el)
        : selectorCarried($, selector ?? "");
      if (!carried) problem = true;
    }
  };
  $("[style]").each((_, el) => note($(el).attr("style") ?? "", el));
  for (const rule of rules) note(rule.body, null, rule.selector);
  if (!relevant) return "skip";
  return problem ? "warning" : "info";
}

/** `span` or `body` as an element, not a class like `.body-copy`. */
function isSpanOrBody(selector: string): boolean {
  return /(?:^|[\s,>+~])(?:span|body)(?=$|[\s,.#:[>+~])/i.test(selector);
}

function selectorCarried($: CheerioAPI, selector: string): boolean {
  const nodes = select($, selector);
  if (nodes.length === 0) return false;
  return nodes.every((el) => tagName(el) === "body" ? documentHasPaddedCell($) : paddedCell($, el));
}

function valueIsNegative(value: string): boolean {
  return value.trim().split(/\s+/).some((part) => /^-\d/.test(part));
}

function centered($: CheerioAPI, el: AnyNode): boolean {
  if (($(el).attr("align") ?? "").toLowerCase() === "center") return true;
  return $(el).parents("[align]").toArray().some((parent) =>
    ($(parent).attr("align") ?? "").toLowerCase() === "center",
  );
}

function selectorCentered($: CheerioAPI, selector: string): boolean {
  let nodes: AnyNode[];
  try {
    nodes = $(selector).toArray();
  } catch {
    return false;
  }
  return nodes.length > 0 && nodes.every((el) => centered($, el));
}

function paddedCell($: CheerioAPI, el: AnyNode): boolean {
  return $(el).parents("td, th").toArray().some((cell) => cellIsPadded($, cell));
}

function documentHasPaddedCell($: CheerioAPI): boolean {
  return $("td, th").toArray().some((cell) => cellIsPadded($, cell));
}

function cellIsPadded($: CheerioAPI, cell: AnyNode): boolean {
  const style = $(cell).attr("style") ?? "";
  return /(?:^|[^-])padding(?:-(?:top|right|bottom|left))?\s*:/i.test(style)
    || /mso-padding-alt\s*:/i.test(style)
    || $(cell).attr("padding") !== undefined;
}

const BODY_CLIENTS = Object.entries(CSS_SUPPORT["<body>"] ?? {})
  .filter(([, level]) => level === "unsupported" || level === "partial")
  .map(([id]) => id);

function adjustBody(html: string, warnings: CSSWarning[]): CSSWarning[] {
  if (!bodyBackgroundLost(loadHtml(html))) return warnings;
  const extra: CSSWarning[] = [];
  for (const client of BODY_CLIENTS) {
    if (warnings.some((w) => w.client === client && w.property === "body-background")) continue;
    // `<body>` already costs this client a point. A second property would charge the same loss twice.
    if (warnings.some((w) => w.client === client && w.property === "<body>" && w.severity !== "info")) continue;
    extra.push({
      severity: "warning",
      client,
      property: "body-background",
      message: "This client replaces <body>, so a background that exists only there is lost. Repeat it on a full-width wrapper table.",
      suggestion: "Repeat the background on a full-width wrapper table.",
      fixType: "structural",
    });
  }
  return extra.length ? [...warnings, ...extra] : warnings;
}

function bodyBackgroundLost($: CheerioAPI): boolean {
  const body = $("body").first();
  const declared = backgroundsOf(body.attr("style") ?? "");
  const bgcolor = body.attr("bgcolor");
  const background = body.attr("background");
  if (bgcolor) declared.push(bgcolor);
  if (background) declared.push(background);
  $("style").each((_, el) => {
    for (const rule of $(el).text().split("}")) {
      const at = rule.indexOf("{");
      if (at === -1) continue;
      const selector = rule.slice(0, at);
      if (!/(?:^|[\s,])body\b/i.test(selector)) continue;
      declared.push(...backgroundsOf(rule.slice(at + 1)));
    }
  });
  const values = [...new Set(declared.map(normalise).filter(Boolean))];
  if (values.length === 0) return false;
  return values.some((value) => !wrapperRepeats($, value));
}

function backgroundsOf(style: string): string[] {
  const found: string[] = [];
  for (const match of style.matchAll(/background(?:-color|-image)?\s*:\s*([^;]+)/gi)) {
    found.push(match[1]);
  }
  return found;
}

function wrapperRepeats($: CheerioAPI, value: string): boolean {
  let repeats = false;
  $("table, td, th").each((_, el) => {
    if (!fullWidth($, el)) return;
    const candidates = [
      ...backgroundsOf($(el).attr("style") ?? ""),
      $(el).attr("bgcolor") ?? "",
      $(el).attr("background") ?? "",
    ];
    if (candidates.some((candidate) => normalise(candidate) === value)) repeats = true;
  });
  return repeats;
}

function fullWidth($: CheerioAPI, el: AnyNode): boolean {
  const width = ($(el).attr("width") ?? "").trim();
  const style = $(el).attr("style") ?? "";
  if (width === "100%" || /width\s*:\s*100%/i.test(style)) return true;
  if (tagName(el) !== "td" && tagName(el) !== "th") return false;
  return $(el).parents("table").toArray().some((table) => {
    const tableWidth = ($(table).attr("width") ?? "").trim();
    return tableWidth === "100%" || /width\s*:\s*100%/i.test($(table).attr("style") ?? "");
  });
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/['"]/g, "").replace(/\s+/g, "");
}

function appendKillers(
  warnings: CSSWarning[],
  html: string,
  wordHtml: string,
  vml: VmlReport,
  framework?: Framework,
): CSSWarning[] {
  const extra: CSSWarning[] = [];
  const seen = new Set(warnings.map((w) => `${w.client}:${w.property}`));
  const push = (client: string, property: string, severity: Severity, message: string) => {
    const key = `${client}:${property}`;
    if (seen.has(key)) return;
    seen.add(key);
    extra.push({
      severity,
      client,
      property,
      message,
      suggestion: getStyleSurvivalNote(property, framework) ?? message,
      fixType: "css",
    });
  };

  const liveIssues = checkStyleSurvival(html).issues;
  const wordIssues = wordHtml === html ? liveIssues : checkStyleSurvival(wordHtml).issues;
  for (const issue of liveIssues) {
    for (const client of issue.clients) {
      if (client === WORD) continue;
      push(client, issue.rule, issue.severity, issue.message);
    }
  }
  for (const issue of wordIssues) {
    for (const client of issue.clients) {
      if (client !== WORD) continue;
      push(client, issue.rule, issue.severity, issue.message);
    }
  }
  for (const issue of checkSize(html).issues) {
    if (issue.rule !== "gmail-style-truncated") continue;
    for (const client of GMAIL) push(client, issue.rule, issue.severity, issue.message);
  }
  for (const issue of vml.issues) {
    if (issue.rule === "vml-arcsize-range") continue;
    if (!/v:(?:roundrect|fill|background)\b/i.test(issue.message)) continue;
    push(WORD, issue.rule, issue.severity, issue.message);
  }
  return extra.length ? [...warnings, ...extra] : warnings;
}
