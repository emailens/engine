import { parseColor } from "../color-utils";

/**
 * Properties whose "partial" rating is value-level: the property usually
 * renders fine and only specific values hit the caveat. For these the warning
 * is gated on the value actually written, using the per-client caniemail note,
 * instead of flagging every use. Properties not listed keep the plain
 * "partial → warn" behaviour.
 *
 * Adding a property here is a promise to read its notes: the gate is only as
 * honest as the predicate below, and a wrong `false` is a missed rendering bug.
 */
export const VALUE_CAVEAT_PROPS = new Set([
  "background",
  "border-radius",
  "display",
  "font-size",
  "font-weight",
  "letter-spacing",
  "margin",
  "overflow",
  "position",
  "text-align",
  "transition",
]);

/** Lowercase, drop `!important`, collapse whitespace. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/!\s*important\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split on `sep` at paren depth 0, so `rgb(0, 0, 0)` stays one part. */
function topLevelSplit(value: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Space-separated tokens, ignoring spaces inside `rgb(…)` and friends. */
function tokens(value: string): string[] {
  return topLevelSplit(value, " ");
}

/**
 * Does a number in `value` carry one of these units? The digit must directly
 * precede the unit, so `1rem` matches `rem` and not `em`.
 */
function hasUnit(value: string, units: string[]): boolean {
  return new RegExp(`\\d(?:${units.join("|")})\\b`).test(value);
}

/** Bare `<number>` tokens — `700`, not `700px`. */
function bareNumbers(value: string): number[] {
  return tokens(value)
    .filter((t) => /^\d+(?:\.\d+)?$/.test(t))
    .map(Number);
}

function hasNegative(value: string): boolean {
  return /(?:^|[\s,(])-\s*\.?\d/.test(value);
}

/** caniemail writes some multi-word values with a space (`inline flow-root`). */
function dashed(v: string): string {
  return v.replace(/\s+/g, "-");
}

/**
 * The values a note mentions in backticks, split by what the surrounding
 * clause claims about them: "Supports the vendor prefixed value
 * `-webkit-match-parent`" names something that works, everything else in the
 * sentence names something that does not.
 */
function quotedValues(note: string): { supported: string[]; banned: string[] } {
  const supported: string[] = [];
  const banned: string[] = [];
  for (const m of note.matchAll(/`([^`]+)`/g)) {
    const clause = note.slice(0, m.index).split(/[.;]/).pop() ?? "";
    (/\bsupports\b/i.test(clause) ? supported : banned).push(dashed(m[1].toLowerCase().trim()));
  }
  return { supported, banned };
}

/** A `background` value that is only a colour, or resolves to nothing. */
function isColorOnly(value: string): boolean {
  if (parseColor(value)) return true;
  return (
    ["none", "inherit", "initial", "unset", "revert", "currentcolor"].includes(value) ||
    // A custom property is usually a palette colour, and we cannot resolve it.
    value.startsWith("var(")
  );
}

const POSITION_KEYWORDS = ["relative", "absolute", "fixed", "sticky"] as const;

/** `font-size` units that are relative to something else. */
const RELATIVE_FONT_UNITS = ["rem", "em", "ex", "ch", "vw", "vh", "vmin", "vmax"];

const TIMING_KEYWORDS = new Set([
  "ease", "ease-in", "ease-out", "ease-in-out", "linear",
  "step-start", "step-end", "normal", "none", "initial", "inherit",
]);

/** Does one `transition` layer name the property it animates? */
function namesAProperty(layer: string): boolean {
  return tokens(layer).some(
    (t) =>
      t !== "all" &&
      !TIMING_KEYWORDS.has(t) &&
      !/^-?[\d.]+m?s$/.test(t) &&
      !/^-?[\d.]+$/.test(t) &&
      !/^(?:steps|cubic-bezier|linear)\(/.test(t)
  );
}

/**
 * Does this one value trigger this one client's caveat? `value` is normalized;
 * `note` is the client's caniemail note verbatim (backticks intact, since the
 * predicates read them). True = the warning is warranted.
 *
 * Every branch ends in `return true` for a note it does not recognise: a note
 * we cannot read is a caveat we cannot rule out, so it stays reported.
 */
function triggers(prop: string, value: string, note: string, noteLc: string): boolean {
  switch (prop) {
    case "margin": {
      // Negative is unsupported everywhere that's "partial"; `auto` only where
      // the note says so (e.g. Outlook), so don't flag `margin: 0 auto` on Gmail.
      if (hasNegative(value) && noteLc.includes("negative")) return true;
      if (/\bauto\b/.test(value) && noteLc.includes("auto")) return true;
      return false;
    }

    case "position": {
      const used = POSITION_KEYWORDS.find((k) => tokens(value).includes(k));
      if (!used) return false; // e.g. position: static — nothing breaks
      // Note form: "Supports `x` [and `y`] but not `z`[, `w`]." — read the "not" list.
      const m = note.match(/supports\s+.+?\s+but not\s+([^.]+)/i);
      if (m) return m[1].toLowerCase().includes(used);
      // No parseable note (e.g. Superhuman override): fixed/sticky are the usual break.
      return used === "fixed" || used === "sticky";
    }

    case "overflow": {
      // caniemail's "partial" is about the logical `overflow-block`/`overflow-inline`
      // values (separate props people rarely write) plus a "cannot scroll to hidden
      // content" bug on some mobile clients. Physical `overflow: hidden`/`clip`
      // (clipping) renders fine; only scrollable values hit the bug.
      if (!/\b(?:auto|scroll)\b/.test(value)) return false;
      return noteLc.includes("cannot scroll");
    }

    case "font-size": {
      // "`relative` and `percentage` size values not supported" (Outlook 2007-16,
      // Samsung) is the wider of the two notes — check it first.
      if (noteLc.includes("percentage") || noteLc.includes("relative")) {
        return (
          hasUnit(value, RELATIVE_FONT_UNITS) ||
          /\d\s*%/.test(value) ||
          tokens(value).some((t) => t === "smaller" || t === "larger")
        );
      }
      // "`rem` values are not supported" (Outlook 2019+, Yahoo, AOL).
      if (noteLc.includes("`rem`")) return hasUnit(value, ["rem"]);
      return true;
    }

    case "display": {
      // Outlook: "Only supports `display:none`" — anything else is the caveat.
      const only = note.match(/only supports\s+([^.]*)/i);
      if (only) {
        const allowed = quotedValues(only[1])
          .banned.filter((q) => /^(?:display:)?[a-z-]+$/.test(q))
          .map((q) => q.replace(/^display:/, ""));
        return allowed.length > 0 && !allowed.includes(dashed(value));
      }
      // Gmail, Yahoo: an explicit list of values that are dropped.
      const { banned } = quotedValues(note);
      if (banned.length) return banned.includes(dashed(value));
      // Fastmail: "Two-value syntax are combined into a single one with a dash."
      if (noteLc.includes("two-value syntax")) return tokens(value).length > 1;
      return true;
    }

    case "font-weight": {
      const nums = bareNumbers(value);
      if (!nums.length) return false; // `bold`, `normal`, `lighter` render fine
      // Outlook: 0-599 snap to normal, 600-1000 to bold — so 400 and 700 land
      // where they were asked to, and every other number moves.
      if (noteLc.includes("font weight")) return nums.some((n) => n !== 400 && n !== 700);
      // Yahoo, AOL: only the 100…900 steps are honoured.
      if (noteLc.includes("only the following numeric values")) {
        return nums.some((n) => n % 100 !== 0 || n < 100 || n > 900);
      }
      return true;
    }

    case "border-radius": {
      // The only caveat is the elliptical `/` shorthand.
      if (noteLc.includes("slash")) return topLevelSplit(value, "/").length > 1;
      return true;
    }

    case "text-align": {
      const { banned } = quotedValues(note);
      if (!banned.length) return true;
      return tokens(value).some((t) => banned.includes(t));
    }

    case "background": {
      // Outlook: "Only `background-color` values are supported."
      if (noteLc.includes("only `background-color`")) return !isColorOnly(value);
      // Yahoo, AOL: multiple layers lose their comma, and `/ <size>` is dropped.
      if (noteLc.includes("multiple values")) {
        return topLevelSplit(value, ",").length > 1 || topLevelSplit(value, "/").length > 1;
      }
      return true;
    }

    case "letter-spacing": {
      const negative = noteLc.includes("negative");
      const em = noteLc.includes("`em`");
      if (!negative && !em) return true;
      return (negative && hasNegative(value)) || (em && hasUnit(value, ["em"]));
    }

    case "transition": {
      // "The `all` keyword is not supported" — and an omitted property name
      // means `all`, so `transition: 0.3s ease` hits it too.
      if (noteLc.includes("`all`")) {
        return topLevelSplit(value, ",").some((layer) => !namesAProperty(layer));
      }
      // Notes that are not about the value (a global reset, an account type)
      // apply to every transition.
      return true;
    }

    default:
      return true;
  }
}

/**
 * Does any of the values written for `prop` trigger this client's partial-support
 * caveat? Values are per-declaration: a stylesheet setting `position: relative`
 * in one rule and `position: fixed` in another passes both, and the caveat
 * applies if either does.
 *
 * Returns true (report it) for a property that isn't value-gated, and for one
 * where we never saw a value — an at-rule, a pseudo-class, a detected CSS
 * function.
 */
export function caveatApplies(
  prop: string,
  values: readonly string[] | undefined,
  notes: string[] | undefined
): boolean {
  if (!VALUE_CAVEAT_PROPS.has(prop)) return true;
  if (!values?.length) return true;
  const note = (notes ?? []).join(" ");
  const noteLc = note.toLowerCase();
  return values.some((value) => triggers(prop, normalize(value), note, noteLc));
}
