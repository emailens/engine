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

/** Selector forms Word was measured to ignore (probe sheet 07-style-delivery, c04, c06-c09, c11, c14). */
const IGNORED_BY_WORD = /\[|>|:first-child|:nth-child|:not\(|::?before|\.[\w-]+\.[\w-]/;

/**
 * Carry the element rules over to declarations that arrive through a class.
 * Adds an inline `!important` override to each matched element where Word
 * would not have honoured the property.
 */
function overrideStylesheetRules($: CheerioAPI, faces: Set<string>): void {
  const override = (el: Element, declarations: string) => {
    const style = $(el).attr("style") ?? "";
    const sep = style.trim() === "" || /;\s*$/.test(style) ? "" : ";";
    $(el).attr("style", `${style}${sep}${declarations}`);
  };
  $("style").each((_, block) => {
    for (const { selector, body } of topLevelRules($(block).html() ?? "")) {
      const props = parseInlineStyle(body.replace(/!important/gi, ""));
      const hasPadding = PADDING.some((prop) => props.has(prop));
      const hasSize = props.has("width") || props.has("height");
      const hasBackground = props.has("background") || props.has("background-color");
      const timesFamily = faces.has(firstFamily(props.get("font-family") ?? ""));
      const hides = props.get("display") === "none";
      if (!hasPadding && !hasSize && !hasBackground && !timesFamily && !hides) continue;
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
          // An inline family is the more specific one and was handled above.
          if (timesFamily && !/font-family/i.test($(el).attr("style") ?? ""))
            override(el, `font-family:${TIMES}!important`);
          // `display:none` from a class does not reach a table inside a div:
          // the table was drawn at full size (07-style-delivery c19), the same
          // escape as under an inline mso-hide. The div's other children stay
          // hidden. ponytail: bare text directly in the div would show; wrap
          // it the way releaseNestedTables does if that turns up.
          if (hides && tag === "div" && $(el).find("table").length) {
            override(el, "display:block!important");
            for (const child of $(el).children().toArray()) {
              if ((child as Element).tagName?.toLowerCase() !== "table") override(child as Element, "display:none!important");
            }
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
 * (07-style-delivery c13).
 */
const UNKNOWN_TO_WORD = /(?:^|;)\s*[\w-]+\s*:[^;]*(?:\brgba\(|\bhsla?\(|\bvar\(|#[0-9a-f]{8}(?![0-9a-f]))[^;]*/gi;
const dropUnknown = (declarations: string) => declarations.replace(UNKNOWN_TO_WORD, "");

/**
 * Remove those declarations from style attributes and <style> blocks. Runs on
 * the source string, before the downlevel pass converts the notations into
 * `rgb()`, which Word does read. Returns the input itself when nothing matches.
 */
export function dropWordUnknownColors(html: string): string {
  if (!/rgba\(|hsla?\(|var\(|#[0-9a-f]{8}/i.test(html)) return html;
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

/** Families the email declares with @font-face. */
function declaredFaces($: CheerioAPI): Set<string> {
  const faces = new Set<string>();
  $("style").each((_, block) => {
    for (const [, body] of ($(block).html() ?? "").matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const family = parseInlineStyle(body).get("font-family");
      if (family) faces.add(firstFamily(family));
    }
  });
  return faces;
}
const firstFamily = (value: string) => value.split(",")[0].replace(/["']|!important/gi, "").trim().toLowerCase();
const TIMES = "'Times New Roman',serif";

export function applyWordBoxModel($: CheerioAPI): void {
  const faces = declaredFaces($);

  $("[style]").each((_, node) => {
    const el = node as Element;
    const tag = el.tagName?.toLowerCase();
    const props = parseInlineStyle($(el).attr("style") || "");
    const before = serializeStyle(props);

    // Padding is honoured on table cells and nowhere else that was tried:
    // div, p, span and a all rendered as if it were absent (01 c01-c08, c26-c28).
    if (tag === "div" || tag === "p" || tag === "span" || tag === "a") {
      for (const prop of PADDING) props.delete(prop);
    }

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

    // A family declared with @font-face cannot be loaded, and Word then skips
    // the rest of the stack and draws Times New Roman. Measured on a real
    // campaign: `'Roboto', Arial, sans-serif` with a Roboto @font-face came
    // out in Times on Outlook 2007, 2010, 2013 and 2016, while `'Nunito',
    // Arial, sans-serif`, with no @font-face, fell back to Arial as written.
    // Outlook 2019 did not do this: it used the next family in the stack. One
    // simulated client stands for all five, and it shows the majority, which
    // is also the outcome an author most needs to see.
    const family = props.get("font-family");
    if (family !== undefined && faces.has(firstFamily(family))) props.set("font-family", TIMES);

    if (tag === "img") {
      // An image is as wide as its width attribute says. A percentage width
      // in CSS is not read: `width="138"` with `width:100%` drew at 138px in
      // a 420px column on a real campaign.
      const attr = $(el).attr("width");
      if (attr && /^\d+$/.test(attr) && /%/.test(props.get("width") ?? "")) props.set("width", `${attr}px`);
    }

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
    const after = serializeStyle(props);
    if (after !== before) table.attr("style", after);
  });

  // A paragraph and an h2 have no default margin: with none declared, each sat
  // flush against its container where a browser adds about a line of space
  // (01 c14, c15). Prepended, and without !important, so anything the email
  // declares itself still wins. Other headings were not measured.
  // After the inline pass, which would otherwise delete the overrides it adds.
  overrideStylesheetRules($, faces);

  const reset = "<style>p,h2{margin:0}</style>";
  const head = $("head");
  if (head.length) head.prepend(reset);
  else if ($("p,h2").length) $.root().prepend(reset);
}
