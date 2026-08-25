import type { CheerioAPI } from "cheerio";
import * as csstree from "css-tree";
import { fromHtml, type ParseOptions } from "./parse-html";
import { parseColor, formatRgb, colorDistance } from "./color-utils";
import { splitStyleDeclarations } from "./style-utils";
import type { DesignIssue, DesignReport } from "./types";

/**
 * Two colours closer than this in OKLab are the same colour to a reader.
 *
 * OKLab is built so Euclidean distance tracks perception, and ~0.02 sits just
 * under the point where a side-by-side pair becomes tellable apart. Below it,
 * two different hex values in one email are drift (a colour copied by hand,
 * pasted from a screenshot, or inherited from a second design file), not a
 * decision anyone made.
 */
const SAME_COLOUR_DISTANCE = 0.02;

/** Above these counts, a property has stopped being a system and become noise. */
const LIMITS = {
  fontSize: 8,
  fontFamily: 2,
  radius: 3,
};

/** Values that name no colour of their own. */
const NON_COLOURS = new Set(["transparent", "inherit", "initial", "unset", "currentcolor", "none"]);

/** Properties worth collecting, and the bucket each lands in. */
const TRACKED: Record<string, keyof CollectedValues> = {
  "color": "colors",
  "background-color": "backgrounds",
  "background": "backgrounds",
  "font-size": "fontSizes",
  "font-family": "fontFamilies",
  "border-radius": "radii",
};

interface CollectedValues {
  colors: string[];
  backgrounds: string[];
  fontSizes: string[];
  fontFamilies: string[];
  radii: string[];
}

/**
 * The typeface a font stack is actually asking for.
 *
 * Only the first family counts: `'Inter', -apple-system, sans-serif` and a
 * bare `"Inter"` are the same typeface with different fallbacks, and counting
 * them separately would report a fallback problem as a typography problem.
 * Missing fallbacks are `checkVisual`'s job.
 */
function primaryTypeface(value: string): string {
  return (value.split(",")[0] ?? "").replace(/['"]/g, "").trim().toLowerCase();
}

/**
 * The distinct corner sizes a `border-radius` value uses.
 *
 * A shorthand is a shape, not a size: `12px 12px 0 0` and `0 0 12px 12px` are
 * one 12px system used on a card top and its footer. Counting shorthands
 * instead of lengths reports a consistent design as drift.
 *
 * Fully round values (`50%`, pill radii) are dropped: a circular avatar or a
 * pill button is a deliberate shape, not a fourth corner size.
 */
function radiusLengths(value: string): string[] {
  const lengths = value.trim().toLowerCase().split(/[\s/]+/).filter(Boolean);
  return lengths.filter((v) => {
    if (/^0(?:px|rem|em|%)?$/.test(v)) return false;
    if (v === "50%") return false;
    const px = parseFloat(v);
    return !(v.endsWith("px") && Number.isFinite(px) && px >= 500);
  });
}

/** Collect every declared value for the tracked properties. */
function collect($: CheerioAPI): CollectedValues {
  const found: CollectedValues = {
    colors: [],
    backgrounds: [],
    fontSizes: [],
    fontFamilies: [],
    radii: [],
  };

  const record = (prop: string, rawValue: string) => {
    const bucket = TRACKED[prop.toLowerCase()];
    if (!bucket) return;
    const value = rawValue.trim();
    if (!value) return;
    found[bucket].push(value);
  };

  $("[style]").each((_, el) => {
    for (const part of splitStyleDeclarations($(el).attr("style") || "")) {
      const colon = part.indexOf(":");
      if (colon === -1) continue;
      record(part.slice(0, colon), part.slice(colon + 1));
    }
  });

  // Every rule counts, media blocks included: a breakpoint that introduces a
  // ninth font size is exactly the kind of drift this looks for.
  $("style").each((_, el) => {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse($(el).text());
    } catch {
      return;
    }
    csstree.walk(ast, {
      visit: "Declaration",
      enter(node: csstree.CssNode) {
        if (node.type !== "Declaration") return;
        record(node.property, csstree.generate(node.value));
      },
    });
  });

  return found;
}

/**
 * Group colour values that render as the same colour.
 *
 * Values are normalised first, so `#fff`, `#FFFFFF` and `white` collapse into
 * one entry rather than being reported as drift against each other.
 */
function driftClusters(values: string[]): string[][] {
  const byNormalised = new Map<string, { spellings: Set<string>; rgb: ReturnType<typeof parseColor> }>();

  for (const raw of values) {
    const value = raw.trim();
    if (NON_COLOURS.has(value.toLowerCase())) continue;
    const rgb = parseColor(value);
    if (!rgb || rgb.a === 0) continue;
    const key = formatRgb({ ...rgb, a: 1 });
    const entry = byNormalised.get(key);
    if (entry) entry.spellings.add(value);
    else byNormalised.set(key, { spellings: new Set([value]), rgb });
  }

  const distinct = [...byNormalised.entries()];
  const clusters: string[][] = [];
  const claimed = new Set<string>();

  for (let i = 0; i < distinct.length; i++) {
    const [keyA, a] = distinct[i];
    if (claimed.has(keyA)) continue;
    const cluster = [keyA];
    for (let j = i + 1; j < distinct.length; j++) {
      const [keyB, b] = distinct[j];
      if (claimed.has(keyB)) continue;
      if (!a.rgb || !b.rgb) continue;
      if (colorDistance(a.rgb, b.rgb) < SAME_COLOUR_DISTANCE) {
        cluster.push(keyB);
        claimed.add(keyB);
      }
    }
    claimed.add(keyA);
    if (cluster.length > 1) clusters.push(cluster);
  }

  return clusters;
}

/** Distinct normalised values, preserving first-seen order. */
function distinctValues(values: string[], normalise: (v: string) => string): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const key = normalise(raw);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, raw.trim());
  }
  return [...seen.values()];
}

/**
 * Report design drift: the small inconsistencies that make an email look
 * assembled rather than designed.
 *
 * This is deliberately not a taste check. Every rule here is countable, so it
 * fires on facts about the CSS rather than on an opinion about the layout:
 * near-identical colours that were meant to be one colour, and properties with
 * so many distinct values that no system is left.
 *
 * ponytail: counts declared values without resolving the cascade. A value that
 * never wins still had to be written and maintained, so for a drift report it
 * counts either way; that also keeps this independent of which render is being
 * looked at.
 */
export function checkDesignConsistencyFromDom($: CheerioAPI): DesignReport {
  const found = collect($);
  const issues: DesignIssue[] = [];

  const colors = distinctValues(found.colors, (v) => {
    const c = parseColor(v.trim());
    return c ? formatRgb({ ...c, a: 1 }) : "";
  });
  const backgrounds = distinctValues(found.backgrounds, (v) => {
    const c = parseColor(v.trim());
    return c ? formatRgb({ ...c, a: 1 }) : "";
  });
  const fontSizes = distinctValues(found.fontSizes, (v) => v.trim().toLowerCase());
  const fontFamilies = distinctValues(found.fontFamilies, primaryTypeface);
  const radii = distinctValues(found.radii.flatMap(radiusLengths), (v) => v);

  // 1. Colours that are the same colour, spelled differently.
  for (const cluster of driftClusters([...found.colors, ...found.backgrounds])) {
    issues.push({
      rule: "colour-drift",
      severity: "info",
      message: `${cluster.length} near-identical colours are used where one was probably meant: ${cluster.join(", ")}.`,
      detail:
        "These render as the same colour to a reader, so the difference is drift rather than a choice. Pick one and use it everywhere.",
      values: cluster,
    });
  }

  // 2. Properties with no system left.
  const overflowing: Array<[string, string[], number, string]> = [
    ["font sizes", fontSizes, LIMITS.fontSize, "Settle on a type scale and reuse it; every extra size is one more thing to keep in step."],
    ["typefaces", fontFamilies, LIMITS.fontFamily, "Email clients strip most web fonts anyway, so each extra typeface mostly adds fallback risk."],
    ["corner radii", radii, LIMITS.radius, "Corner rounding reads as a single decision; several close values look like an accident."],
  ];

  for (const [label, values, limit, detail] of overflowing) {
    if (values.length <= limit) continue;
    issues.push({
      rule: "too-many-values",
      severity: "info",
      message: `${values.length} distinct ${label} in one email: ${values.slice(0, 10).join(", ")}${values.length > 10 ? ", …" : ""}.`,
      detail,
      values,
    });
  }

  return {
    issues,
    palette: { colors, backgrounds, fontSizes, fontFamilies, radii },
  };
}

/**
 * Report design drift in an HTML email: near-identical colours, and properties
 * carrying more distinct values than a design system would.
 */
export function checkDesignConsistency(html: string, options?: ParseOptions): DesignReport {
  return fromHtml(
    html,
    { issues: [], palette: { colors: [], backgrounds: [], fontSizes: [], fontFamilies: [], radii: [] } },
    checkDesignConsistencyFromDom,
    options,
  );
}
