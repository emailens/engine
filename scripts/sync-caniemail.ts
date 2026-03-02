#!/usr/bin/env bun
/**
 * sync-caniemail.ts — Fetches CSS/HTML feature support data from caniemail.com
 * and generates src/rules/css-support.ts with 150+ properties.
 *
 * Usage: bun run scripts/sync-caniemail.ts
 */

import { SUPERHUMAN_OVERRIDES } from "./superhuman-overrides";
import {
  GMAIL_STRIPPED_PROPERTIES,
  OUTLOOK_WORD_UNSUPPORTED,
  STRUCTURAL_FIX_PROPERTIES,
} from "./manual-sets";

const API_URL = "https://www.caniemail.com/api/data.json";

// ── Client mapping ──────────────────────────────────────────────────────────

/** Map caniemail client.platform → engine client ID */
const CLIENT_MAP: Record<string, string> = {
  "apple-mail.macos": "apple-mail-macos",
  "apple-mail.ios": "apple-mail-ios",
  "gmail.desktop-webmail": "gmail-web",
  "gmail.android": "gmail-android",
  "gmail.ios": "gmail-ios",
  "outlook.outlook-com": "outlook-web",
  "outlook.windows": "outlook-windows",
  "yahoo.desktop-webmail": "yahoo-mail",
  "samsung-email.android": "samsung-mail",
  "thunderbird.macos": "thunderbird",
  "hey.desktop-webmail": "hey-mail",
  // superhuman is manually provided
};

const ALL_ENGINE_CLIENTS = [
  "gmail-web", "gmail-android", "gmail-ios",
  "outlook-web", "outlook-windows",
  "apple-mail-macos", "apple-mail-ios",
  "yahoo-mail", "samsung-mail", "thunderbird",
  "hey-mail", "superhuman",
];

type SupportLevel = "supported" | "partial" | "unsupported" | "unknown";

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

// ── Property key normalization ──────────────────────────────────────────────

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
};

/**
 * Map a caniemail feature to our engine property key.
 */
function featureToPropertyKey(feature: CanIEmailFeature): string | null {
  const { slug, title, category } = feature;

  // Skip non-email features
  if (category === "image") return null;

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

    // At-rules — take just the at-rule name (first word)
    if (t.startsWith("@")) {
      return t.split(/[\s(,]/)[0];
    }

    // CSS functions ending with ()
    const funcMatch = t.match(/^([\w-]+)\(\)$/);
    if (funcMatch) return funcMatch[1];

    // Regular CSS properties — title is the property name
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

async function main() {
  console.log("Fetching caniemail.com API data...");
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  const data: CanIEmailData = await res.json();

  console.log(`Found ${data.data.length} features (last updated: ${data.last_update_date})`);

  // Build support matrix
  const matrix: Record<string, Record<string, SupportLevel>> = {};
  const featureMeta: Record<string, { title: string; category: string; slug: string }> = {};

  for (const feature of data.data) {
    const key = featureToPropertyKey(feature);
    if (!key) continue;

    // Extract support for each of our engine clients
    const clientSupport: Record<string, SupportLevel> = {};

    for (const [canieClientName, platforms] of Object.entries(feature.stats)) {
      for (const [platform, versions] of Object.entries(platforms)) {
        const mapKey = `${canieClientName}.${platform}`;
        const engineClientId = CLIENT_MAP[mapKey];
        if (!engineClientId) continue;

        const support = getLatestSupport(versions);
        clientSupport[engineClientId] = support;
      }
    }

    // Add Superhuman override if available
    const superhumanLevel = SUPERHUMAN_OVERRIDES[key];
    if (superhumanLevel) {
      clientSupport["superhuman"] = superhumanLevel;
    }

    // Fill missing clients with "unknown"
    for (const clientId of ALL_ENGINE_CLIENTS) {
      if (!clientSupport[clientId]) {
        clientSupport[clientId] = "unknown";
      }
    }

    // Only include features with at least one non-unknown client
    const hasData = Object.values(clientSupport).some((s) => s !== "unknown");
    if (!hasData) continue;

    // If property already exists (e.g., multiple caniemail features map to same key),
    // merge by preferring more specific data
    if (matrix[key]) {
      for (const clientId of ALL_ENGINE_CLIENTS) {
        if (matrix[key][clientId] === "unknown" && clientSupport[clientId] !== "unknown") {
          matrix[key][clientId] = clientSupport[clientId];
        }
      }
    } else {
      matrix[key] = clientSupport;
      featureMeta[key] = { title: feature.title, category: feature.category, slug: feature.slug };
    }
  }

  // Add universally-supported properties not in caniemail
  const UNIVERSAL_PROPERTIES: Record<string, Record<string, SupportLevel>> = {
    "font-family": Object.fromEntries(ALL_ENGINE_CLIENTS.map((c) => [c, "supported" as SupportLevel])),
    "color": Object.fromEntries(ALL_ENGINE_CLIENTS.map((c) => [c, "supported" as SupportLevel])),
  };

  for (const [key, support] of Object.entries(UNIVERSAL_PROPERTIES)) {
    if (!matrix[key]) {
      matrix[key] = support;
    }
  }

  // Expand "left" (from css-left-right-top-bottom) to cover right/top/bottom
  if (matrix["left"]) {
    for (const sibling of ["right", "top", "bottom"]) {
      if (!matrix[sibling]) {
        matrix[sibling] = { ...matrix["left"] };
      }
    }
  }

  // Sort properties alphabetically for deterministic output
  const sortedKeys = Object.keys(matrix).sort((a, b) => {
    // Group: HTML elements first, then at-rules, then CSS properties
    const groupOrder = (k: string) => {
      if (k.startsWith("<")) return 0;
      if (k.startsWith("@")) return 1;
      if (k.includes(":")) return 3; // compound values last
      return 2; // regular CSS properties
    };
    const ga = groupOrder(a);
    const gb = groupOrder(b);
    if (ga !== gb) return ga - gb;
    return a.localeCompare(b);
  });

  const count = sortedKeys.length;
  console.log(`Generated ${count} properties`);

  if (count < 150) {
    console.warn(`Warning: Only ${count} properties generated (target: 150+)`);
  }

  // Generate the TypeScript file
  const output = generateTsFile(sortedKeys, matrix, featureMeta, data.last_update_date);

  // Write to disk
  const outPath = new URL("../src/rules/css-support.ts", import.meta.url).pathname;
  // On Windows, URL pathname has a leading slash before drive letter
  const normalizedPath = outPath.replace(/^\/([A-Z]:)/, "$1");
  await Bun.write(normalizedPath, output);

  console.log(`Wrote ${normalizedPath} (${count} properties across ${ALL_ENGINE_CLIENTS.length} clients)`);
}

function generateTsFile(
  sortedKeys: string[],
  matrix: Record<string, Record<string, SupportLevel>>,
  _meta: Record<string, { title: string; category: string; slug: string }>,
  lastUpdate: string,
): string {
  const lines: string[] = [];

  lines.push(`import type { SupportLevel } from "../types";`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * CSS/HTML feature support matrix — auto-generated from caniemail.com.`);
  lines.push(` * Last synced: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(` * caniemail last updated: ${lastUpdate}`);
  lines.push(` *`);
  lines.push(` * ${sortedKeys.length} features across ${ALL_ENGINE_CLIENTS.length} email clients.`);
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
  lines.push(` * DO NOT EDIT — regenerate with: bun run sync:caniemail`);
  lines.push(` */`);
  lines.push(`export const CSS_SUPPORT: Record<`);
  lines.push(`  string,`);
  lines.push(`  Record<string, SupportLevel>`);
  lines.push(`> = {`);

  for (const key of sortedKeys) {
    const support = matrix[key];
    lines.push(`  ${JSON.stringify(key)}: {`);
    for (const clientId of ALL_ENGINE_CLIENTS) {
      const level = support[clientId] || "unknown";
      lines.push(`    ${JSON.stringify(clientId)}: ${JSON.stringify(level)},`);
    }
    lines.push(`  },`);
  }

  lines.push(`};`);
  lines.push(``);

  // Generate manual sets
  lines.push(`/**`);
  lines.push(` * CSS properties that Gmail strips from inline styles.`);
  lines.push(` * Updated per caniemail.com data — Gmail keeps float and display (basic values).`);
  lines.push(` */`);
  lines.push(`export const GMAIL_STRIPPED_PROPERTIES = new Set([`);
  for (const prop of GMAIL_STRIPPED_PROPERTIES) {
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
  const htmlElements = sortedKeys.filter((k) => k.startsWith("<"));
  const atRules = sortedKeys.filter((k) => k.startsWith("@"));
  const compoundValues = sortedKeys.filter((k) => k.includes(":") && !k.startsWith("<") && !k.startsWith("@"));
  const cssFunctions = sortedKeys.filter((k) =>
    ["linear-gradient", "radial-gradient", "conic-gradient", "image-set",
     "calc", "min", "max", "clamp", "var", "env", "fit-content",
     "minmax", "repeat",
    ].includes(k)
  );

  lines.push(`/** HTML element features in the support matrix (for data-driven detection). */`);
  lines.push(`export const HTML_ELEMENT_FEATURES = [`);
  for (const el of htmlElements) {
    lines.push(`  ${JSON.stringify(el)},`);
  }
  lines.push(`] as const;`);
  lines.push(``);

  lines.push(`/** CSS at-rule features in the support matrix. */`);
  lines.push(`export const AT_RULE_FEATURES = [`);
  for (const ar of atRules) {
    lines.push(`  ${JSON.stringify(ar)},`);
  }
  lines.push(`] as const;`);
  lines.push(``);

  lines.push(`/** Compound CSS value features (e.g., "display:flex"). */`);
  lines.push(`export const COMPOUND_VALUE_FEATURES = [`);
  for (const cv of compoundValues) {
    lines.push(`  ${JSON.stringify(cv)},`);
  }
  lines.push(`] as const;`);
  lines.push(``);

  lines.push(`/** CSS function features (e.g., "linear-gradient"). */`);
  lines.push(`export const CSS_FUNCTION_FEATURES = [`);
  for (const fn of cssFunctions) {
    lines.push(`  ${JSON.stringify(fn)},`);
  }
  lines.push(`] as const;`);
  lines.push(``);

  return lines.join("\n");
}

main().catch((err) => {
  console.error("sync-caniemail failed:", err);
  process.exit(1);
});
