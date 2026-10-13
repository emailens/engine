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

/** True when the element has no text of its own, only other elements. */
function holdsNoText($: CheerioAPI, el: Element): boolean {
  return $(el)
    .contents()
    .toArray()
    .every((node) => node.type !== "text" || !node.data.replace(/ /g, " ").trim());
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
function overrideStylesheetRules($: CheerioAPI): void {
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
      if (!hasPadding && !hasSize && !hasBackground) continue;
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

export function applyWordBoxModel($: CheerioAPI): void {

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

  // A paragraph and an h2 have no default margin: with none declared, each sat
  // flush against its container where a browser adds about a line of space
  // (01 c14, c15). Prepended, and without !important, so anything the email
  // declares itself still wins. Other headings were not measured.
  // After the inline pass, which would otherwise delete the overrides it adds.
  overrideStylesheetRules($);

  const reset = "<style>p,h2{margin:0}</style>";
  const head = $("head");
  if (head.length) head.prepend(reset);
  else if ($("p,h2").length) $.root().prepend(reset);
}
