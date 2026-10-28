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
import type { Element } from "domhandler";
import { parseInlineStyle, serializeStyle } from "./style-utils";

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
/** Space on each side of a table floated with the align attribute (03-columns c02). */
const TABLE_GUTTER = 3.5;

/** Whitespace, non-breaking and zero-width characters, and soft hyphens: nothing a reader can see. */
const INVISIBLE_ONLY = /^[\s\u00a0\u00ad\u034f\u200b-\u200d\u2007\ufeff]+$/;

/** The line of space Word leaves under a list (09-follow-ups c16, c17). */
const LIST_TRAILING_PX = 18;
/** Where a list's box starts when the email sets no indent (09-follow-ups c16). */
const LIST_INDENT_PX = 24;

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
        // Word ignores `*`: text that only `*` gives a family keeps Word's
        // default, Times New Roman. React Email's <Font> writes
        // `* { font-family: 'Inter', Arial }`, and on a real Outlook 2016 the
        // text with no family of its own came out in Times (2026-10-23).
        const family = one.trim() === "*" ? TIMES : drawn;
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
          if (!was || weight > was.weight) best.set(el, { weight, family });
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
        if (!one.trim() || IGNORED_BY_WORD.test(one)) continue;
        let matched: Element[];
        try {
          matched = $(one).toArray() as Element[];
        } catch {
          continue; // a selector this parser cannot read is left to the browser
        }
        for (const el of matched) {
          const tag = el.tagName?.toLowerCase();
          // `display:none` from a class hides neither a div nor a table: a
          // div holding a table and a div holding only text were both drawn
          // (07-style-delivery c19; 09-follow-ups c25).
          if (hides && (tag === "div" || tag === "table") && !/mso-hide/i.test($(el).attr("style") ?? "")) {
            override(el, tag === "div" ? "display:block!important" : "display:table!important");
          }
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
  if (!/rgba\(|hsla?\(|var\(|#[0-9a-f]{8}|#[0-9a-f]{4}(?![0-9a-f])/i.test(html)) return html;
  return html
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
 * `display:none` is honoured on a cell and a row, and nowhere else that was
 * tried (09-follow-ups c21 to c25, Outlook 2007 to 2016; 2019 does hide a
 * text-only div). The strip pass already removes `display` for Word, which is
 * right for a div or a table: both are drawn in full, and that is why a hidden
 * block needs `mso-hide:all` as well. A cell or a row is different: it stays
 * hidden, with any table inside it still drawn, and so does a span (c26). So
 * those are marked here,
 * before the strip pass, for the mso-hide pass to act on.
 */
function markHiddenCells(html: string): string {
  if (!/display\s*:\s*none/i.test(html)) return html;
  return html.replace(
    /(<(?:td|th|tr|span)\b[^>]*?\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi,
    (whole, lead: string, dq?: string, sq?: string) => {
      const style = dq ?? sq ?? "";
      if (!/display\s*:\s*none/i.test(style) || /mso-hide\s*:/i.test(style)) return whole;
      const quote = dq === undefined ? "'" : '"';
      return `${lead}${quote}${style}${/;\s*$/.test(style) ? "" : ";"}mso-hide:all${quote}`;
    },
  );
}

/** Everything done to the source string for Word, before the downlevel and strip passes. */
export function prepareWordSource(html: string): string {
  return markHiddenCells(dropWordUnknownColors(html));
}

/** Families the email declares with @font-face, each with its mso-font-alt (null when it has none). */
type Faces = Map<string, string | null>;
function declaredFaces($: CheerioAPI): Faces {
  const faces: Faces = new Map();
  $("style").each((_, block) => {
    for (const [, body] of ($(block).html() ?? "").matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const props = parseInlineStyle(body);
      const family = props.get("font-family");
      const alt = props.get("mso-font-alt")?.replace(/["']/g, "").trim() || null;
      if (family) faces.set(firstFamily(family), alt ?? faces.get(firstFamily(family)) ?? null);
    }
  });
  return faces;
}
const firstFamily = (value: string) => value.split(",")[0].replace(/["']|!important/gi, "").trim().toLowerCase();
const TIMES = "'Times New Roman',serif";

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
 * - a value with `system-ui` in it is dropped whole, so the text falls to
 *   Word's default, Times New Roman (`Inter, system-ui, Arial`).
 */
function wordFamily(value: string, faces: Faces): string | null {
  if (/(^|,)\s*system-ui\s*(,|$)/i.test(value.replace(/!important/gi, ""))) return TIMES;
  const first = firstFamily(value);
  if (!faces.has(first)) return null;
  const alt = faces.get(first);
  if (alt) return `'${alt}'`;
  const rest = value.replace(/!important/gi, "").split(",").slice(1).join(",").trim();
  return rest || TIMES;
}

/** A border that draws: a width other than 0 and a style other than none. */
function hasBorder(props: Map<string, string>): boolean {
  for (const prop of ["border", "border-top", "border-right", "border-bottom", "border-left"]) {
    const value = props.get(prop);
    if (value && !/\b(?:none|hidden)\b/i.test(value) && !/^\s*0(?:px)?\s*$/.test(value)) return true;
  }
  return false;
}

export function applyWordBoxModel($: CheerioAPI): void {
  const faces = declaredFaces($);

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
    const bordered = (tag === "div" || tag === "p") && hasBorder(props);
    if ((tag === "div" || tag === "p" || tag === "span" || tag === "a") && !bordered) {
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

    if (tag === "div") {
      // The margin's lengths are honoured (01 c12), but `auto` does not centre
      // and a negative value does not pull the box up (01 c17, c19, c20).
      for (const prop of MARGIN) {
        const value = props.get(prop);
        if (value !== undefined) props.set(prop, flattenMargin(value));
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

    // `mso-line-height-alt` replaces the line-height, as mso-padding-alt does
    // the padding. A real campaign set `line-height:1.50;
    // mso-line-height-alt:1.5em` on 16px text and Outlook spaced the lines
    // 24px apart, where the unitless value alone gives one normal line.
    const lineAlt = props.get("mso-line-height-alt");
    if (lineAlt !== undefined) props.set("line-height", lineAlt);

    // Without `mso-line-height-rule:exactly`, a line-height is a minimum: the
    // line is never shorter than the font's own height. `line-height:30px` at
    // `font-size:30px` measured 35px, which is 1.15 times the size
    // (02-widths c27). With the rule, 24px and 40px came out exact
    // (04-typography c08, c10).
    const lineHeight = /^([\d.]+)px$/i.exec(props.get("line-height") ?? "");
    const fontSize = /^([\d.]+)px$/i.exec(props.get("font-size") ?? "");
    if (lineHeight && fontSize && !/exactly/i.test(props.get("mso-line-height-rule") ?? "")) {
      const natural = Math.round(Number(fontSize[1]) * NATURAL_LINE);
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
    const numeric = (name: string) => {
      const value = $(el).attr(name);
      if (value !== undefined && !/^\d+$/.test(value.trim())) $(el).removeAttr(name);
      return value !== undefined && /^\d+$/.test(value.trim()) ? value.trim() : undefined;
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
    props.set("width", width ? `${width}px!important` : "auto!important");
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

  // A list has no space above it and one line of space below that
  // `margin:0` does not remove: two 20px items measured 59px with default
  // margins and 58px with `margin:0;padding:0`, on every version
  // (09-follow-ups c16, c17, c19). A `<br>` straight before the list adds a
  // line of its own, where a browser swallows it (c20). The list's box starts
  // 24px in when the email sets no indent (c16).
  $("ul,ol").each((_, node) => {
    const el = node as Element;
    const props = parseInlineStyle($(el).attr("style") || "");
    const margin = (props.get("margin") ?? "").trim().split(/\s+/).filter(Boolean);
    const indented = props.has("margin-left") || props.has("padding-left") || props.has("padding") || margin.length > 0;
    let previous = el.prev;
    while (previous && previous.type === "text" && !previous.data.trim()) previous = previous.prev;
    const afterBreak = previous?.type === "tag" && previous.name === "br";
    props.set("margin-top", afterBreak ? "1lh!important" : "0!important");
    props.set("margin-bottom", `${LIST_TRAILING_PX}px!important`);
    if (!indented) {
      props.set("margin-left", `${LIST_INDENT_PX}px`);
      props.set("padding-left", `${40 - LIST_INDENT_PX}px`);
    }
    $(el).attr("style", serializeStyle(props));
  });

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

  const reset = "<style>p,h2{margin:0}</style>";
  const head = $("head");
  if (head.length) head.prepend(reset);
  else if ($("p,h2").length) $.root().prepend(reset);
}
