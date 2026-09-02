#!/usr/bin/env bun
/**
 * sync-caniemail.ts: Fetches CSS/HTML feature support data from caniemail.com
 * and generates src/rules/css-support.ts with 150+ properties.
 *
 * The API is the built output of github.com/hteumeuleu/caniemail (its
 * `_features/*.md` front matter); consuming the build rather than the markdown
 * keeps us off their Jekyll pipeline for identical data.
 *
 * Usage: bun run scripts/sync-caniemail.ts
 */

import { SUPERHUMAN_OVERRIDES, SUPERHUMAN_NOTES } from "./superhuman-overrides";
import {
  GMAIL_STRIPPED_PROPERTIES,
  GRACEFUL_FEATURES,
  OUTLOOK_WORD_UNSUPPORTED,
  STRUCTURAL_FIX_PROPERTIES,
} from "./manual-sets";

const API_URL = "https://www.caniemail.com/api/data.json";

// ── Client mapping ──────────────────────────────────────────────────────────

/**
 * Map caniemail client.platform → engine client ID.
 *
 * Several platforms may point at one engine client: caniemail tracks Proton
 * Mail's web, Android and iOS apps separately while we ship a single "Proton
 * Mail". Those cells merge worst-wins (see `mergeSupport`), because a client
 * named for the whole product has to be right about its worst surface.
 *
 * `gmail.mobile-webmail` is deliberately absent. Merging it into `gmail-web`
 * would make our flagship client pessimistic about desktop Gmail in 36
 * features, and `gmail-android`/`gmail-ios` already cover the phone.
 *
 * The regional providers caniemail also tests (GMX, WEB.DE, Mail.ru, Orange,
 * La Poste, SFR, IONOS, and four thinner ones) are absent for a different
 * reason: the client roster is a product decision, not a data one, and this
 * engine ships the 21 clients emailens markets. Adding one is this map plus an
 * entry in `src/clients.ts`; the type system will not let you do only half.
 */
const CLIENT_MAP: Record<string, string> = {
  "apple-mail.macos": "apple-mail-macos",
  "apple-mail.ios": "apple-mail-ios",
  "gmail.desktop-webmail": "gmail-web",
  "gmail.android": "gmail-android",
  "gmail.ios": "gmail-ios",
  "outlook.outlook-com": "outlook-web",
  "outlook.windows": "outlook-windows",
  "yahoo.desktop-webmail": "yahoo-mail",
  "outlook.windows-mail": "outlook-windows-legacy",
  "outlook.ios": "outlook-ios",
  "outlook.android": "outlook-android",
  "outlook.macos": "outlook-macos",
  "samsung-email.android": "samsung-mail",
  "thunderbird.macos": "thunderbird",
  "thunderbird.windows": "thunderbird",
  "hey.desktop-webmail": "hey-mail",
  "yahoo.android": "yahoo-mail-android",
  "yahoo.ios": "yahoo-mail-ios",
  "protonmail.desktop-webmail": "protonmail",
  "protonmail.android": "protonmail",
  "protonmail.ios": "protonmail",
  "aol.desktop-webmail": "aol",
  "aol.android": "aol",
  "aol.ios": "aol",
  "fastmail.desktop-webmail": "fastmail",
  // superhuman is manually provided
};

const ALL_ENGINE_CLIENTS = [
  "gmail-web", "gmail-android", "gmail-ios",
  "outlook-web", "outlook-windows", "outlook-windows-legacy", "outlook-ios", "outlook-android", "outlook-macos",
  "apple-mail-macos", "apple-mail-ios",
  "yahoo-mail", "yahoo-mail-android", "yahoo-mail-ios", "samsung-mail", "thunderbird",
  "hey-mail", "protonmail", "aol", "fastmail", "superhuman",
];

type SupportLevel = "supported" | "partial" | "unsupported" | "unknown";

/** Ranks the levels that can be compared. "unknown" is deliberately absent. */
const SUPPORT_RANK: Record<Exclude<SupportLevel, "unknown">, number> = {
  unsupported: 0,
  partial: 1,
  supported: 2,
};

/**
 * Fold two answers about the same engine client into one. Real data always
 * beats "unknown"; between two real answers the worse one wins, so a client
 * that covers three apps is graded on the app that breaks.
 *
 * Used both for the platforms of one client and for two features that share a
 * key. Commutative and associative, so neither the API's platform order nor
 * its feature order can change the result.
 */
function mergeSupport(a: SupportLevel | undefined, b: SupportLevel): SupportLevel {
  // "unknown" is the identity, not the best answer: giving it a rank would make
  // an untested platform outrank a working one, which is the opposite of the
  // rule this function exists to apply. The type refuses to rank it.
  if (a === undefined || a === "unknown") return b;
  if (b === "unknown") return a;
  return SUPPORT_RANK[b] < SUPPORT_RANK[a] ? b : a;
}

// ── caniemail API types ─────────────────────────────────────────────────────

interface CanIEmailFeature {
  slug: string;
  title: string;
  description: string;
  url: string;
  category: string;
  tags: string[];
  keywords: string;
  last_test_date: string;
  test_url: string | null;
  test_results_url: string | null;
  stats: Record<string, Record<string, Record<string, string>>>;
  notes: string | null;
  notes_by_num: Record<string, string> | null;
}

interface CanIEmailData {
  api_version: string;
  last_update_date: string;
  nicenames: Record<string, unknown>;
  data: CanIEmailFeature[];
}

// ── Support code mapping ────────────────────────────────────────────────────

function mapSupportCode(code: string): SupportLevel {
  // Strip note references like "#1", "#2"
  const base = code.replace(/#\d+/g, "").trim().toLowerCase();
  if (base === "y") return "supported";
  if (base === "a") return "partial";
  if (base === "n") return "unsupported";
  if (base === "u") return "unknown";
  return "unknown";
}

/**
 * Get the latest version's support level from a version map.
 * Takes the last entry (chronologically latest) from the version object.
 */
function getLatestSupport(versions: Record<string, string>): SupportLevel {
  const entries = Object.entries(versions);
  if (entries.length === 0) return "unknown";
  // Sort by key (numeric-aware) to ensure we pick the latest version
  entries.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const [, code] = entries[entries.length - 1];
  return mapSupportCode(code);
}

/**
 * Resolve the caveat note(s) attached to the latest version's support code.
 * caniemail encodes the "why" behind partial/buggy/unsupported ratings as
 * `#N` references (e.g. "a #1") into the feature's notes_by_num map. We keep
 * these so warnings can cite the specific caveat instead of a generic
 * "partial support" message.
 */
function getLatestNotes(
  versions: Record<string, string>,
  notesByNum: Record<string, string> | null,
): string[] {
  if (!notesByNum) return [];
  const entries = Object.entries(versions);
  if (entries.length === 0) return [];
  entries.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const [, code] = entries[entries.length - 1];
  const refs = [...code.matchAll(/#(\d+)/g)].map((mm) => mm[1]);
  return refs.map((r) => notesByNum[r]).filter((t): t is string => Boolean(t));
}

// ── Property key normalization ──────────────────────────────────────────────

/**
 * What kind of thing a feature is, which decides both the table it lands in
 * and the detector analyze.ts runs for it. Derived here rather than guessed
 * from the key's shape downstream.
 */
type FeatureKind =
  | "css-property"
  | "css-function"
  | "compound-value"
  | "selector"
  | "at-rule"
  | "html-element"
  | "html-attribute"
  | "html-misc"
  | "image";

/**
 * CSS functions we detect by name. A function is a value, not a property, and
 * the analyzer looks for `name(` rather than a declaration called `name`.
 */
const CSS_FUNCTION_NAMES = new Set([
  "linear-gradient", "radial-gradient", "conic-gradient", "image-set",
  "calc", "min", "max", "clamp", "var", "env", "fit-content",
  "minmax", "repeat",
]);

/**
 * Features caniemail grades as one thing that our element and attribute lanes
 * cannot express: document-level (doctype, comments, AMP), link-shaped
 * (anchors, mailto), or a whole family at once (HTML5 semantics). Each needs
 * its own detector.
 */
const HTML_MISC_SLUGS = new Set([
  "amp",
  "html-anchor-links",
  "html-comments",
  "html-doctype",
  "html-image-maps",
  "html-mailto-links",
  "html-meta-color-scheme",
  "html-semantics",
]);

/**
 * Explicit slug → property key overrides for caniemail features
 * whose titles don't match our expected property key format.
 */
const SLUG_TO_KEY: Record<string, string> = {
  "css-display-flex": "display:flex",
  "css-display-grid": "display:grid",
  "css-display-none": "display:none",
  "css-height": "height",
  "css-width": "width",
  "css-gap": "gap",
  "css-font": "font",
  "css-flex-direction": "flex-direction",
  "css-flex-wrap": "flex-wrap",
  "css-inline-size": "inline-size",
  "css-block-inline-size": "block-size",
  "css-intrinsic-size": "fit-content",
  "css-grid-template": "grid-template-columns",
  "css-unit-calc": "calc",
  "css-function-clamp": "clamp",
  "css-function-min": "min",
  "css-function-max": "max",
  "css-function-light-dark": "light-dark",
  "css-linear-gradient": "linear-gradient",
  "css-radial-gradient": "radial-gradient",
  "css-conic-gradient": "conic-gradient",
  "css-sytem-ui": "system-ui",
  "css-variables": "custom-properties",
  "css-color-scheme": "color-scheme",
  "css-word-wrap": "overflow-wrap",
  "css-column-layout-properties": "columns",
  // Media features. All six caniemail `@media` titles reduce to `@media`, so
  // without these five keys the one row would answer for all of them, and a
  // query asking about width would be graded on prefers-color-scheme support.
  "css-at-media-device-pixel-ratio": "@media device-pixel-ratio",
  "css-at-media-hover": "@media hover",
  "css-at-media-orientation": "@media orientation",
  "css-at-media-prefers-color-scheme": "@media prefers-color-scheme",
  "css-at-media-prefers-reduced-motion": "@media prefers-reduced-motion",
  "css-selector-adjacent-sibling": ":adjacent-sibling",
  "css-selector-attribute": ":attribute-selector",
  "css-selector-chaining": ":chaining",
  "css-selector-child": ":child-combinator",
  "css-selector-class": ":class-selector",
  "css-selector-descendant": ":descendant-combinator",
  "css-selector-general-sibling": ":general-sibling",
  "css-selector-grouping": ":grouping",
  "css-selector-id": ":id-selector",
  "css-selector-type": ":type-selector",
  "css-selector-universal": ":universal-selector",
  "css-pseudo-class-first-child": ":first-child",
  "css-pseudo-class-first-of-type": ":first-of-type",
  "css-pseudo-class-hover": ":hover",
  "css-pseudo-class-lang": ":lang",
  "css-pseudo-class-last-child": ":last-child",
  "css-pseudo-class-last-of-type": ":last-of-type",
  "css-pseudo-class-link": ":link",
  "css-pseudo-class-not": ":not",
  "css-pseudo-class-nth-child": ":nth-child",
  "css-pseudo-class-nth-last-child": ":nth-last-child",
  "css-pseudo-class-nth-of-type": ":nth-of-type",
  "css-pseudo-class-only-child": ":only-child",
  "css-pseudo-class-only-of-type": ":only-of-type",
  "css-pseudo-class-target": ":target",
  "css-pseudo-class-visited": ":visited",
  "css-pseudo-element-after": "::after",
  "css-pseudo-element-before": "::before",
  "css-pseudo-element-first-letter": "::first-letter",
  "css-pseudo-element-first-line": "::first-line",
  "css-pseudo-element-marker": "::marker",
  "css-pseudo-element-placeholder": "::placeholder",
  "css-pseudo-class-checked": ":checked",
  "css-pseudo-class-disabled": ":disabled",
  "css-pseudo-class-enabled": ":enabled",
  "css-pseudo-class-focus": ":focus",
  "css-pseudo-class-focus-visible": ":focus-visible",
  "css-pseudo-class-focus-within": ":focus-within",
  "css-pseudo-class-has": ":has",
  "css-pseudo-class-is": ":is",
  "css-pseudo-class-root": ":root",
  "css-pseudo-class-where": ":where",
  "css-rgb": "rgb",
  "css-rgba": "rgba",
  "css-important": "!important",
  "css-comments": "css-comments",
  "css-border-inline-block": "border-inline",
  "css-border-inline-block-individual": "border-inline-individual",
  "css-border-inline-block-longhand": "border-inline-longhand",
  "css-border-radius-logical": "border-radius-logical",
  "css-left-right-top-bottom": "left",
  "css-scroll-snap": "scroll-snap",

  // HTML attributes. Keyed as the attribute selector that finds them, which is
  // also what analyze.ts hands to cheerio.
  "html-align": "[align]",
  "html-aria-describedby": "[aria-describedby]",
  "html-aria-hidden": "[aria-hidden]",
  "html-aria-label": "[aria-label]",
  "html-aria-labelledby": "[aria-labelledby]",
  "html-aria-live": "[aria-live]",
  "html-background": "[background]",
  "html-cellpadding": "[cellpadding]",
  "html-cellspacing": "[cellspacing]",
  "html-command-attribute": "[command]",
  "html-dir": "[dir]",
  "html-height": "[height]",
  "html-hidden": "[hidden]",
  "html-lang": "[lang]",
  "html-loading-attribute": "[loading]",
  "html-popover": "[popover]",
  "html-required": "[required]",
  "html-role": "[role]",
  "html-srcset": "[srcset]",
  "html-target": "[target]",
  "html-valign": "[valign]",
  "html-width": "[width]",

  // Typed form controls. `<input>`/`<button>` alone say nothing about which
  // type a client strips, and caniemail grades them separately.
  "html-button-reset": '<button type="reset">',
  "html-button-submit": '<button type="submit">',
  "html-input-checkbox": '<input type="checkbox">',
  "html-input-hidden": '<input type="hidden">',
  "html-input-radio": '<input type="radio">',
  "html-input-reset": '<input type="reset">',
  "html-input-submit": '<input type="submit">',
  "html-input-text": '<input type="text">',

  // Document-level and link-shaped features.
  "amp": "amp4email",
  "html-anchor-links": "anchor-links",
  "html-comments": "html-comments",
  "html-doctype": "doctype",
  "html-image-maps": "image-maps",
  "html-mailto-links": "mailto-links",
  "html-meta-color-scheme": "meta-color-scheme",
  "html-semantics": "html5-semantics",
};

/**
 * Classify a key we already resolved, so the kind never has to be re-guessed.
 *
 * This is the only classifier. Every generated feature array is the keys of
 * one kind, which is what makes the arrays partition the matrix: a key cannot
 * land in two of them, and cannot land in none, because this returns exactly
 * one answer for it.
 */
function kindOfKey(key: string, slug: string, category: string): FeatureKind {
  if (category === "image") return "image";
  if (HTML_MISC_SLUGS.has(slug)) return "html-misc";
  if (key.startsWith("[")) return "html-attribute";
  if (key.startsWith("<")) return "html-element";
  if (key.startsWith("@")) return "at-rule";
  if (CSS_FUNCTION_NAMES.has(key)) return "css-function";
  // `:hover`, `::after`: written in a selector, not in a declaration.
  if (key.startsWith(":")) return "selector";
  // `display:flex`: one property paired with one value.
  if (key.includes(":")) return "compound-value";
  return "css-property";
}

/**
 * Map a caniemail feature to our engine property key and kind.
 */
function featureToPropertyKey(feature: CanIEmailFeature): string | null {
  const { slug, title, category } = feature;

  // Image formats live in their own table; they are not CSS.
  if (category === "image") return slug.replace(/^image-/, "");

  // Check explicit slug mapping first
  if (SLUG_TO_KEY[slug]) return SLUG_TO_KEY[slug];

  // HTML elements
  if (category === "html") {
    const match = title.match(/^<(\w+)>/);
    if (match) return `<${match[1]}>`;
    const tagMatch = slug.match(/^html-(.+)/);
    if (tagMatch) {
      const tag = tagMatch[1].toLowerCase();
      const validTags = [
        "style", "link", "video", "svg", "form", "picture", "audio",
        "iframe", "object", "embed", "canvas", "dialog", "details",
        "summary", "meter", "progress", "datalist", "input", "button",
        "select", "textarea", "ruby", "bdi", "bdo", "wbr", "abbr",
        "address", "blockquote", "cite", "code", "del", "dfn", "ins",
        "kbd", "mark", "pre", "q", "s", "samp", "small", "sub", "sup",
        "time", "u", "var", "acronym", "base", "body", "div", "h1",
        "hr", "img", "marquee", "ol", "p", "span", "strike", "strong",
        "table", "ul",
      ];
      if (validTags.includes(tag)) return `<${tag}>`;
      return null;
    }
    return null;
  }

  // CSS features
  if (category === "css" || category === "others") {
    const t = title.toLowerCase().trim();

    // At-rules: take just the at-rule name (first word)
    if (t.startsWith("@")) {
      return t.split(/[\s(,]/)[0];
    }

    // CSS functions ending with ()
    const funcMatch = t.match(/^([\w-]+)\(\)$/);
    if (funcMatch) return funcMatch[1];

    // Regular CSS properties; title is the property name
    if (/^[a-z][a-z0-9-]*$/.test(t)) return t;

    // Derive from slug as fallback
    if (slug.startsWith("css-")) {
      const derived = slug.replace(/^css-/, "").replace(/_/g, "-");
      if (/^[a-z][a-z0-9-]*$/.test(derived)) return derived;
    }

    return null;
  }

  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────

/**
 * caniemail dates are hand-entered and occasionally miss a leading zero
 * ("2024-05-1"). Pad what we can read, drop what we cannot: a date that only
 * looks like a date is worse than no date.
 */
function normalizeTestDate(raw: string | undefined): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((raw ?? "").trim());
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** One feature's per-client answers, plus where they came from. */
interface Row {
  support: Record<string, SupportLevel>;
  notes: Record<string, string[]>;
  lastTested: string;
}

async function main() {
  console.log("Fetching caniemail.com API data...");
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  const data: CanIEmailData = await res.json();

  console.log(`Found ${data.data.length} features (last updated: ${data.last_update_date})`);

  const rows: Record<string, Row> = {};
  const images: Record<string, Row> = {};
  const kinds: Record<string, FeatureKind> = {};

  // Upstream drift is invisible at runtime: a feature that stops resolving, or
  // a client key caniemail renames, does not throw, it just makes every future
  // report quieter. This is the only place it can be seen, so it is counted
  // here and turned into a failure at the end.
  const usedClientKeys = new Set<string>();
  const unkeyed: string[] = [];
  const noData: string[] = [];

  for (const feature of data.data) {
    const key = featureToPropertyKey(feature);
    if (!key) {
      unkeyed.push(feature.slug);
      continue;
    }
    const kind = kindOfKey(key, feature.slug, feature.category);

    // Extract support for each of our engine clients, merging the platforms
    // that share one client.
    const clientSupport: Record<string, SupportLevel> = {};
    const clientNotes: Record<string, string[]> = {};

    for (const [canieClientName, platforms] of Object.entries(feature.stats)) {
      for (const [platform, versions] of Object.entries(platforms)) {
        const mapKey = `${canieClientName}.${platform}`;
        const engineClientId = CLIENT_MAP[mapKey];
        if (!engineClientId) continue;
        usedClientKeys.add(mapKey);

        const support = getLatestSupport(versions);
        const previous = clientSupport[engineClientId];
        const merged = mergeSupport(previous, support);
        clientSupport[engineClientId] = merged;

        // A note explains one platform's answer, so it may only sit on a cell
        // that still holds that answer. Merging the levels worst-wins while
        // unioning the notes put "Supported. …" on unsupported cells and let a
        // better platform delete the worse one's explanation.
        const notes = getLatestNotes(versions, feature.notes_by_num);
        if (support !== merged) continue; // this platform lost; its note goes with it
        if (previous !== merged) delete clientNotes[engineClientId]; // new, worse winner
        if (notes.length) {
          const seen = clientNotes[engineClientId] ?? [];
          clientNotes[engineClientId] = [...new Set([...seen, ...notes])];
        }
      }
    }

    // Add Superhuman override if available
    const superhumanLevel = SUPERHUMAN_OVERRIDES[key];
    if (superhumanLevel) {
      clientSupport["superhuman"] = superhumanLevel;
      const shNote = SUPERHUMAN_NOTES[key];
      if (shNote) clientNotes["superhuman"] = shNote;
    }

    // Fill missing clients with "unknown"
    for (const clientId of ALL_ENGINE_CLIENTS) {
      if (!clientSupport[clientId]) {
        clientSupport[clientId] = "unknown";
      }
    }

    // Only include features with at least one non-unknown client
    const hasData = Object.values(clientSupport).some((s) => s !== "unknown");
    if (!hasData) {
      noData.push(feature.slug);
      continue;
    }

    const table = kind === "image" ? images : rows;
    const existing = table[key];
    if (existing) {
      // Two features share a key (e.g. css-word-wrap and css-overflow-wrap).
      // Merge rather than let API order decide, and keep the older test date:
      // the key is only as fresh as its stalest contributor.
      for (const clientId of ALL_ENGINE_CLIENTS) {
        const previous = existing.support[clientId];
        const merged = mergeSupport(previous, clientSupport[clientId]);
        existing.support[clientId] = merged;
        if (clientSupport[clientId] !== merged) continue;
        if (previous !== merged) delete existing.notes[clientId];
        if (clientNotes[clientId]?.length) {
          const seen = existing.notes[clientId] ?? [];
          existing.notes[clientId] = [...new Set([...seen, ...clientNotes[clientId]])];
        }
      }
      // The key is only as fresh as its stalest contributor, and a
      // contributor we could not date is the stalest thing there is: an
      // undated one leaves the key undated rather than borrowing a date.
      const tested = normalizeTestDate(feature.last_test_date);
      if (!tested || !existing.lastTested) existing.lastTested = "";
      else if (tested < existing.lastTested) existing.lastTested = tested;
    } else {
      table[key] = {
        support: clientSupport,
        notes: clientNotes,
        lastTested: normalizeTestDate(feature.last_test_date),
      };
      kinds[key] = kind;
    }
  }

  // Add universally-supported properties not in caniemail
  for (const key of ["font-family", "color"]) {
    if (rows[key]) continue;
    rows[key] = {
      support: Object.fromEntries(ALL_ENGINE_CLIENTS.map((c) => [c, "supported" as SupportLevel])),
      notes: {},
      lastTested: "",
    };
    kinds[key] = "css-property";
  }

  // Expand "left" (from css-left-right-top-bottom) to cover right/top/bottom
  if (rows["left"]) {
    for (const sibling of ["right", "top", "bottom"]) {
      if (rows[sibling]) continue;
      rows[sibling] = {
        support: { ...rows["left"].support },
        notes: { ...rows["left"].notes },
        lastTested: rows["left"].lastTested,
      };
      kinds[sibling] = "css-property";
    }
  }

  // Sort properties for deterministic output
  const groupOrder = (k: string) => {
    if (k.startsWith("<")) return 0;
    if (k.startsWith("[")) return 1;
    if (k.startsWith("@")) return 2;
    if (k.includes(":")) return 4; // compound values last
    return 3; // regular CSS properties
  };
  const sortedKeys = Object.keys(rows).sort((a, b) => {
    const ga = groupOrder(a);
    const gb = groupOrder(b);
    if (ga !== gb) return ga - gb;
    return a.localeCompare(b);
  });
  const sortedImages = Object.keys(images).sort();

  const count = sortedKeys.length;
  console.log(`Generated ${count} features + ${sortedImages.length} image formats`);

  // Baselines, not aspirations: these are what the current dataset produces.
  // Anything materially below them means we are reading less of caniemail than
  // we did yesterday, which is exactly the failure nobody would otherwise see.
  const MIN_FEATURES = 290;
  const MIN_CLIENT_COVERAGE = 0.6; // fastmail, the thinnest real client, sits at 0.78

  const coverage = (clientId: string) =>
    sortedKeys.filter((k) => rows[k].support[clientId] !== "unknown").length / count;
  const problems: string[] = [];
  if (unkeyed.length) {
    problems.push(`${unkeyed.length} features resolved to no key: ${unkeyed.slice(0, 8).join(", ")}`);
  }
  if (noData.length) {
    problems.push(`${noData.length} features had no data for any client we map: ${noData.slice(0, 8).join(", ")}`);
  }
  const deadClientKeys = Object.keys(CLIENT_MAP).filter((k) => !usedClientKeys.has(k));
  if (deadClientKeys.length) {
    problems.push(`CLIENT_MAP names platforms caniemail no longer has: ${deadClientKeys.join(", ")}`);
  }
  const dark = ALL_ENGINE_CLIENTS.filter(
    (c) => c !== "superhuman" && coverage(c) < MIN_CLIENT_COVERAGE,
  );
  if (dark.length) {
    problems.push(
      `clients answering for under ${MIN_CLIENT_COVERAGE * 100}% of features: ` +
        dark.map((c) => `${c} (${Math.round(coverage(c) * 100)}%)`).join(", "),
    );
  }
  if (count < MIN_FEATURES) {
    problems.push(`only ${count} features generated, expected at least ${MIN_FEATURES}`);
  }
  if (problems.length) {
    console.error("\nsync-caniemail refused to write. Upstream shape changed:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nFix the mapping (or move the baseline, deliberately) and re-run.");
    process.exit(1);
  }

  const output = generateTsFile(sortedKeys, sortedImages, rows, images, kinds, data.last_update_date);

  // Write to disk
  const outPath = new URL("../src/rules/css-support.ts", import.meta.url).pathname;
  // On Windows, URL pathname has a leading slash before drive letter
  const normalizedPath = outPath.replace(/^\/([A-Z]:)/, "$1");
  await Bun.write(normalizedPath, output);

  console.log(`Wrote ${normalizedPath} (${count} features across ${ALL_ENGINE_CLIENTS.length} clients)`);
}

/** Emit `KEY: { client: level, … }` blocks for one support table. */
function supportBlock(keys: string[], table: Record<string, Row>): string[] {
  const lines: string[] = [];
  for (const key of keys) {
    lines.push(`  ${JSON.stringify(key)}: {`);
    for (const clientId of ALL_ENGINE_CLIENTS) {
      const level = table[key].support[clientId] || "unknown";
      lines.push(`    ${JSON.stringify(clientId)}: ${JSON.stringify(level)},`);
    }
    lines.push(`  },`);
  }
  return lines;
}

/** Emit the sparse per-cell note table for one support table. */
function notesBlock(keys: string[], table: Record<string, Row>): string[] {
  const lines: string[] = [];
  for (const key of keys) {
    if (!Object.keys(table[key].notes).length) continue;
    lines.push(`  ${JSON.stringify(key)}: {`);
    for (const clientId of ALL_ENGINE_CLIENTS) {
      const notes = table[key].notes[clientId];
      if (notes && notes.length) {
        lines.push(`    ${JSON.stringify(clientId)}: ${JSON.stringify(notes)},`);
      }
    }
    lines.push(`  },`);
  }
  return lines;
}

/** Emit `export const NAME = [ … ] as const;` for a classified key list. */
function featureArray(name: string, doc: string, keys: string[]): string[] {
  return [
    `/** ${doc} */`,
    `export const ${name} = [`,
    ...keys.map((k) => `  ${JSON.stringify(k)},`),
    `] as const;`,
    ``,
  ];
}

function generateTsFile(
  sortedKeys: string[],
  sortedImages: string[],
  rows: Record<string, Row>,
  images: Record<string, Row>,
  kinds: Record<string, FeatureKind>,
  lastUpdate: string,
): string {
  const lines: string[] = [];

  lines.push(`import type { SupportLevel } from "../types";`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * CSS/HTML feature support matrix, auto-generated from caniemail.com.`);
  lines.push(` * Last synced: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(` * caniemail last updated: ${lastUpdate}`);
  lines.push(` *`);
  lines.push(` * ${sortedKeys.length} features and ${sortedImages.length} image formats across ${ALL_ENGINE_CLIENTS.length} email clients.`);
  lines.push(` *`);
  lines.push(` * Support levels:`);
  lines.push(` * - "supported": fully supported`);
  lines.push(` * - "partial": partially supported (with caveats)`);
  lines.push(` * - "unsupported": not supported at all`);
  lines.push(` * - "unknown": no data available`);
  lines.push(` *`);
  lines.push(` * Data sources:`);
  lines.push(` * - Most clients: caniemail.com API (verified data)`);
  lines.push(` * - hey-mail: caniemail.com (WebKit-based)`);
  lines.push(` * - superhuman: Manual overrides (Chromium/Blink-based, best-effort estimates)`);
  lines.push(` *`);
  lines.push(` * A client we ship as one entry although caniemail tests it on several`);
  lines.push(` * platforms (Proton Mail, AOL, Thunderbird) is graded on its worst`);
  lines.push(` * platform. Gmail, Outlook, Yahoo and Apple Mail ship as separate clients`);
  lines.push(` * per platform instead.`);
  lines.push(` *`);
  lines.push(` * DO NOT EDIT; regenerate with: bun run sync:caniemail`);
  lines.push(` */`);
  lines.push(`/** The clients every row answers for, in report order. */`);
  lines.push(`export const SUPPORT_CLIENTS = [`);
  for (const clientId of ALL_ENGINE_CLIENTS) {
    lines.push(`  ${JSON.stringify(clientId)},`);
  }
  lines.push(`] as const;`);
  lines.push(``);
  // `satisfies` is the whole enforcement, and it sits on the literal rather
  // than on the exported type on purpose. Narrowing the export reaches every
  // caller that holds a client id as a string, inside this repo and outside
  // it; 0.12.1 narrowed `EmailClient.id` the same way and broke the CLI in
  // four places. Check where the literals are written, stay permissive where
  // they are read.
  // Record<FeatureKey, …> requires every
  // member of the union to be present, and an object literal may not carry a
  // key the target type does not name. So a feature the arrays fail to
  // classify, or classify twice, stops compiling here rather than quietly
  // losing its detector. The export is re-typed permissively on the next line
  // because callers index it with property names parsed out of a stylesheet.
  lines.push(`const CSS_SUPPORT_TABLE = {`);
  lines.push(...supportBlock(sortedKeys, rows));
  lines.push(`} satisfies Record<FeatureKey, Record<ClientId, SupportLevel>>;`);
  lines.push(``);
  lines.push(`export const CSS_SUPPORT: Record<string, Record<string, SupportLevel>> =`);
  lines.push(`  CSS_SUPPORT_TABLE;`);
  lines.push(``);

  // Per-cell caveat notes from caniemail (sparse, only cells that have one).
  // Used by analyze.ts to make partial/unsupported warnings specific and
  // value-aware (e.g. only flag `margin` on negative/auto values).
  lines.push(`/**`);
  lines.push(` * Caveat notes per (feature, client) from caniemail: the "why" behind a`);
  lines.push(` * partial/buggy/unsupported rating. Sparse: only cells with a note appear.`);
  lines.push(` */`);
  lines.push(`export const CSS_SUPPORT_NOTES: Record<`);
  lines.push(`  string,`);
  lines.push(`  Record<string, string[]>`);
  lines.push(`> = {`);
  lines.push(...notesBlock(sortedKeys, rows));
  lines.push(`};`);
  lines.push(``);

  lines.push(`/**`);
  lines.push(` * Image format support, keyed by format. Kept out of CSS_SUPPORT because an`);
  lines.push(` * image format is a property of the \`src\`, not of a stylesheet: the image`);
  lines.push(` * analyzer looks these up, the CSS analyzer never should.`);
  lines.push(` */`);
  lines.push(`/** The image formats caniemail grades. */`);
  lines.push(`export const IMAGE_FORMATS = [`);
  for (const key of sortedImages) {
    lines.push(`  ${JSON.stringify(key)},`);
  }
  lines.push(`] as const;`);
  lines.push(``);
  lines.push(`const IMAGE_SUPPORT_TABLE = {`);
  lines.push(...supportBlock(sortedImages, images));
  lines.push(`} satisfies Record<ImageFormat, Record<ClientId, SupportLevel>>;`);
  lines.push(``);
  lines.push(`export const IMAGE_SUPPORT: Record<string, Record<string, SupportLevel>> =`);
  lines.push(`  IMAGE_SUPPORT_TABLE;`);
  lines.push(``);

  lines.push(`/** Caveat notes per (image format, client), same shape as CSS_SUPPORT_NOTES. */`);
  lines.push(`export const IMAGE_SUPPORT_NOTES: Record<`);
  lines.push(`  string,`);
  lines.push(`  Record<string, string[]>`);
  lines.push(`> = {`);
  lines.push(...notesBlock(sortedImages, images));
  lines.push(`};`);
  lines.push(``);

  // Generate manual sets
  lines.push(`/**`);
  lines.push(` * CSS properties that Gmail strips from inline styles.`);
  lines.push(` * Updated per caniemail.com data; Gmail keeps float and display (basic values).`);
  lines.push(` */`);
  lines.push(`export const GMAIL_STRIPPED_PROPERTIES = new Set([`);
  for (const prop of GMAIL_STRIPPED_PROPERTIES) {
    lines.push(`  ${JSON.stringify(prop)},`);
  }
  lines.push(`]);`);
  lines.push(``);

  lines.push(`/**`);
  lines.push(` * Features a client merely ignores when it "does not support" them: the`);
  lines.push(` * email renders the same either way, so these report as info, not warnings.`);
  lines.push(` */`);
  // Typed at construction so a typo in manual-sets.ts fails to compile, and
  // exported as a set of plain strings so callers can still ask about a
  // property name they parsed out of a stylesheet.
  lines.push(`export const GRACEFUL_FEATURES: ReadonlySet<string> = new Set<FeatureKey>([`);
  for (const prop of GRACEFUL_FEATURES) {
    lines.push(`  ${JSON.stringify(prop)},`);
  }
  lines.push(`]);`);
  lines.push(``);

  lines.push(`/** CSS properties that Outlook Word engine ignores */`);
  lines.push(`export const OUTLOOK_WORD_UNSUPPORTED = new Set([`);
  for (const prop of OUTLOOK_WORD_UNSUPPORTED) {
    lines.push(`  ${JSON.stringify(prop)},`);
  }
  lines.push(`]);`);
  lines.push(``);

  lines.push(`/**`);
  lines.push(` * Properties that require HTML structural changes (not just CSS swaps)`);
  lines.push(` * to fix. These cannot be solved by replacing one CSS value with another.`);
  lines.push(` */`);
  lines.push(`export const STRUCTURAL_FIX_PROPERTIES = new Set([`);
  for (const prop of STRUCTURAL_FIX_PROPERTIES) {
    lines.push(`  ${JSON.stringify(prop)},`);
  }
  lines.push(`]);`);
  lines.push(``);

  // Export feature classification arrays for data-driven detection in analyze.ts
  const of = (kind: FeatureKind) => sortedKeys.filter((k) => kinds[k] === kind);

  lines.push(...featureArray(
    "HTML_ELEMENT_FEATURES",
    "HTML element features in the support matrix (for data-driven detection).",
    of("html-element"),
  ));
  lines.push(...featureArray(
    "HTML_ATTRIBUTE_FEATURES",
    'HTML attribute features. Each key is also the cheerio selector that finds it.',
    of("html-attribute"),
  ));
  lines.push(...featureArray(
    "HTML_MISC_FEATURES",
    "Document-level and link-shaped HTML features; each has a bespoke detector.",
    of("html-misc"),
  ));
  lines.push(...featureArray(
    "AT_RULE_FEATURES",
    "CSS at-rule features, including the media features that qualify `@media`.",
    of("at-rule"),
  ));
  lines.push(...featureArray(
    "COMPOUND_VALUE_FEATURES",
    'One property paired with one value, e.g. "display:flex".',
    of("compound-value"),
  ));
  lines.push(...featureArray(
    "SELECTOR_FEATURES",
    "Pseudo-classes, pseudo-elements and combinators, e.g. \":hover\", \"::after\".",
    of("selector"),
  ));
  lines.push(...featureArray(
    "CSS_FUNCTION_FEATURES",
    'CSS function features (e.g., "linear-gradient").',
    of("css-function"),
  ));
  lines.push(...featureArray(
    "CSS_PROPERTY_FEATURES",
    "Plain CSS property names: what an inline style or declaration can match.",
    of("css-property"),
  ));

  // ── Types ─────────────────────────────────────────────────────────────────
  // The arrays above are `as const`, so their members are literal types. Naming
  // the union of them lets a detector map, a manual set, or a client list be
  // typed by what actually exists, which turns a rename into a compile error
  // instead of a detector that quietly stops finding anything.
  lines.push(`/** Every feature key in CSS_SUPPORT, as a type. */`);
  lines.push(`export type FeatureKey =`);
  for (const name of [
    "HTML_ELEMENT_FEATURES", "HTML_ATTRIBUTE_FEATURES", "HTML_MISC_FEATURES",
    "AT_RULE_FEATURES", "COMPOUND_VALUE_FEATURES", "SELECTOR_FEATURES",
    "CSS_FUNCTION_FEATURES", "CSS_PROPERTY_FEATURES",
  ]) {
    lines.push(`  | (typeof ${name})[number]`);
  }
  lines.push(`;`);
  lines.push(``);
  lines.push(`/** One feature key from each lane, for typing that lane's detectors. */`);
  for (const [alias, array] of [
    ["HtmlElementFeature", "HTML_ELEMENT_FEATURES"],
    ["HtmlAttributeFeature", "HTML_ATTRIBUTE_FEATURES"],
    ["HtmlMiscFeature", "HTML_MISC_FEATURES"],
    ["AtRuleFeature", "AT_RULE_FEATURES"],
  ]) {
    lines.push(`export type ${alias} = (typeof ${array})[number];`);
  }
  lines.push(``);
  lines.push(`/** An image format caniemail grades. */`);
  lines.push(`export type ImageFormat = (typeof IMAGE_FORMATS)[number];`);
  lines.push(``);
  lines.push(`/** A client the matrix answers for. */`);
  lines.push(`export type ClientId = (typeof SUPPORT_CLIENTS)[number];`);
  lines.push(``);

  lines.push(`/**`);
  lines.push(` * When caniemail last re-tested each feature. A feature's row is only as`);
  lines.push(` * current as its test date, whatever the file's sync date says.`);
  lines.push(` */`);
  lines.push(`export const FEATURE_LAST_TESTED: Record<string, string> = {`);
  for (const key of [...sortedKeys, ...sortedImages]) {
    const date = (rows[key] ?? images[key]).lastTested;
    if (date) lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(date)},`);
  }
  lines.push(`};`);
  lines.push(``);

  return lines.join("\n");
}

// Only run when executed directly (`bun run sync:caniemail`), not when imported
// by unit tests for the pure helpers below.
if (import.meta.main) {
  main().catch((err) => {
    console.error("sync-caniemail failed:", err);
    process.exit(1);
  });
}

export {
  mapSupportCode,
  getLatestSupport,
  getLatestNotes,
  featureToPropertyKey,
  kindOfKey,
  mergeSupport,
  normalizeTestDate,
};
export type { CanIEmailFeature };
