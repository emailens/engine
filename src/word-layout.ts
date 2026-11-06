/**
 * The Word engine's box model, as far as it has been measured.
 *
 * The strip pass removes properties Word does not know at all. This pass covers
 * the larger problem: properties Word knows but honours only on some elements.
 * `padding` on a `<td>` works; the same `padding` on a `<div>` does nothing. A
 * browser honours both, so without this the preview shows a padded card that
 * Outlook Classic renders flat.
 *
 * Every rule here was measured, not recalled. The source is the Emailens probe
 * sheets `01-box-model` and `05-backgrounds`, rendered on real Outlook 2007,
 * 2010, 2013, 2016 and 2019 on 2026-10-13. Each sheet isolates one declaration
 * per case between colour markers, and the five versions agreed on every case
 * cited below. A rule names the cases it rests on. Anything that was not
 * measured is left to the browser.
 *
 * Declarations that arrive through a <style> rule are handled too, for the
 * selector forms Word was measured to apply (class, id, type, descendant; probe
 * sheet 07-style-delivery). The rule itself is left in place, because it may
 * also match elements where the property is honoured; each element where it is
 * not gets an inline override instead.
 */
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";
import { parseInlineStyle, serializeStyle } from "./style-utils";

const LINK_LINE_BLOCKS = new Set(["div", "p", "table", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "center", "blockquote", "hr"]);
const INLINE_TAGS = new Set(["span", "a", "b", "strong", "i", "em", "u", "font", "small", "big", "sub", "sup"]);
/** Declarations Word's HTML reader parses, measured on spans (local Outlook, 2026-11-05). */
const WORD_PARSED = /^(?:mso-.*|font(?:-(?:family|size|weight|style|variant))?|color|background(?:-color)?|line-height|letter-spacing|white-space|word-wrap|text-(?:align|decoration|transform|indent|shadow)|vertical-align|direction|unicode-bidi|width|height|(?:margin|padding)(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width))?)$/;
/** Properties Word parses only for some values. */
const WORD_PARSED_VALUES: Record<string, RegExp> = { "word-break": /^normal$/i, display: /^(?:inline|none)$/i };
// ponytail: unprobed properties count as unparsed (float, position, overflow...); probe one before trusting it.
function wordParsesAll(props: Map<string, string>): boolean {
  for (const [name, value] of props) {
    const values = WORD_PARSED_VALUES[name];
    if (values ? !values.test(value.replace(/\s*!important$/i, "").trim()) : !WORD_PARSED.test(name)) return false;
  }
  return true;
}

const PADDING = ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left"];
const MARGIN = ["margin", "margin-top", "margin-right", "margin-bottom", "margin-left"];
const BORDER_WIDTH = [
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
];

/** A line of text is this many times its font size tall when nothing forces it shorter (02-widths c27; 04-typography c02). */
const NATURAL_LINE = 1.15;
/**
 * Word's natural line height in px. Gill Sans MT goes by its VDMX up to 22px,
 * the font's first gasp range (16px: 23, real capture of run gjAruZbzWbTa's
 * 16px/22px lines 23.25px apart), and by its rounded-up win metrics above
 * (local Outlook drew 35px lines 42px apart; gjAr's 28px heading sat in 36px),
 * 2026-11-04. A larger inline run takes the rounded-up height at any size:
 * gjAr's 18px spans in its 16px paragraph sat 22px apart, not the VDMX's 27
 * (real capture; local Outlook at 125% grew them, so it is no judge here).
 * ponytail: other faces use Arial's 1.15.
 */
const GILL_VDMX = [14, 14, 15, 16, 18, 18, 21, 21, 23, 25, 27, 27, 29, 30, 31]; // 8-22px
const isGill = (family = "") => /^\s*['"]?gill sans/i.test(family);
/**
 * Faces whose single spacing is not Arial's 1.15, from their win metrics.
 * Arial Black 1.41: kV0j's 56px heading lines sat 80px apart (real capture, 2026-11-05).
 */
const FACE_LINE: [RegExp, number][] = [[/^\s*['"]?arial black\b/i, 1.41]];
const naturalHeight = (size: number, family = "") => {
  if (!isGill(family)) return Math.round(size * (FACE_LINE.find(([face]) => face.test(family))?.[1] ?? NATURAL_LINE));
  const ppem = Math.round(size);
  return ppem <= 22 ? GILL_VDMX[Math.max(ppem, 8) - 8] : Math.ceil(0.9292 * size) + Math.ceil(0.2305 * size);
};
/** The stand-in for Gill Sans MT where Word drops the VDMX: above 22px, or in a run larger than its block (the preview defines it). */
const GILL_LARGE = "'Gill Sans MT Large'";
/** Space on each side of a table floated with the align attribute (03-columns c02). */
const TABLE_GUTTER = 3.5;

/** Whitespace, non-breaking and zero-width characters, and soft hyphens: nothing a reader can see. */
const INVISIBLE_ONLY = /^[\s\u00a0\u00ad\u034f\u200b-\u200d\u2007\ufeff]+$/;

/** The line of space Word leaves under a list (09-follow-ups c16, c17). */
const LIST_TRAILING_PX = 18;
/** Where a list's text starts: padding-left is not read (list probe, 2026-11-02). */
const LIST_TEXT_INDENT_PX = 48;

/** Word draws no border wider than 6pt, which is 8px. A 10px border measured 8px (01 c21, c22; 05 c20). */
const MAX_BORDER_PX = 8;
const capBorder = (value: string) =>
  value.replace(/(\d+(?:\.\d+)?)px/gi, (whole, n: string) =>
    Number(n) > MAX_BORDER_PX ? `${MAX_BORDER_PX}px` : whole,
  );

/** `auto` and negative lengths count for nothing on a div (01 c17, c19, c20). */
const flattenMargin = (value: string) =>
  value
    .split(/\s+/)
    .map((part) => (part === "auto" || /^-/.test(part) ? "0" : part))
    .join(" ");

/** flattenMargin for a div: `auto` and a negative top or bottom go to 0, a
 * negative side stays. Shorthand parts are top, right, bottom, left. */
const flattenDivMargin = (prop: string, value: string) => {
  if (prop === "margin-left" || prop === "margin-right") return value.trim() === "auto" ? "0" : value;
  if (prop !== "margin") return flattenMargin(value);
  const parts = value.trim().split(/\s+/);
  const vertical = (i: number) => i === 0 || (i === 2 && parts.length >= 3);
  return parts.map((part, i) => (part === "auto" || (/^-/.test(part) && vertical(i)) ? "0" : part)).join(" ");
};

/**
 * True when the element has no line of text for a background to sit behind.
 * Text inside a nested table belongs to that table's cells, not to this
 * element, so it does not count; text in an inline child such as a span does
 * (04-typography c25, c26: a div holding only a span kept its background).
 */
function holdsNoText($: CheerioAPI, el: Element): boolean {
  const own = $(el).clone();
  own.find("table").remove();
  // A non-breaking space is a line: a div holding only `&nbsp;` painted its
  // background at one line's height (02-widths c27).
  return !/\S|\u00a0/.test(own.text());
}

/** Top-level rules of a stylesheet. At-rule blocks are skipped: Word ignores @media and @supports. */
function topLevelRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open === -1) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    if (!prelude.startsWith("@")) rules.push({ selector: prelude, body: text.slice(open + 1, j - 1) });
    i = j;
  }
  return rules;
}

/** CSS specificity of a simple selector, as one comparable number. */
function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (
    selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?/g, " ").match(/(?:^|[\s+~>])[a-z][\w-]*/gi) ?? []
  ).length;
  return ids * 10_000 + classes * 100 + types;
}

/**
 * The elements whose stylesheet font-family comes from a rule naming an
 * @font-face family, once every font rule has been weighed the CSS way:
 * `!important` first, then specificity, then the later rule. React Email's
 * <Font> writes `* { font-family: 'Inter', Arial }` beside its @font-face; an
 * Outlook-only `td, p, a { font-family: Arial !important }` wins over it, and
 * a real Outlook 2016 drew those elements in Arial (AI Fix real-device round,
 * 2026-10-22). Only the rule that wins can send Word to Times New Roman.
 */
function fontFaceWinners($: CheerioAPI, faces: Faces): Map<Element, string> {
  const best = new Map<Element, { weight: number; family: string | null }>();
  let order = 0;
  $("style").each((_, block) => {
    for (const { selector, body } of topLevelRules($(block).html() ?? "")) {
      const family = parseInlineStyle(body.replace(/!important/gi, "")).get("font-family");
      if (family === undefined) continue;
      const important = /font-family\s*:[^;]*!important/i.test(body);
      const drawn = wordFamily(family, faces);
      order++;
      for (const one of selector.split(",")) {
        if (!one.trim() || IGNORED_BY_WORD.test(one)) continue;
        // Word ignores `*`, even `!important` inside [if mso]: text keeps the
        // family it inherits, or Word's default (probe outlook-word-flow,
        // 2026-10-31). The browser would apply it, so it is cancelled per element.
        const universal = one.trim() === "*";
        const family = universal ? WORD_DEFAULT : drawn;
        let matched: Element[];
        try {
          matched = $(one).toArray() as Element[];
        } catch {
          continue;
        }
        // Order breaks ties inside a specificity, specificity inside importance.
        const weight = (important ? 1e12 : 0) + specificity(one.trim()) * 1e5 + order;
        for (const el of matched) {
          const was = best.get(el);
          const inherited = universal && $(el).parents("[style*='font-family']").length > 0;
          if (!was || weight > was.weight) best.set(el, { weight, family: inherited ? "inherit" : family });
        }
      }
    }
  });
  const out = new Map<Element, string>();
  for (const [el, w] of best) if (w.family) out.set(el, w.family);
  return out;
}

/** Selector forms Word was measured to ignore (probe sheet 07-style-delivery, c04, c06-c09, c11, c14). */
const IGNORED_BY_WORD = /\[|>|:first-child|:nth-child|:not\(|::?before|\.[\w-]+\.[\w-]/;

/** What a <style> selector matches in Word, or nothing for a form Word ignores. */
function matchedByWord($: CheerioAPI, selector: string): Element[] {
  if (!selector.trim() || IGNORED_BY_WORD.test(selector)) return [];
  try {
    return $(selector).toArray() as Element[];
  } catch {
    return []; // a selector this parser cannot read is left to the browser
  }
}

/**
 * Carry the element rules over to declarations that arrive through a class.
 * Adds an inline `!important` override to each matched element where Word
 * would not have honoured the property.
 */
function overrideStylesheetRules($: CheerioAPI, faces: Faces): void {
  const override = (el: Element, declarations: string) => {
    const style = $(el).attr("style") ?? "";
    const sep = style.trim() === "" || /;\s*$/.test(style) ? "" : ";";
    $(el).attr("style", `${style}${sep}${declarations}`);
  };
  const drawnBy = fontFaceWinners($, faces);
  // The family Word draws instead, for an element no inline family covers.
  for (const [el, family] of drawnBy)
    if ($(el).closest("body").length && !/font-family/i.test($(el).attr("style") ?? ""))
      override(el, `font-family:${family}!important`);
  $("style").each((_, block) => {
    for (const { selector, body } of topLevelRules($(block).html() ?? "")) {
      const props = parseInlineStyle(body.replace(/!important/gi, ""));
      const hasPadding = PADDING.some((prop) => props.has(prop));
      const hasSize = props.has("width") || props.has("height");
      const hasBackground = props.has("background") || props.has("background-color");
      const hides = props.get("display") === "none";
      if (!hasPadding && !hasSize && !hasBackground && !hides) continue;
      for (const one of selector.split(",")) {
        for (const el of matchedByWord($, one)) {
          const tag = el.tagName?.toLowerCase();
          // A class `display:none` hides a div and a table on today's Outlook
          // Classic (Preflight probe 2026-10-31, case B), as the browser does,
          // so nothing is overridden. 07 c19 / 09 c25 drew them on older builds.
          if (hasPadding && (tag === "div" || tag === "p" || tag === "span" || tag === "a"))
            override(el, "padding:0!important");
          if (hasSize && (tag === "div" || tag === "span")) {
            if (props.has("width")) override(el, "width:auto!important");
            if (props.has("height")) override(el, "height:auto!important");
          }
          if (hasBackground && (tag === "div" || tag === "h2") && holdsNoText($, el))
            override(el, "background:none!important");
        }
      }
    }
  });
}

/**
 * Colour notations Word does not parse. A declaration that uses one is ignored
 * whole: `rgba()`, 8-digit hex and `hsl()` backgrounds all left the cell's own
 * colour showing (05-backgrounds c12, c13, c14), and a real campaign's
 * `border-top: solid 1px #66666650` divider was not drawn at all. The same
 * goes for `var()`: a class rule setting a background through a custom
 * property lost to the inline colour it was meant to override
 * (07-style-delivery c13), and for 4-digit hex (09-follow-ups c31). `rgb()` and
 * 3-digit hex are read (09 c30, c32).
 */
const UNKNOWN_TO_WORD = /(?:^|;)\s*[\w-]+\s*:[^;]*(?:\brgba\(|\bhsla?\(|\bvar\(|#[0-9a-f]{8}(?![0-9a-f])|#[0-9a-f]{4}(?![0-9a-f]))[^;]*/gi;
const dropUnknown = (declarations: string) => declarations.replace(UNKNOWN_TO_WORD, "");

/**
 * Remove those declarations from style attributes and <style> blocks. Runs on
 * the source string, before the downlevel pass converts the notations into
 * `rgb()`, which Word does read. Returns the input itself when nothing matches.
 */
export function dropWordUnknownColors(html: string): string {
  if (!/rgba\(|hsla?\(|var\(|#[0-9a-f]{8}|#[0-9a-f]{4}(?![0-9a-f])|bgcolor\s*=\s*["']?#[0-9a-f]{3}(?![0-9a-f])/i.test(html)) return html;
  return html
    // A three-digit bgcolor paints nothing: `bgcolor="#888"` behind white text
    // left white on white on today's Outlook Classic (probe 2026-10-31).
    .replace(/\sbgcolor\s*=\s*(["']?)#[0-9a-f]{3}\1(?=[\s>/])/gi, "")
    .replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (whole, lead: string, dq?: string, sq?: string) => {
      const style = dq ?? sq ?? "";
      const kept = dropUnknown(style);
      if (kept === style) return whole;
      const quote = dq === undefined ? "'" : '"';
      return `${lead}${quote}${kept.replace(/^\s*;\s*/, "")}${quote}`;
    })
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_whole, open: string, css: string, close: string) =>
      // Per block, so a dropped declaration never eats the selector before it.
      `${open}${css.replace(/\{([^{}]*)\}/g, (_block, body: string) => `{${dropUnknown(body)}}`)}${close}`,
    );
}

/**
 * `display:none` hides what it is on. On today's Outlook Classic (Preflight
 * probe 2026-10-31) an inline or class `display:none` hid a div, a span and a
 * table alike, and Make's bare display:none preheader stayed hidden. The
 * 2026-10-14 sheets (09-follow-ups c21 to c25, the old provider's Outlook
 * 2007 to 2016) drew a hidden div and table; 2019 already hid a text-only div.
 * The strip pass removes `display` for Word, so hidden elements are marked
 * here, before it, for the mso-hide pass to hide. A table inside a hidden cell
 * still follows the mso-hide rules (c21, c22; not re-probed).
 * Inside a VML textbox, display:none hides nothing: Brevo's button label sits
 * in one, and two real Outlook Classic captures drew it (2026-11-02).
 */
function markHiddenCells(html: string): string {
  if (!/display\s*:\s*none/i.test(html)) return html;
  return html.replace(
    /<v:textbox\b[\s\S]*?<\/v:textbox>|(<(?:td|th|tr|span|div|table)\b[^>]*?\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi,
    (whole, lead?: string, dq?: string, sq?: string) => {
      if (lead === undefined) return whole;
      const style = dq ?? sq ?? "";
      if (!/display\s*:\s*none/i.test(style) || /mso-hide\s*:/i.test(style)) return whole;
      const quote = dq === undefined ? "'" : '"';
      // A hidden cell keeps its padding: see the "mso-hollow" pass.
      if (/^<t[dh]\s/i.test(lead) && /padding/i.test(style)) {
        const kept = style.replace(/display\s*:\s*none\s*(?:!important)?\s*;?/gi, "");
        return `${lead}${quote}${kept}${/;\s*$/.test(kept) ? "" : ";"}mso-hollow:1${quote}`;
      }
      return `${lead}${quote}${style}${/;\s*$/.test(style) ? "" : ";"}mso-hide:all${quote}`;
    },
  );
}

/** Everything done to the source string for Word, before the downlevel and strip passes. */
export function prepareWordSource(html: string): string {
  return markUnparsedInlines(wordSubstitutes(markHiddenCells(dropWordUnknownColors(html))));
}

const UNPARSED_MARK = "data-word-unparsed";
const INLINE_STYLE = new RegExp(String.raw`<(${[...INLINE_TAGS].join("|")})(?=\s)(?=[^>]*?\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'))`, "gi");
/**
 * Flags inline elements carrying a declaration Word cannot parse, while the
 * declaration is still there: the strip pass removes it before the box model
 * reads the trailing <br>s.
 */
const markUnparsedInlines = (html: string) =>
  html.replace(INLINE_STYLE, (open, _tag, dq?: string, sq?: string) =>
    wordParsesAll(parseInlineStyle(dq ?? sq ?? "")) ? open : `${open} ${UNPARSED_MARK}`);

/**
 * Names Word knows but draws in another face, ahead of the rest of the stack:
 * run fKVPhDLg6SJ1's `'Rubik', Arial` drew Calibri on the real Outlook Classic
 * capture and on local Outlook, where an unknown name fell through to Arial
 * (2026-11-04). ponytail: one name measured; add one when a capture shows it.
 */
const WORD_SUBSTITUTES: Record<string, string> = { rubik: "Calibri" };
const SUBSTITUTED = new RegExp(String.raw`(font(?:-family)?\s*:[^;"}]*?)(['"]?)\b(${Object.keys(WORD_SUBSTITUTES).join("|")})\b\2`, "gi");
const wordSubstitutes = (html: string) =>
  html.replace(SUBSTITUTED, (_, lead: string, _q: string, name: string) => `${lead}${WORD_SUBSTITUTES[name.toLowerCase()]}`);

/**
 * Faces Office downloads by name, so Word draws them whatever @font-face says:
 * real Outlook Classic drew run WSG7EFj4uHsB's declared Nunito Sans (2026-11-04),
 * and local Outlook's CloudFonts cache held the rest (2026-11-02).
 * ponytail: Microsoft's cloud catalogue is larger; add a face when a capture shows it.
 */
const OFFICE_CLOUD_FONTS = [
  "Work Sans", "Lato", "Montserrat", "Nunito", "Nunito Sans", "Open Sans", "DM Sans",
  "IBM Plex Sans", "Ubuntu", "Source Code Pro", "Raleway", "Playfair Display", "Poppins",
];
const CLOUD = new Set(OFFICE_CLOUD_FONTS.map((f) => f.toLowerCase()));

/** Families the email declares with @font-face that Word cannot fetch, each with its mso-font-alt (null when it has none). */
type Faces = Map<string, string | null>;
function declaredFaces($: CheerioAPI): Faces {
  const faces: Faces = new Map();
  $("style").each((_, block) => {
    for (const [, body] of ($(block).html() ?? "").matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const props = parseInlineStyle(body);
      const family = props.get("font-family");
      const named = props.get("mso-font-alt")?.replace(/["']/g, "").trim() || null;
      // Mobbin's quoted "sans-serif" drew Word's default, not a font of that name.
      const alt = named && /^sans-serif$/i.test(named) ? WORD_DEFAULT : named;
      if (family && !CLOUD.has(firstFamily(family))) faces.set(firstFamily(family), alt ?? faces.get(firstFamily(family)) ?? null);
    }
  });
  return faces;
}
const firstFamily = (value: string) => value.split(",")[0].replace(/["']|!important/gi, "").trim().toLowerCase();
/** Word's own font, Aptos on current Outlook. It is not bundled: Selawik stands in through Segoe UI. */
const WORD_DEFAULT = "Aptos,'Segoe UI',sans-serif";

/**
 * The family Word draws for a font-family value, or null when it reads the
 * value as written. Measured on real Outlook 2016 (AI Fix real-device round,
 * 2026-10-23), with React Email faces that declare `mso-font-alt: 'Arial'`:
 * - a first family declared by a face draws in that face's mso-font-alt
 *   (`Geist, Inter, Arial` came out in Arial), and when the face has none, in
 *   the next family of the stack: current Outlook (Microsoft 365, and 2019)
 *   drew foodpanda's `'Roboto', Arial` in Arial (emailens agreement run,
 *   2026-10-28). Outlook 2007-2016 drew Times there; 2016 left support in
 *   October 2025, so the simulation follows the Outlook readers have now;
 * - `system-ui` and the `ui-*` keywords name no font, so Word moves on to the
 *   next family: `Inter, system-ui, Arial` and `ui-sans-serif, system-ui,
 *   sans-serif` drew a sans on current Outlook (probe outlook-font-stack,
 *   2026-10-31). Outlook 2016 dropped such a value whole, to Times.
 */
function wordFamily(value: string, faces: Faces): string | null {
  const families = value.replace(/!important/gi, "").split(",");
  const named = families.filter((f) => !/^\s*(?:system-ui|ui-[a-z-]+)\s*$/i.test(f));
  const first = firstFamily(named.join(","));
  if (!faces.has(first)) return named.length < families.length ? named.join(",").trim() || WORD_DEFAULT : null;
  const alt = faces.get(first);
  if (alt) return alt === WORD_DEFAULT ? alt : `'${alt}'`;
  const rest = named.slice(1).join(",").trim();
  return rest || WORD_DEFAULT;
}

/** A border that draws: a width other than 0 and a style other than none. */
function hasBorder(props: Map<string, string>): boolean {
  for (const prop of ["border", "border-top", "border-right", "border-bottom", "border-left"]) {
    const value = props.get(prop);
    if (value && !/\b(?:none|hidden)\b/i.test(value) && !/^\s*0(?:px)?\s*$/.test(value)) return true;
  }
  return false;
}

/** A cell's left padding in px, from padding-left or the padding shorthand. */
function leftPadding(props: Map<string, string>): number {
  const own = props.get("padding-left");
  if (own !== undefined) return parseFloat(own) || 0;
  const parts = (props.get("padding") ?? "").replace(/!important/i, "").trim().split(/\s+/);
  const value = parts.length === 4 ? parts[3] : parts.length >= 2 ? parts[1] : parts[0];
  return /^\d+(?:\.\d+)?(?:px)?$/.test(value ?? "") ? parseFloat(value) : 0;
}

/**
 * The line-spacing declarations each element takes from top-level stylesheet
 * rules: local Outlook drew class font-size, line-height, mso-line-height-rule
 * and background as it drew the inline ones (2026-11-04).
 * ponytail: the last matching rule wins, specificity unweighed.
 */
const SPACING = /^(?:line-height|mso-line-height-rule|mso-line-height-alt|font-size|font|font-family|background|background-color)$/;
function sheetSpacing($: CheerioAPI): Map<Element, Map<string, string>> {
  const found = new Map<Element, Map<string, string>>();
  $("style").each((_, block) => {
    for (const { selector, body } of topLevelRules($(block).html() ?? "")) {
      const rule = [...parseInlineStyle(body.replace(/!important/gi, ""))].filter(([k]) => SPACING.test(k));
      if (!rule.length) continue;
      for (const one of selector.split(",")) {
        for (const el of matchedByWord($, one)) {
          const has = found.get(el) ?? new Map<string, string>();
          for (const [k, v] of rule) has.set(k, v);
          found.set(el, has);
        }
      }
    }
  });
  return found;
}

export function applyWordBoxModel($: CheerioAPI): void {
  const faces = declaredFaces($);
  const sheet = sheetSpacing($);
  // An element's spacing: its stylesheet rules under its inline style, with
  // mso-line-height-alt read as the line-height (as the inline pass does).
  const spacingOf = (el: Element) => {
    const all = new Map([...(sheet.get(el) ?? []), ...parseInlineStyle($(el).attr("style") || "")]);
    const alt = all.get("mso-line-height-alt")?.trim();
    const altEm = /^([\d.]+)em$/i.exec(alt ?? "");
    if (alt) all.set("line-height", altEm ? `${Number(altEm[1]) * 16}px` : alt);
    return all;
  };

  $("[style]").each((_, node) => {
    const el = node as Element;
    const tag = el.tagName?.toLowerCase();
    const props = parseInlineStyle($(el).attr("style") || "");
    const before = serializeStyle(props);

    // A padding or margin in rem is dropped: Word does not read the unit.
    // Every gap React Email's Tailwind wrote in rem (padding-top:5rem on a
    // section cell, margin-top:4rem on a card) was gone on real Outlook 2016
    // and 2019, while its px paddings stayed (studio-abandoned-cart and
    // barebone-welcome, AI Fix real-device rounds, 2026-10-22).
    for (const prop of [...PADDING, ...MARGIN]) {
      if (/\d(?:\.\d+)?rem\b/i.test(props.get(prop) ?? "")) props.delete(prop);
    }

    // Padding is honoured on table cells and nowhere else that was tried:
    // div, p, span and a all rendered as if it were absent (01 c01-c08, c26-c28).
    // The exception is a bordered div or p: Word draws a paragraph border and
    // keeps the padding as the space inside it. Seen on real Outlook 2016
    // (2026-10-14): `padding:20px; border:2px solid` with text inside rendered
    // the 20px inset. The 01 cells had no border. Whether text content matters
    // as well was not isolated.
    // A bordered link keeps it the same way, in a box as wide as its text; the
    // preview's link reset skips data-word-box (probe outlook-para-borders F,
    // Carom's outlined button, local Outlook, 2026-11-02).
    const bordered = (tag === "div" || tag === "p" || tag === "a") && hasBorder(props);
    if (bordered && tag === "a") {
      props.set("display", "inline-block");
      $(el).attr("data-word-box", "");
      // Its fill stays on the glyphs: OpenRouter's black button is a black band
      // behind the label inside its padding (real capture, 2026-11-02).
      const fill = props.get("background-color") ?? props.get("background");
      if (fill) {
        props.delete("background-color");
        props.delete("background");
        $(el).html(`<span style="background-color:${fill}">${$(el).html()}</span>`);
      }
    }
    // That space sits against a border: with only a border-bottom, padding-top
    // adds nothing (probe outlook-para-borders A to E, 2026-11-02).
    if (bordered && !props.has("border") && !props.has("border-top")) props.set("padding-top", "0");
    // React Email's button draws its padding in Word with spacer runs instead:
    // `<i style="mso-font-width:450%" hidden>` either side of the label. Neon's
    // real capture kept a 38px tall button (round 2 tuning, 2026-10-31).
    const spacerRuns = tag === "a" && $(el).html()?.includes("mso-font-width");
    if (spacerRuns) props.set("display", "inline-block");
    if ((tag === "div" || tag === "p" || tag === "span" || tag === "a") && !bordered && !spacerRuns) {
      for (const prop of PADDING) props.delete(prop);
    }

    // An intrinsic width keyword is not read: the width attribute, if any,
    // sizes the box. React Email's social row is `<table width="100%"
    // style="width:fit-content">`: compact in a browser, the full 600px
    // column on real Outlook 2016 (2026-10-23).
    if (/^(?:fit|max|min)-content$/i.test((props.get("width") ?? "").replace(/!important/i, "").trim())) props.delete("width");

    if (tag === "div" || tag === "span") {
      // A width or height on a div or span is ignored: the box is as wide as
      // its container and as tall as its content (01 c23-c27; 05 c04, c08).
      props.delete("width");
      props.delete("height");
    }

    if (tag === "div" || tag === "table") {
      // The margin's lengths are honoured (01 c12), but `auto` does not centre,
      // on a table either: align, a parent's align or <center> does (probe
      // outlook-table-centre, 2026-10-31). A negative value does not pull the
      // box up (01 c17, c19, c20).
      // On a div a negative side margin does move it: a list in
      // <div style="margin-left:-20px"> sat 20px further left in real Outlook
      // Classic (guYL7gkFIgOm, run 2zHY5TVR71vV, 2026-11-06).
      for (const prop of MARGIN) {
        const value = props.get(prop);
        if (value !== undefined) props.set(prop, tag === "div" ? flattenDivMargin(prop, value) : flattenMargin(value));
      }
      // A table with align="center" loses its vertical margins, at any depth
      // (probe outlook-word-flow margin, 2026-11-01: rows 2, 4, 5 and 7).
      if (tag === "table" && /center/i.test($(el).attr("align") ?? "")) {
        props.delete("margin-top");
        props.delete("margin-bottom");
      }
    }

    // A background paints behind the element's own lines of text. A div or h2
    // that only wraps other elements has no lines, and nothing was painted
    // (01 c01-c03, c12, c15, c17, c21). A paragraph with text kept its
    // background (01 c04).
    if ((tag === "div" || tag === "h2") && holdsNoText($, el)) {
      props.delete("background");
      props.delete("background-color");
    }

    // A family declared with @font-face cannot be loaded. Outlook 2007-2016
    // then skipped the rest of the stack and drew Times New Roman; Outlook
    // 2019 and Microsoft 365 use the next family, and that is what this draws
    // (see wordFamily).
    const family = props.get("font-family");
    const drawn = family === undefined ? null : wordFamily(family, faces);
    if (drawn) props.set("font-family", drawn);
    // A generic family on the body or a cell reaches the text as Word's default:
    // Neon's and Mobbin's `sans-serif` drew Aptos where the same value on a <p>
    // drew Arial (round 2 tuning, 2026-10-31).
    if ((tag === "body" || tag === "td") && /^\s*sans-serif(?![\w-])/i.test(drawn ?? family ?? "")) props.set("font-family", WORD_DEFAULT);

    // `mso-line-height-alt` replaces the line-height, as mso-padding-alt does
    // the padding. A real campaign set `line-height:1.50;
    // mso-line-height-alt:1.5em` on 16px text and Outlook spaced the lines
    // 24px apart, where the unitless value alone gives one normal line.
    // Beefree's VML button: Word honours these over the box the browser would
    // draw inside the shape (MongoDB's Register Now, round 2 tuning).
    if (/none/i.test(props.get("mso-border-alt") ?? "")) {
      for (const prop of [...props.keys()]) if (prop.startsWith("border") && prop !== "border-radius") props.delete(prop);
    }
    if (/transparent/i.test(props.get("mso-shading") ?? "")) props.delete("background-color");

    const lineAlt = props.get("mso-line-height-alt");
    // In em it counts from 16px whatever the font size: 2.875em spaced 30px and
    // 16px text alike 46px apart (probe outlook-word-flow, 2026-10-31).
    const altEm = /^([\d.]+)em$/i.exec(lineAlt?.trim() ?? "");
    if (lineAlt !== undefined) props.set("line-height", altEm ? `${Number(altEm[1]) * 16}px` : lineAlt);

    // Without `mso-line-height-rule:exactly`, a line-height is a minimum: the
    // line is never shorter than the font's own height. `line-height:30px` at
    // `font-size:30px` measured 35px, which is 1.15 times the size
    // (02-widths c27). With the rule, 24px and 40px came out exact
    // (04-typography c08, c10).
    const lineHeight = /^([\d.]+)px$/i.exec(props.get("line-height") ?? "");
    const fontSize = /^([\d.]+)px$/i.exec(props.get("font-size") ?? "");
    if (lineHeight && fontSize && !/exactly/i.test(props.get("mso-line-height-rule") ?? "")) {
      const natural = naturalHeight(Number(fontSize[1]), props.get("font-family"));
      if (Number(lineHeight[1]) < natural) props.set("line-height", `${natural}px`);
    }

    // Two properties Word does not apply at all: a 20px word-spacing left the
    // text at its normal width (04-typography c21), and a 10px outline drew
    // nothing (05-backgrounds c22).
    for (const prop of ["word-spacing", "outline", "outline-width", "outline-style", "outline-color", "outline-offset"]) {
      props.delete(prop);
    }

    if (tag === "div" && /^center$/i.test(props.get("text-align") ?? "") && !$(el).attr("align")) {
      // `text-align:center` on a div centres a table inside it, as the align
      // attribute does (03-columns c17). In a browser only the attribute does,
      // and only when no text-align declaration overrides it; the attribute
      // centres the text as well, so nothing is lost by the swap.
      $(el).attr("align", "center");
      props.delete("text-align");
    }

    if (tag === "td" || tag === "th") {
      // `mso-padding-alt` replaces the cell's padding: 20px with a 5px
      // alternative measured 5px on every side (01 c11).
      const alt = props.get("mso-padding-alt");
      if (alt !== undefined) {
        for (const prop of PADDING) props.delete(prop);
        props.set("padding", alt);
      }
    }

    if (tag === "div" || tag === "td" || tag === "th") {
      for (const prop of BORDER_WIDTH) {
        const value = props.get(prop);
        if (value !== undefined) props.set(prop, capBorder(value));
      }
    }

    const after = serializeStyle(props);
    if (after !== before) {
      if (after) $(el).attr("style", after);
      else $(el).removeAttr("style");
    }
  });

  // display:none on a cell hides its content, not its padding: a cell with
  // padding 20px 10px 10px left a 30px gap, one with none left nothing, and a
  // hidden <tr> left nothing at all (probe outlook-word-flow hidden, 2026-11-01).
  $("td[style*='mso-hollow'], th[style*='mso-hollow']").each((_, node) => {
    const cell = $(node);
    const props = parseInlineStyle(cell.attr("style") || "");
    props.delete("mso-hollow");
    props.set("display", "table-cell!important"); // over a class that hides it
    props.set("font-size", "0");
    props.set("line-height", "0");
    cell.empty().attr("style", serializeStyle(props));
  });

  // A paragraph of only whitespace adds no height and no margin (local Outlook,
  // 2026-11-04: run gjAruZbzWbTa's 38px-margin <p> under its button). &nbsp;
  // is text to Word and stays.
  $("p").each((_, node) => {
    if (!$(node).children().length && !/[^ \t\r\n]/.test($(node).text())) $(node).remove();
  });

  // A 1px tracking image outside any cell adds no line (local Outlook,
  // 2026-11-03); drawn inline it took a whole line box (run qCRl2f88rRPV, 16px).
  $("img").each((_, node) => {
    const img = $(node);
    const props = parseInlineStyle(img.attr("style") || "");
    const height = Number.parseFloat(props.get("height") ?? img.attr("height") ?? "");
    if (img.closest("td, th").length || !(height <= 1)) return;
    props.set("display", "block");
    img.attr("style", serializeStyle(props));
  });

  // Whatever its border, an <hr> is a grey rule 9px tall plus its margins, and
  // always full width (probe outlook-word-flow hr, 2026-11-01: 9, 29, 9, 49).
  $("hr").each((_, node) => {
    const props = parseInlineStyle($(node).attr("style") || "");
    const [top = "", , bottom = top] = (props.get("margin") ?? "").trim().split(/\s+/).concat([""]);
    const px = (v?: string) => Number.parseFloat(v ?? "") || 0;
    const set = new Map([
      ["border", "none"],
      ["border-top", "1px solid #a0a0a0"],
      ["height", "0"],
      ["width", "100%"],
      ["margin", `${px(props.get("margin-top") ?? top) + 4}px 0 ${px(props.get("margin-bottom") ?? (bottom || top)) + 4}px`],
    ]);
    $(node).attr("style", serializeStyle(set));
  });

  // A link around a div or a p leaves an empty line on each side: a 24px line took
  // 65px. Around a table, an image or text it adds nothing (probe
  // outlook-word-flow anchor, 2026-11-01; Mobbin's rows).
  // The line above comes only at the start of its container or after a block;
  // after inline content (an image, a link, text, a VML shape) there is none.
  // The line below goes when it ends its cell (vVjS's tiles and store labels;
  // local Outlook probes, 2026-11-05).
  const blank = (n: AnyNode) => n.type === "comment" || (n.type === "text" && !(n as Text).data.trim());
  $("a").each((_, node) => {
    if (!$(node).children("div, p").length) return;
    let before = node.prev;
    while (before && blank(before)) before = before.prev;
    let after = node.next;
    while (after && blank(after)) after = after.next;
    const parent = node.parent;
    const endsCell = !after && parent?.type === "tag" && /^t[dh]$/.test((parent as Element).name);
    if (!before || (before.type === "tag" && LINK_LINE_BLOCKS.has((before as Element).name)))
      $(node).before('<div style="height:21px"></div>');
    if (!endsCell) $(node).after('<div style="height:20px"></div>');
  });

  // text-decoration-line means nothing to Word: a link it sets to none stays
  // underlined, where text-decoration:none does not (same probe, Mobbin's rows).
  $("a[style*='text-decoration-line']").each((_, node) => {
    const props = parseInlineStyle($(node).attr("style") || "");
    props.delete("text-decoration-line");
    $(node).attr("style", serializeStyle(props));
  });

  // A nested table hangs its first cell's left padding out to the left: Word
  // lines the cell's text up with the text around the table. foodpanda's code
  // pill (a dark cell, padding 4px 12px, under "40% off") started 12px left of
  // that text on the real device (emailens agreement run, 2026-10-28). Only a
  // painted cell shows it. Shifted, not margined: the app pins table margins.
  // ponytail: one observation; top-level tables and right padding not checked.
  // Only a shrink-wrapped table hangs: a sized or centred one (an email's
  // container, a 100% column row) is placed by its width, not by the text, and
  // shifting it slid whole emails left in the simulation (visual check, 2026-10-29).
  $("td table, th table").each((_, node) => {
    const table = node as Element;
    const own = parseInlineStyle($(table).attr("style") || "");
    if ($(table).attr("width") || own.has("width") || /center/i.test($(table).attr("align") || "")) return;
    const cell = $(table).find("> tr > td, > tbody > tr > td").first();
    if (!cell.length) return;
    const cellProps = parseInlineStyle(cell.attr("style") || "");
    if (!cell.attr("bgcolor") && !cellProps.has("background") && !cellProps.has("background-color")) return;
    const left = leftPadding(cellProps);
    if (left <= 0) return;
    const props = parseInlineStyle($(table).attr("style") || "");
    props.set("position", "relative");
    props.set("left", `-${left}px`);
    $(table).attr("style", serializeStyle(props));
  });

  // Images get their own pass: most carry no style attribute at all.
  $("img").each((_, node) => {
    const el = node as Element;
    const props = parseInlineStyle($(el).attr("style") || "");
    // An image is sized by its width and height attributes and by nothing
    // else (Emailens probe sheet 06-images, Outlook 2007 to 2019):
    //   - a CSS width is not read, alone or against an attribute (c04, c05,
    //     c21), and neither is `height:auto` (c09);
    //   - an attribute must be a bare number: `width="200px"` and
    //     `width="100%"` both left the image at its natural size (c06, c08);
    //   - with no usable attribute the image is drawn at its natural size,
    //     however narrow the cell.
    // A real campaign's `width="138"` with `width:100%` drew at 138px.
    // A decimal is a number too: Iterable's `width="193.5"` drew at ~193px
    // on today's Outlook Classic (Preflight probe 2026-10-31, I1; MongoDB).
    const NUMBER = /^\d+(?:\.\d+)?$/;
    // A percentage attribute sizes against the cell: Resend's width="100%" drew
    // at the column's width, not its 4624px source (round 2 grades, 2026-11-01).
    const percent = /^\d+(?:\.\d+)?%$/.test($(el).attr("width")?.trim() ?? "") ? $(el).attr("width")?.trim() : undefined;
    const numeric = (name: string) => {
      const value = $(el).attr(name)?.trim();
      if (value !== undefined && !NUMBER.test(value)) $(el).removeAttr(name);
      return value !== undefined && NUMBER.test(value) ? String(Math.round(Number(value))) : undefined;
    };
    const width = numeric("width");
    const height = numeric("height");
    // Padding, margin, border and background on the image itself drew
    // nothing (c18, c19, c20, c23), and nor did the hspace, vspace and
    // border attributes (c16, c17).
    for (const prop of [...props.keys()]) {
      if (/^(?:width|height|max-|min-|padding|margin|border|background)/.test(prop)) props.delete(prop);
    }
    for (const name of ["hspace", "vspace"]) $(el).removeAttr(name);
    if ($(el).attr("border") !== undefined) $(el).attr("border", "0");
    // !important, so a class rule such as `img{width:100%}` cannot resize it
    // in the preview; Word reads no CSS size from any source.
    props.set("width", percent ? `${percent}!important` : width ? `${width}px!important` : "auto!important");
    props.set("height", height ? `${height}px!important` : "auto!important");
    props.set("max-width", "none!important");
    // An inline image leaves no gap for descenders beneath it (c12).
    props.set("vertical-align", "bottom");
    // SVG and WebP are not drawn: the space is kept and left empty (c24, c25).
    if (/\.(?:svg|webp)(?:[?#]|$)/i.test($(el).attr("src") ?? "")) props.set("visibility", "hidden");
    const after = serializeStyle(props);
    if (after) $(el).attr("style", after);
    else $(el).removeAttr("style");
  });

  // The run of invisible characters an email puts after its preheader is in a
  // div hidden with `display:none`, which Word does not honour on a div, so
  // the run is laid out. It is hundreds of non-breaking characters that a
  // browser will not wrap, which pushed the whole preview wider than the
  // email. Kept as the single blank line it amounts to.
  // ponytail: one line is the least it can be; how many lines Word really
  // gives it was not measured.
  $("div").each((_, node) => {
    const el = $(node);
    if (el.children().length > 0) return;
    const text = el.text();
    if (text.length > 20 && INVISIBLE_ONLY.test(text)) el.text(String.fromCharCode(160));
  });

  // A list's own top and bottom margins are not read. It keeps a line of space
  // on each side, and loses both when its items set a margin of their own;
  // the items' margins then apply. A `<br>` straight before the list adds a
  // line either way, where a browser swallows it (09-follow-ups c20). Its text
  // sits 48px in whatever padding-left says, and margin-left adds to that
  // (list probes, local Outlook, 2026-11-02).
  $("ul,ol").each((_, node) => {
    const el = node as Element;
    const props = parseInlineStyle($(el).attr("style") || "");
    let previous = el.prev;
    while (previous && previous.type === "text" && !previous.data.trim()) previous = previous.prev;
    const afterBreak = previous?.type === "tag" && previous.name === "br";
    const tight = $(el)
      .children("li")
      .toArray()
      .some((item) => {
        const style = parseInlineStyle($(item).attr("style") || "");
        return style.has("margin") || style.has("margin-top") || style.has("margin-bottom");
      });
    // Nested in an item, it sits straight under the item's text (f93z, 2026-11-05).
    const nested = el.parent?.type === "tag" && el.parent.name === "li";
    props.set("margin-top", afterBreak || (previous && !tight && !nested) ? "1lh!important" : "0!important");
    props.set("margin-bottom", tight ? "0!important" : `${LIST_TRAILING_PX}px!important`);
    props.set("padding-left", `${LIST_TEXT_INDENT_PX}px!important`);
    $(el).attr("style", serializeStyle(props));
  });

  // A browser folds away the <br> that ends a block. Word does too, unless an
  // inline element around it carries a declaration Word cannot parse
  // (word-break:break-word, box-sizing, max-width, display:inline-block...):
  // then that <br> keeps its full line. One more <br> gives the browser the
  // same line (f93z real capture + local Outlook probes, 2026-11-05).
  $("br").each((_, node) => {
    let at: AnyNode = node as Element;
    let unparsed = false;
    for (;;) {
      for (let next = at.next; next; next = next.next) {
        if (next.type !== "text" || !/^[ \t\r\n]*$/.test((next as Text).data)) return;
      }
      const parent: AnyNode | null = at.parent;
      if (parent?.type !== "tag" || !INLINE_TAGS.has((parent as Element).name)) break;
      if ($(parent).attr(UNPARSED_MARK) !== undefined) unparsed = true;
      at = parent;
    }
    if (unparsed) $(node).after("<br>");
  });
  $(`[${UNPARSED_MARK}]`).removeAttr(UNPARSED_MARK);

  // <picture> falls back to its <img>: a WebP <source> was passed over for
  // the PNG beside it (06-images c27).
  $("picture source").remove();

  $("table").each((_, node) => {
    const el = node as Element;
    const table = $(el);
    // A width attribute is a bare number or a percentage. `width="300px"` is
    // not read, and the table shrinks to its content (02-widths c06).
    if (/^\d+px$/i.test(table.attr("width") ?? "")) table.removeAttr("width");

    const props = parseInlineStyle(table.attr("style") || "");
    const before = serializeStyle(props);
    // A table floated with align="left" or "right" keeps a small gutter on
    // each side: two 100px tables sat at 3px and 110px, not 0 and 100
    // (03-columns c02). `mso-table-lspace` and `mso-table-rspace` are how an
    // email removes it, so one that sets either is left alone.
    if (/^(left|right)$/i.test(table.attr("align") ?? "") && !props.has("mso-table-lspace") && !props.has("mso-table-rspace")) {
      props.set("margin-left", `${TABLE_GUTTER}px!important`);
      props.set("margin-right", `${TABLE_GUTTER}px!important`);
    }
    // A right-to-left table sits against the right edge of its cell
    // (03-columns c21); a browser leaves it on the left.
    if (/^rtl$/i.test(table.attr("dir") ?? "")) props.set("margin-left", "auto!important");
    // A negative margin does not pull a table over its neighbour: with
    // `margin-left:-20px` it stayed where it was (09-follow-ups c33).
    for (const prop of MARGIN) {
      const value = props.get(prop);
      if (value !== undefined && /(^|\s)-/.test(value)) props.set(prop, flattenMargin(value));
    }
    const after = serializeStyle(props);
    if (after !== before) table.attr("style", after);
  });

  // A paragraph and an h2 have no default margin: with none declared, each sat
  // flush against its container where a browser adds about a line of space
  // (01 c14, c15). Prepended, and without !important, so anything the email
  // declares itself still wins. Other headings were not measured.
  // After the inline pass, which would otherwise delete the overrides it adds.
  overrideStylesheetRules($, faces);

  // A table cell starts left-aligned: the alignment of the cell around its
  // table does not reach in, as a browser carries text-align down. On real
  // Outlook 2016 and 2019 (AI Fix real-device round, 2026-10-23), text
  // centred only by an outer `<td align="center" style="text-align:center">`
  // came out on the left inside the nested table's cell, while text with
  // its own text-align stayed centred. A cell with an align, a text-align of
  // its own or a class (a class rule may set it) is left as written, and so
  // is a cell whose own row or table sets the alignment.
  $("body td").each((_, node) => {
    const cell = $(node);
    if (cell.attr("align") !== undefined || cell.attr("class")) return;
    const style = cell.attr("style") ?? "";
    if (/text-align\s*:/i.test(style)) return;
    // Its own row or table does reach it: a table styled text-align:center
    // centred its cells' text on the same devices (the testimonial card).
    const row = cell.closest("tr");
    const table = cell.closest("table");
    if (row.attr("align") !== undefined || [row, table].some((n) => /text-align\s*:/i.test(n.attr("style") ?? ""))) return;
    cell.attr("style", `${style}${style.trim() === "" || /;\s*$/.test(style) ? "" : ";"}text-align:left`);
  });

  // Elsewhere a table's vertical margin is painted inside it, as extra height on
  // the first or last row: 20px rows measured 60px with margin-top:40px and with
  // margin-bottom:40px (probe outlook-word-flow margin, 2026-11-01; DevHunt's
  // sponsor box and button).
  // A cell of bare text takes its own margin, inline or from the stylesheet, in
  // place of its table's, and with no table margin too (local Outlook,
  // 2026-11-04: run gjAruZbzWbTa's heading class set 48px over its table's 28px).
  // ponytail: the last matching rule wins, specificity unweighed.
  const sheetMargins = new Map<Element, Map<string, string>>();
  $("style").each((_, block) => {
    for (const { selector, body } of topLevelRules($(block).html() ?? "")) {
      if (!/margin/i.test(body)) continue;
      let cells: Element[] = [];
      try {
        cells = $(selector).filter("td, th").toArray();
      } catch {
        continue;
      }
      const rule = parseInlineStyle(body.replace(/!important/gi, ""));
      for (const cell of cells) {
        const has = sheetMargins.get(cell) ?? new Map<string, string>();
        for (const [k, v] of rule) if (/^margin(?:-top|-bottom)?$/.test(k)) has.set(k, v);
        sheetMargins.set(cell, has);
      }
    }
  });
  const verticalMargins = (props: Map<string, string>) => {
    const box = (props.get("margin") ?? "").trim().split(/\s+/).filter(Boolean);
    const read = (v?: string) => (v === undefined ? undefined : Number.parseFloat(v) || 0);
    return { top: read(props.get("margin-top") ?? box[0]), bottom: read(props.get("margin-bottom") ?? box[2] ?? box[0]) };
  };
  const holdsBareText = (cell: Element) => {
    const inline = $(cell).clone();
    inline.find("table, div, p, ul, ol, h1, h2, h3, h4, h5, h6").remove();
    return /[^\s ]/.test(inline.text());
  };
  $("table").each((_, node) => {
    const table = $(node);
    const props = parseInlineStyle(table.attr("style") || "");
    const box = (props.get("margin") ?? "").trim().split(/\s+/).filter(Boolean);
    const centred = /center/i.test(table.attr("align") ?? "");
    const margins = verticalMargins(props);
    const top = centred ? 0 : (margins.top ?? 0);
    const bottom = centred ? 0 : (margins.bottom ?? 0);
    // Each row whose cell holds bare text takes the margin, top and bottom, and
    // a row of blocks or &nbsp; does not (local Outlook, 2026-11-04: run
    // gjAruZbzWbTa's heading row took 48px, its list rows and the table's foot none).
    // ponytail: a <ul> row grew a little too; lists are left out until measured.
    table.find("> tr, > tbody > tr").each((_, row) => {
      const cells = $(row).children("td, th").toArray();
      const bare = cells.filter(holdsBareText);
      if (!bare.length) return;
      for (const cell of cells) {
        const mine = bare.includes(cell)
          ? verticalMargins(new Map([...(sheetMargins.get(cell) ?? []), ...parseInlineStyle($(cell).attr("style") || "")]))
          : { top: undefined, bottom: undefined };
        const style = parseInlineStyle($(cell).attr("style") || "");
        const pad = (style.get("padding") ?? "").trim().split(/\s+/).filter(Boolean);
        for (const [side, by] of [["top", mine.top ?? top], ["bottom", mine.bottom ?? bottom]] as const) {
          if (by <= 0) continue;
          const was = Number.parseFloat(style.get(`padding-${side}`) ?? (side === "top" ? pad[0] : (pad[2] ?? pad[0])) ?? "") || 0;
          style.set(`padding-${side}`, `${was + by}px`);
        }
        $(cell).attr("style", serializeStyle(style));
      }
    });
    if ((top <= 0 && bottom <= 0) || centred) return;
    props.delete("margin-top");
    props.delete("margin-bottom");
    if (box.length) {
      props.delete("margin");
      if (box[1]) props.set("margin-left", box[3] ?? box[1]);
      if (box[1]) props.set("margin-right", box[1]);
    }
    table.attr("style", serializeStyle(props));
  });

  // Word keeps one top and one bottom padding per row: every cell takes the
  // row's largest, even at vertical-align:top (local Outlook, 2026-11-04: text
  // beside an empty padding-top:20px cell dropped 20; run gjAruZbzWbTa's first
  // bullet). ponytail: Word leaves a neighbour's borrowed top band unpainted;
  // padding paints it. A transparent border-top would match if it ever shows.
  $("tr").each((_, row) => {
    const cells = $(row).children("td, th").toArray();
    if (cells.length < 2) return;
    const sides = cells.map((cell) => {
      const style = parseInlineStyle($(cell).attr("style") || "");
      const pad = (style.get("padding") ?? "").trim().split(/\s+/).filter(Boolean);
      const read = (v?: string) => Number.parseFloat(v ?? "") || 0;
      return { style, top: read(style.get("padding-top") ?? pad[0]), bottom: read(style.get("padding-bottom") ?? pad[2] ?? pad[0]) };
    });
    const top = Math.max(...sides.map((s) => s.top));
    const bottom = Math.max(...sides.map((s) => s.bottom));
    cells.forEach((cell, i) => {
      const { style } = sides[i];
      if (sides[i].top < top) style.set("padding-top", `${top}px`);
      if (sides[i].bottom < bottom) style.set("padding-bottom", `${bottom}px`);
      if (sides[i].top < top || sides[i].bottom < bottom) $(cell).attr("style", serializeStyle(style));
    });
  });

  // `mso-element:para-border-div` makes the table a Word frame: centred, dotted,
  // its text justified. Uneed's frame measured 667px around 650px of text, 5px in
  // from the left (round 2, 2026-11-01).
  $("table").each((_, node) => {
    const props = parseInlineStyle($(node).attr("style") || "");
    if (!/para-border-div/i.test(props.get("mso-element") ?? "")) return;
    const width = Number.parseFloat(props.get("mso-element-frame-width") ?? "");
    if (!width) return;
    props.delete("max-width");
    props.set("width", `${width + 17}px`);
    props.set("box-sizing", "border-box");
    props.set("margin", "0 auto");
    props.set("padding", "4px 12px 4px 4px");
    props.set("border", "1px dotted #a6a6a6");
    props.set("border-collapse", "separate");
    props.set("text-align", "justify");
    $(node).attr("style", serializeStyle(props));
    $(node).removeAttr("width");
  });

  // A zero-width border with a style is still a hairline: SaasHub's
  // `border:0px solid #cccccc` frames the email on real Outlook.
  $("table").each((_, node) => {
    const props = parseInlineStyle($(node).attr("style") || "");
    const zero = /^0(?:px)?\s+solid\s+(\S+)/i.exec(props.get("border")?.trim() ?? "");
    if (!zero) return;
    props.set("border", `1px solid ${zero[1]}`);
    $(node).attr("style", serializeStyle(props));
  });

  // Word draws neighbouring paragraphs with the same border as one block: no
  // rule and no padding between them, only after the last. Margins stay, and
  // divs do not merge (probe outlook-para-borders A to E, Carom's date list,
  // 2026-11-02).
  const borderOf = (style: string | undefined) =>
    [...parseInlineStyle(style ?? "")].filter(([k, v]) => k.startsWith("border") && !/^0|none/.test(v)).join(";");
  $("p").each((_, node) => {
    const p = $(node);
    const next = p.next();
    const border = borderOf(p.attr("style"));
    if (!border || !next.is("p") || borderOf(next.attr("style")) !== border) return;
    const props = parseInlineStyle(p.attr("style") ?? "");
    for (const key of [...props.keys()]) if (key.startsWith("border")) props.delete(key);
    props.set("padding-bottom", "0");
    p.attr("style", serializeStyle(props));
  });

  // A paragraph keeps its gap between siblings and loses it only at the edge of
  // its container: TAAFT's and SaasHub's paragraphs are spaced on real Outlook
  // and in real Word, on the build readers have (2026-11-01). A margin the
  // email sets keeps even there, inline or from a <style> rule: Marc Lou's
  // `.body p{margin:0 0 16px}` holds on its last paragraph (round 3, 2026-11-02).
  const margined = new Set<Element>();
  $("style").each((_, block) => {
    for (const { selector, body } of topLevelRules($(block).html() ?? "")) {
      const props = parseInlineStyle(body);
      if (!props.has("margin") && !props.has("margin-top") && !props.has("margin-bottom")) continue;
      for (const one of selector.split(",")) for (const el of matchedByWord($, one)) margined.add(el);
    }
  });
  $("p").each((_, node) => {
    const p = $(node);
    const props = parseInlineStyle(p.attr("style") || "");
    if (props.has("margin") || props.has("margin-top") || props.has("margin-bottom")) return;
    if (margined.has(node as Element)) return;
    if (!p.prev().length) props.set("margin-top", "0");
    if (!p.next().length) props.set("margin-bottom", "0");
    const after = serializeStyle(props);
    if (after) p.attr("style", after);
  });

  // Word spaces a paragraph's lines by its own px line-height and ignores an
  // inline's: 18px spans in a 14px paragraph at mso-line-height-alt:25.2px
  // sat 25px apart, where the browser stacked the strut and the span to 27
  // (local Outlook, 2026-11-04, run qCRl2f88rRPV), and a span sized by a class
  // alike. A normal line-height keeps the line at the paragraph's height and
  // still grows it for a larger font.
  // ponytail: unitless and `exactly` paragraphs are left as they were.
  $("span, a, strong, b, em, i, u, font").each((_, node) => {
    const el = node as Element;
    const props = parseInlineStyle($(el).attr("style") || "");
    if (/block/i.test(props.get("display") ?? "")) return;
    const spacing = $(el).parents().toArray().map(spacingOf).find((st) => st.has("line-height"));
    if (!/^[\d.]+px$/i.test(spacing?.get("line-height") ?? "") || /exactly/i.test(spacing?.get("mso-line-height-rule") ?? "")) return;
    props.set("line-height", "normal");
    $(el).attr("style", serializeStyle(props));
  });

  // Without a px line-height, each line is as tall as the runs on it: 12px
  // spans sat 14.4px apart in a 16px or 30px block, unitless 1.5 or none, the
  // last line too (local Outlook, 2026-11-05; run VQs6sjeqLmY5's 12px footer
  // in a 16px cell, 14-15px apart on the real device). A browser keeps the
  // block's own line as a floor. A zero block line-height takes the floor away
  // and its inline children set the line. Only blocks whose text is all inside
  // inline elements: direct text or a <br> would lose its line.
  // ponytail: % and whole-number line-heights are left as they were.
  $("p, div, td, th, li, h1, h2, h3, h4, h5, h6").each((_, node) => {
    const el = node as Element;
    const kids = $(el).contents().toArray().filter((n) => !(n.type === "comment" || (n.type === "text" && !/[^\s]/.test((n as Text).data))));
    if (!kids.length || !kids.every((n) => n.type === "tag" && INLINE_TAGS.has((n as Element).name))) return;
    // Text only: lines holding an image or a box were not measured, and
    // taking their floor away moved 8kZz's and kV0j's image rows.
    // A link keeps the block's line (a 14px link in a 16px cell stood 18.4px,
    // a 14px span 16.8px, local Outlook 2026-11-05), so a block holding one is left.
    if ($(el).find("img, table, svg, a, [style*='display']").length) return;
    const spacing = [el, ...$(el).parents().toArray()].map(spacingOf).find((st) => st.has("line-height"));
    const line = (spacing?.get("line-height") ?? "normal").replace(/\s*!important$/i, "").trim();
    if (!(line === "normal" || (/^\d*\.\d+$/.test(line) && Number(line) >= 1))) return;
    const own = parseInlineStyle($(el).attr("style") || "");
    own.set("line-height", "0");
    $(el).attr("style", serializeStyle(own));
    for (const kid of kids) {
      const props = parseInlineStyle($(kid).attr("style") || "");
      if (props.has("line-height")) continue;
      props.set("line-height", "normal");
      $(kid).attr("style", serializeStyle(props));
    }
  });

  // Under a px line-height Word puts the extra leading above the text, where
  // the browser splits it: at 18px Arial the gap under the glyphs stayed 4px at
  // line-height 25, 40 and 60, and with `exactly` about 0.3 of it moved down
  // (local Outlook, 2026-11-04; run qCRl2f88rRPV's text sat 2-5px lower). Text
  // right in a cell moves alike. A span around the text, bottom-aligned in
  // each line, puts it there by the face's own metrics and leaves the layout
  // and the box alone.
  // A block's own background starts below its first line's extra leading and
  // covers the rest; with `exactly`, and in a cell, it fills the box.
  // ponytail: bordered blocks are left alone; stylesheet values are not read.
  const inherited = (el: Element, prop: string) => [el, ...$(el).parents().toArray()].map(spacingOf).find((st) => st.has(prop));
  // The px size from font-size or the font shorthand, whichever is nearer.
  const sizeOf = (el: Element) => {
    const sized = [el, ...$(el).parents().toArray()].map(spacingOf).find((st) => st.has("font-size") || /\d(?:\.\d+)?px/.test(st.get("font") ?? ""));
    const px = /^([\d.]+)px$/i.exec(sized?.get("font-size") ?? "") ?? /(?:^|\s)([\d.]+)px/.exec(sized?.get("font") ?? "");
    return px ? Number(px[1]) : undefined;
  };
  $("p, div, h1, h2, h3, h4, h5, h6, li, td, th").each((_, node) => {
    const el = node as Element;
    const block = $(el);
    if (block.find("p, div, h1, h2, h3, h4, h5, h6, li, table, ul, ol").length || !/[^\s ]/.test(block.text())) return;
    const own = parseInlineStyle(block.attr("style") || "");
    if (hasBorder(own)) return;
    const mine = spacingOf(el);
    const spacing = inherited(el, "line-height");
    const line = /^([\d.]+)px$/i.exec(spacing?.get("line-height") ?? "");
    const size = sizeOf(el);
    if (!line || !size) return;
    let largest = size;
    block.find("*").each((_, inner) => {
      const px = /^([\d.]+)px$/i.exec(spacingOf(inner).get("font-size") ?? "");
      if (px) largest = Math.max(largest, Number(px[1]));
    });
    const exactly = /exactly/i.test(spacing?.get("mso-line-height-rule") ?? "");
    // A line below the face's natural height grows to it (the inline pass does
    // this for inline values; stylesheet ones arrive here). Only the block's own
    // size: a larger run grows the line through its own line-height:normal.
    const natural = naturalHeight(size, inherited(el, "font-family")?.get("font-family"));
    if (!exactly && largest === size && Number(line[1]) < natural) {
      own.set("line-height", `${natural}px`);
      block.attr("style", serializeStyle(own));
      return;
    }
    const leading = Math.round((Number(line[1]) - largest * NATURAL_LINE) * 10) / 10;
    const shift = Math.round(leading * (exactly ? 0.3 : 0.5) * 10) / 10;
    if (shift <= 0) return;
    // Bottom alignment lets the browser place each line by the face's own
    // metrics; `exactly` keeps 0.2 of the leading under the text.
    block.wrapInner(
      exactly
        ? `<span style="position:relative;top:${shift}px"></span>`
        : `<span style="vertical-align:bottom;line-height:normal"></span>`,
    );
    const tag = el.tagName.toLowerCase();
    const fill = mine.get("background-color") ?? mine.get("background");
    if (exactly || tag === "td" || tag === "th" || !fill || /\(|\s/.test(fill.trim())) return;
    own.delete("background-color");
    own.set("background", `linear-gradient(transparent ${leading}px, ${fill.trim()} ${leading}px)`);
    block.attr("style", serializeStyle(own));
  });

  // Gill Sans text above 22px, or larger than its block's own size, draws in the
  // large stand-in; other text that inherits it goes back to the face's stack.
  $("body *").each((_, node) => {
    const el = node as Element;
    if (!$(el).contents().toArray().some((n) => n.type === "text" && /[^\s ]/.test((n as unknown as { data: string }).data))) return;
    const family = inherited(el, "font-family")?.get("font-family") ?? "";
    const size = sizeOf(el);
    if (!isGill(family) || size === undefined) return;
    const block = $(el).closest("p, div, li, td, th, h1, h2, h3, h4, h5, h6").get(0) as Element | undefined;
    const blockSize = block && block !== el ? sizeOf(block) : undefined;
    const large = family.trim().startsWith(GILL_LARGE);
    if (large === (size > 22 || (blockSize !== undefined && size > blockSize))) return;
    const props = parseInlineStyle($(el).attr("style") || "");
    const stack = family.replace(new RegExp(String.raw`^\s*${GILL_LARGE},\s*`), "");
    props.set("font-family", large ? stack : `${GILL_LARGE}, ${stack}`);
    $(el).attr("style", serializeStyle(props));
  });

  // Word's own paragraph margin is 14pt, not a browser's 1em: TAAFT's paragraphs
  // sit 39.5px apart on real Outlook, a 21px line plus 18.67px.
  // A cell's width includes its padding and border: TmXr's 169px and 327px
  // cells kept those widths with 20px and 24px padding (capture and local
  // Outlook, 2026-11-04), where the browser grew them and shifted the columns.
  const reset = "<style>h2{margin:0}p{margin:14pt 0}td,th{box-sizing:border-box}</style>";
  const head = $("head");
  if (head.length) head.prepend(reset);
  else if ($("p,h2,td,th").length) $.root().prepend(reset);
}
