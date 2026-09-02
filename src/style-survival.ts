import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import { EMPTY_STYLE_SURVIVAL } from "./constants";
import { fromHtml, type ParseOptions } from "./parse-html";
import { cssBlockAnchor, locInCssBlock, locOfElement } from "./source-location";
import type { ClientId } from "./rules/css-support";
import type { SourceLocation, StyleSurvivalIssue, StyleSurvivalReport } from "./types";

/**
 * Will the client keep your CSS at all?
 *
 * The support matrix answers "does this client implement this property". These
 * rules answer a different question, and one the matrix cannot express: several
 * clients discard CSS they parse perfectly well, because of where a semicolon
 * sits or how two braces touch. Every rule here is a silent failure, so the
 * author has no way to notice without opening the mail in that client.
 *
 * Sources are hteumeuleu/email-bugs, the catalogue kept by the person who also
 * maintains caniemail. Each rule cites its issue, and each was read before it
 * was written: three of them do not behave the way the summaries say.
 *
 * Everything here is decidable from the source text. Nothing needs rendering,
 * intrinsic image sizes or a screen reader; a rule that would have needed one
 * is absent rather than guessed at.
 */

/** Outlook 2007-2021 and the Office desktop builds: the Word engine. */
const WORD_ENGINE: ClientId[] = ["outlook-windows-legacy"];
/** Outlook.com and the New Outlook that shares its renderer. */
const OUTLOOK_WEB: ClientId[] = ["outlook-web", "outlook-windows"];
const OUTLOOK_WEB_AND_MOBILE: ClientId[] = [
  "outlook-web", "outlook-windows", "outlook-ios", "outlook-android",
];
const GMAIL: ClientId[] = ["gmail-web", "gmail-android", "gmail-ios"];
const YAHOO_AOL: ClientId[] = [
  "yahoo-mail", "yahoo-mail-android", "yahoo-mail-ios", "aol",
];

/** How many locations one issue carries before it stops listing them. */
const MAX_LOCS = 20;

/**
 * A colour function written in the space-separated form: `rgb(0 0 0)` rather
 * than `rgb(0, 0, 0)`. Scans to the matching paren so a nested `calc()` or a
 * `/ 50%` alpha does not end the match early.
 */
function hasSpaceSeparatedColor(css: string): boolean {
  const fn = /\b(?:rgba?|hsla?)\(/gi;
  let m: RegExpExecArray | null;
  while ((m = fn.exec(css))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let comma = false;
    let i = start;
    for (; i < css.length && depth > 0; i++) {
      const c = css[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 1) comma = true;
    }
    if (depth > 0) continue; // unterminated: malformed CSS, a different problem
    const args = css.slice(start, i - 1);
    // The signature is two values separated by whitespace and no comma between
    // them. Requiring the separator keeps `rgb()` and `rgb(0)` out: they are
    // invalid rather than modern, and reporting them would put this rule's name
    // on a problem it is not about.
    if (!comma && /\S\s+\S/.test(args)) return true;
  }
  return false;
}

/** An attribute selector whose value contains a semicolon: `[style="a; b"]`. */
const ATTR_SELECTOR_SEMICOLON = /\[[^\]]*;[^\]]*\]/;

/**
 * Two closing braces with nothing at all between them. The fix in the issue is
 * to insert any character, so whitespace between them is exactly what makes it
 * safe; matching "braces with optional whitespace" would report the fix as the
 * bug.
 */
const DOUBLE_BRACE = /\}\}/;

/** Collect the selector text of every rule, and the declarations it sets. */
interface Sheet {
  /** Class name → the properties any `.class` rule declares for it. */
  propsByClass: Map<string, Set<string>>;
  /** Classes that head a descendant selector, e.g. `.text td`. */
  classesWithDescendants: Set<string>;
  /** Selectors pairing two or more classes in one compound: `.a.b`. */
  chainedClassSelectors: string[];
}

function readSheet(ast: csstree.CssNode): Sheet {
  const propsByClass = new Map<string, Set<string>>();
  const classesWithDescendants = new Set<string>();
  const chainedClassSelectors: string[] = [];

  csstree.walk(ast, {
    visit: "Rule",
    enter(rule: csstree.CssNode) {
      if (rule.type !== "Rule" || rule.prelude.type !== "SelectorList") return;
      const props = new Set<string>();
      csstree.walk(rule.block, {
        visit: "Declaration",
        enter(d: csstree.CssNode) {
          if (d.type === "Declaration") props.add(d.property.toLowerCase());
        },
      });

      for (const selector of rule.prelude.children) {
        if (selector.type !== "Selector") continue;
        const parts = selector.children.toArray();
        const classes = parts.filter((p) => p.type === "ClassSelector");
        if (!classes.length) continue;

        // A compound of two or more class or id selectors: `.a.b`, `.a#b`.
        // Outlook.com namespaces both classes and ids, and only the first of
        // them, so everything after it stops matching.
        let run = 0;
        for (const part of parts) {
          if (part.type === "ClassSelector" || part.type === "IdSelector") {
            run++;
            if (run === 2) {
              chainedClassSelectors.push(csstree.generate(selector));
              break;
            }
          } else if (part.type !== "PseudoClassSelector" && part.type !== "PseudoElementSelector") {
            run = 0;
          }
        }

        const hasCombinator = parts.some(
          (p) => p.type === "Combinator" || p.type === "WhiteSpace",
        );
        if (hasCombinator) {
          const head = parts[0];
          if (head?.type === "ClassSelector") classesWithDescendants.add(head.name);
          continue;
        }

        // A lone `.class` rule: record what it sets, for the first-class check.
        if (parts.length === classes.length && classes.length === 1) {
          const name = (classes[0] as csstree.ClassSelector).name;
          const seen = propsByClass.get(name) ?? new Set<string>();
          for (const p of props) seen.add(p);
          propsByClass.set(name, seen);
        }
      }
    },
  });

  return { propsByClass, classesWithDescendants, chainedClassSelectors };
}

/**
 * Check whether the target clients will keep this email's CSS.
 *
 * @internal Used by the audit pipeline with a pre-parsed DOM.
 */
export function checkStyleSurvivalFromDom(
  $: cheerio.CheerioAPI,
  source?: string,
): StyleSurvivalReport {
  const issues: StyleSurvivalIssue[] = [];
  const add = (
    rule: string,
    severity: "error" | "warning",
    clients: ClientId[],
    message: string,
    locs: SourceLocation[],
    detail?: string,
  ) => {
    issues.push({
      rule,
      severity,
      clients: [...clients],
      message,
      ...(detail ? { detail } : {}),
      ...(locs.length ? { loc: locs[0], locs: locs.slice(0, MAX_LOCS) } : {}),
      ...(locs.length > MAX_LOCS ? { locsTruncated: true } : {}),
    });
  };

  const sheets: Sheet[] = [];
  /**
   * Whether a rule fired is counted separately from where it fired. Positions
   * only exist when the caller asked for them, so keying "did this fire" off
   * the location list would leave every rule here silent by default.
   */
  const hits = { spaceColor: 0, doubleBrace: 0, attrSemicolon: 0, chained: 0 };
  const spaceColorLocs: SourceLocation[] = [];
  const doubleBraceLocs: SourceLocation[] = [];
  const attrSemicolonLocs: SourceLocation[] = [];
  const chainedLocs: SourceLocation[] = [];
  let chainedExample = "";

  $("style").each((_, el) => {
    const cssText = $(el).text();
    if (!cssText.trim()) return;
    const anchor = cssBlockAnchor(el, cssText, source);
    const at = (index: number): SourceLocation | undefined => {
      const before = cssText.slice(0, index);
      const line = before.split("\n").length;
      const column = index - before.lastIndexOf("\n");
      return locInCssBlock(anchor, {
        start: { line, column, offset: index },
        end: { line, column: column + 1, offset: index + 1 },
      } as csstree.CssLocation);
    };
    const push = (into: SourceLocation[], index: number) => {
      const loc = at(index) ?? locOfElement(el);
      if (loc) into.push(loc);
    };

    if (hasSpaceSeparatedColor(cssText)) {
      hits.spaceColor++;
      push(spaceColorLocs, cssText.search(/\b(?:rgba?|hsla?)\(/i));
    }
    const brace = cssText.search(DOUBLE_BRACE);
    if (brace >= 0) {
      hits.doubleBrace++;
      push(doubleBraceLocs, brace);
    }
    const attr = cssText.search(ATTR_SELECTOR_SEMICOLON);
    if (attr >= 0) {
      hits.attrSemicolon++;
      push(attrSemicolonLocs, attr);
    }

    try {
      const sheet = readSheet(csstree.parse(cssText, { positions: true }));
      sheets.push(sheet);
      if (sheet.chainedClassSelectors.length) {
        hits.chained++;
        chainedExample ||= sheet.chainedClassSelectors[0];
        push(chainedLocs, 0);
      }
    } catch {
      // Unparseable CSS: the text-level rules above already ran on it, and a
      // sheet no parser accepts is a different problem from this one.
    }
  });

  // ── Gmail: the space-separated colour syntax (email-bugs#160) ─────────────
  // In a `<style>` block the whole block goes; in a `style` attribute every
  // declaration on that element goes. Not just the colour.
  const inlineColorEls = $("[style]")
    .toArray()
    .filter((el) => hasSpaceSeparatedColor($(el).attr("style") ?? ""));
  if (hits.spaceColor) {
    add(
      "gmail-space-separated-color",
      "error",
      GMAIL,
      "Gmail removes an entire <style> block containing a space-separated colour " +
        "like `rgb(0 0 0)`. Write it with commas, `rgb(0, 0, 0)`, and the block survives.",
      spaceColorLocs,
    );
  }
  if (inlineColorEls.length) {
    add(
      "gmail-space-separated-color-inline",
      "error",
      GMAIL,
      `Gmail drops every declaration in a style attribute that uses a space-separated ` +
        `colour like \`rgb(0 0 0)\`, not only the colour. ${inlineColorEls.length} element` +
        `${inlineColorEls.length > 1 ? "s are" : " is"} affected; write the colour with commas.`,
      inlineColorEls.map((el) => locOfElement(el)).filter((l): l is SourceLocation => !!l),
    );
  }

  // ── Outlook.com and Outlook mobile: `}}` (email-bugs#92) ──────────────────
  if (hits.doubleBrace) {
    add(
      "outlook-double-brace",
      "error",
      OUTLOOK_WEB_AND_MOBILE,
      "Outlook.com and Outlook on iOS/Android discard every style rule after `}}`. " +
        "Minified CSS closing a media query produces it. Put a space or newline " +
        "between the two braces and the rest of the sheet survives.",
      doubleBraceLocs,
    );
  }

  // ── Yahoo and AOL: attribute selector holding a semicolon (#74) ───────────
  if (hits.attrSemicolon) {
    add(
      "yahoo-attribute-selector-semicolon",
      "error",
      YAHOO_AOL,
      "Yahoo and AOL discard every style rule after an attribute selector whose " +
        'value contains a semicolon, such as `div[style="margin: 16px;"]`. Split it ' +
        "into `[style^=…][style$=…]` and the rest of the sheet survives.",
      attrSemicolonLocs,
    );
  }

  // ── Outlook.com: only the first class in a chain is namespaced (#61) ──────
  if (hits.chained) {
    add(
      "outlook-web-chained-class",
      "warning",
      OUTLOOK_WEB,
      `Outlook.com rewrites class names to namespace them and only rewrites the ` +
        `first in a compound selector, so \`${chainedExample}\` stops matching. ` +
        `Give the element one class that carries both rules.`,
      chainedLocs,
    );
  }

  // ── The Word engine: first class only (email-bugs#75) ─────────────────────
  const conflicting: SourceLocation[] = [];
  const shadowed: SourceLocation[] = [];
  let conflictCount = 0;
  let shadowCount = 0;
  let conflictExample = "";
  $("[class]").each((_, el) => {
    const names = ($(el).attr("class") ?? "").split(/\s+/).filter(Boolean);
    if (names.length < 2) return;
    const loc = locOfElement(el);

    // Same property set by more than one of this element's classes: the Word
    // engine keeps the first class and the rest never apply.
    const seen = new Map<string, string>();
    for (const sheet of sheets) {
      for (const name of names) {
        for (const prop of sheet.propsByClass.get(name) ?? []) {
          const first = seen.get(prop);
          if (first && first !== name) {
            conflictExample ||= `.${first} and .${name} both set ${prop}`;
            conflictCount++;
            if (loc) conflicting.push(loc);
            return;
          }
          if (!first) seen.set(prop, name);
        }
      }
      // A descendant rule rooted at one of these classes is ignored outright
      // once the element carries a second class.
      if (names.some((n) => sheet.classesWithDescendants.has(n))) {
        shadowCount++;
        if (loc) shadowed.push(loc);
        return;
      }
    }
  });

  if (conflictCount) {
    add(
      "outlook-first-class-only",
      "warning",
      WORD_ENGINE,
      `Outlook on Windows applies only the first class on an element, so a second ` +
        `class setting the same property never takes effect (${conflictExample}). ` +
        `Merge them into one class.`,
      conflicting,
    );
  }
  if (shadowCount) {
    add(
      "outlook-first-class-descendants",
      "warning",
      WORD_ENGINE,
      "Outlook on Windows ignores a descendant rule like `.text td` once the " +
        "element carries a second class. Move the rule onto the child, or give " +
        "the element a single class.",
      shadowed,
    );
  }

  return { issues };
}

/**
 * Check whether the target clients will keep this email's CSS.
 *
 * These are not support questions. Each rule is a client discarding CSS it
 * parsed correctly, with no error anywhere the author can see.
 */
export function checkStyleSurvival(
  html: string,
  options?: ParseOptions,
): StyleSurvivalReport {
  return fromHtml(
    html,
    EMPTY_STYLE_SURVIVAL,
    ($) => checkStyleSurvivalFromDom($, options?.positions ? html : undefined),
    options,
  );
}
