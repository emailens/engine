import type { CheerioAPI } from "cheerio";
import { TARGETING_HACKS, type TargetingHack } from "./targeting-hacks.generated";

export type TargetingSimulate =
  | { kind: "insert-before"; html: string; if?: string; unless?: string }
  | { kind: "wrap-body"; id?: string; className?: string }
  | { kind: "wrap-then-insert"; wrapHtml: string; html: string; if?: string; unless?: string };

/**
 * Engine-owned matcher. `upstreamKey` is provenance into TARGETING_HACKS;
 * sync fails if it disappears. `id` is ours and does not follow HowToTarget.
 *
 * Inclusion: add a row only when EMAIL_CLIENTS need detect, suppress
 * (`scopesCompatibility`), preserve-on-inline, or simulate. Catalog entries
 * without a matcher stay provenance — do not bulk-import unused snippets.
 */
export interface TargetingMatcher {
  id: string;
  upstreamKey: string;
  pattern: RegExp;
  surface: "selector" | "atrule" | "html";
  clientIds: readonly string[];
  description: string;
  foundIn: "style-block" | "inline-style" | "conditional-comment";
  scopesCompatibility: boolean;
  preserveOnInline: boolean;
  /** none: detect only (Word-engine MSO). deprecated / strict: policy-gated lint. */
  lint: "none" | "deprecated" | "strict";
  inlineCheerio?: string;
  simulate?: TargetingSimulate;
}

export const TARGETING_MATCHERS: readonly TargetingMatcher[] = [
  {
    id: "gmail-android-div-u-body",
    upstreamKey: "c08d3e74cc1e4d28",
    pattern: /div\s*>\s*u\s*\+\s*(\.body|#body)/i,
    surface: "selector",
    clientIds: ["gmail-android"],
    description: "Gmail Android wrapper (`div > u + .body`)",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
    simulate: {
      kind: "wrap-then-insert",
      wrapHtml: "<div></div>",
      html: "<u></u>",
      if: ".body",
      unless: "div > u + .body",
    },
  },
  {
    id: "gmail-u-plus-body",
    upstreamKey: "efa65078ea98b59f",
    pattern: /u\s*\+\s*(\.body|#body)/i,
    surface: "selector",
    clientIds: ["gmail-web"],
    description: "Gmail Web wrapper (`u + .body`)",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
    simulate: { kind: "insert-before", html: "<u></u>", if: ".body", unless: "u + .body" },
  },
  {
    id: "samsung-message-webview",
    upstreamKey: "1726bcf9a338e059",
    pattern: /#(MessageWebViewDiv|MessageViewBody)/i,
    surface: "selector",
    clientIds: ["samsung-mail"],
    description: "Samsung Email body wrappers",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
    simulate: { kind: "wrap-body", id: "MessageWebViewDiv" },
  },
  {
    id: "outlook-data-ogs",
    upstreamKey: "92c2b7f1b8174ad5",
    pattern: /\[data-ogs[bc]\]/i,
    surface: "selector",
    clientIds: ["outlook-web", "outlook-ios", "outlook-android"],
    description: "Outlook dark mode override attributes",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
    inlineCheerio: "[data-ogsc], [data-ogsb]",
  },
  {
    id: "apple-mail-class-prefix",
    upstreamKey: "015eff83643cc1b6",
    pattern: /\[class\^=["']?apple-mail/i,
    surface: "selector",
    clientIds: ["apple-mail-ios", "apple-mail-macos"],
    description: "Apple Mail wrapper classes",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "apple-mail-singleton",
    upstreamKey: "9f77b58bab0d64d4",
    pattern: /\.Singleton\b/i,
    surface: "selector",
    clientIds: ["apple-mail-macos", "apple-mail-ios"],
    description: "Apple Mail Singleton class",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "netease-readhtml",
    upstreamKey: "f4c7f0631919e409",
    pattern: /\.netease_mail_readhtml/i,
    surface: "selector",
    clientIds: [],
    description: "163.com / NetEase wrapper",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "airmail-bloop",
    upstreamKey: "16df43642ca4db68",
    pattern: /\.bloop_container/i,
    surface: "selector",
    clientIds: [],
    description: "Airmail wrapper",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "edison-edo",
    upstreamKey: "b9fcb707b1d4e242",
    pattern: /\.edo\b/i,
    surface: "selector",
    clientIds: [],
    description: "Edison wrapper",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "proton-root",
    upstreamKey: "90329e7dfdec5777",
    pattern: /#proton-root/i,
    surface: "selector",
    clientIds: ["protonmail"],
    description: "Proton Mail root wrapper (`#proton-root`)",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
    simulate: { kind: "wrap-body", id: "proton-root" },
  },
  {
    id: "superhuman-shadow",
    upstreamKey: "34bd558588f30aab",
    pattern: /\.ShadowHTML/i,
    surface: "selector",
    clientIds: ["superhuman"],
    description: "Superhuman shadow DOM wrapper (`.ShadowHTML`)",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
    simulate: { kind: "wrap-body", className: "ShadowHTML" },
  },
  {
    id: "thunderbird-moz-text-html",
    upstreamKey: "2d00e0fcaefe026f",
    pattern: /\.moz-text-html\b/i,
    surface: "selector",
    clientIds: ["thunderbird"],
    description: "Thunderbird document wrapper",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "outlook-x-class-attr",
    upstreamKey: "f4deefda5b4ba0f2",
    pattern: /\[class~=["']?x_/i,
    surface: "selector",
    clientIds: ["outlook-web"],
    description: "Outlook.com x_ class prefix attribute selector",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "outlook-x-chained-class",
    upstreamKey: "4d3c98208e210f0e",
    pattern: /\.x_chained-class/i,
    surface: "selector",
    clientIds: ["outlook-web"],
    description: "Outlook webmail chained x_ class",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "outlook-converted-body",
    upstreamKey: "1501862928a850d6",
    pattern: /#converted-body/i,
    surface: "selector",
    clientIds: ["outlook-macos"],
    description: "Outlook for Mac converted-body wrapper",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: true,
    lint: "strict",
  },
  {
    id: "android-webkit-fullscreen",
    upstreamKey: "ad55f4e2559e2deb",
    pattern: /_:-webkit-full-screen/i,
    surface: "selector",
    clientIds: ["gmail-android", "samsung-mail"],
    description: "Deprecated WebKit full-screen selector hack",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: true,
    lint: "deprecated",
  },
  {
    id: "outlook-data-cycle",
    upstreamKey: "09ea213b5a69b51d",
    pattern: /\[data-outlook-cycle/i,
    surface: "selector",
    clientIds: ["outlook-ios", "outlook-android"],
    description: "Deprecated Outlook cycle data attribute",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: true,
    lint: "deprecated",
  },
  {
    id: "outlook-olm-fragment",
    upstreamKey: "4c4611530c6831d5",
    pattern: /\.olm-fragment-custom/i,
    surface: "selector",
    clientIds: ["outlook-ios"],
    description: "Deprecated Outlook mobile fragment class",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: true,
    lint: "deprecated",
  },
  {
    id: "windows-mail-ms-pseudo",
    upstreamKey: "8e3f6975b90639d6",
    pattern: /_:-ms-(input-placeholder|fullscreen)/i,
    surface: "selector",
    clientIds: [],
    description: "Deprecated Windows Mail :-ms selector",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: true,
    lint: "deprecated",
  },
  {
    id: "thunderbird-moz-media",
    upstreamKey: "9aa9ed82b4eaf8e5",
    pattern: /(-moz-device-pixel-ratio|-moz-windows-compositor)/i,
    surface: "atrule",
    clientIds: ["thunderbird"],
    description: "Thunderbird / Gecko proprietary media queries",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: false,
    lint: "strict",
  },
  {
    id: "ios-webkit-overflow-scrolling",
    upstreamKey: "f59776b57b5c7fce",
    pattern: /-webkit-overflow-scrolling\s*:\s*touch/i,
    surface: "atrule",
    clientIds: ["apple-mail-ios"],
    description: "iOS WebKit feature query",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: false,
    lint: "strict",
  },
  {
    id: "outlook-pwa-display-mode",
    upstreamKey: "7d7c5718571872ae",
    pattern: /display-mode\s*:\s*standalone/i,
    surface: "atrule",
    clientIds: ["outlook-web"],
    description: "Outlook PWA display-mode media query",
    foundIn: "style-block",
    scopesCompatibility: true,
    preserveOnInline: false,
    lint: "strict",
  },
  {
    id: "android-pointer-media",
    upstreamKey: "372724857814ab35",
    pattern: /\(\s*pointer\s*\)/,
    surface: "atrule",
    clientIds: ["gmail-android", "samsung-mail"],
    description: "Deprecated Android (pointer) media query",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: false,
    lint: "deprecated",
  },
  {
    id: "yahoo-media-token",
    upstreamKey: "430450891ca59e5d",
    pattern: /\byahoo\b/i,
    surface: "atrule",
    clientIds: ["yahoo-mail"],
    description: "Deprecated Yahoo media-query token",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: false,
    lint: "deprecated",
  },
  {
    id: "outlook-min-resolution-1dpi",
    upstreamKey: "b950d36a3c3daeea",
    pattern: /min-resolution\s*:\s*1dpi/i,
    surface: "atrule",
    clientIds: ["outlook-windows", "outlook-windows-legacy", "outlook-web"],
    description: "Deprecated Outlook min-resolution: 1dpi query",
    foundIn: "style-block",
    scopesCompatibility: false,
    preserveOnInline: false,
    lint: "deprecated",
  },
  {
    id: "mso-conditional-comment",
    upstreamKey: "4436f65f125bcffb",
    pattern: /<!--\[if\s+(?:mso|ie|[gl]te?\s+mso)/i,
    surface: "html",
    clientIds: ["outlook-windows-legacy", "outlook-windows"],
    description: "MSO / IE conditional comments",
    foundIn: "conditional-comment",
    scopesCompatibility: false,
    preserveOnInline: false,
    lint: "none",
  },
  {
    id: "deprecated-proprietary-conditional",
    upstreamKey: "6ffe2428e64e0594",
    pattern: /<!--\[if\s+(tonline|orange|gmx|webde)/i,
    surface: "html",
    clientIds: [],
    description: "Deprecated proprietary conditional comments",
    foundIn: "conditional-comment",
    scopesCompatibility: false,
    preserveOnInline: false,
    lint: "deprecated",
  },
  {
    id: "css-null-byte",
    upstreamKey: "10666206ce53d5b4",
    pattern: /\\0/,
    surface: "html",
    clientIds: ["outlook-windows"],
    description: "Null-byte CSS hack",
    foundIn: "inline-style",
    scopesCompatibility: false,
    preserveOnInline: false,
    lint: "deprecated",
  },
  {
    id: "yahoo-star-id",
    upstreamKey: "7461e0b48ad8b10d",
    pattern: /id=["']?★/i,
    surface: "html",
    clientIds: ["yahoo-mail"],
    description: "Deprecated Unicode star ID hack",
    foundIn: "inline-style",
    scopesCompatibility: false,
    preserveOnInline: false,
    lint: "deprecated",
  },
];

const HACK_BY_KEY = new Map(TARGETING_HACKS.map((h) => [h.key, h]));

export function targetingHackForMatcher(matcher: TargetingMatcher): TargetingHack | undefined {
  return HACK_BY_KEY.get(matcher.upstreamKey);
}

export const SELECTOR_MATCHERS = TARGETING_MATCHERS.filter((m) => m.surface === "selector");
export const ATRULE_MATCHERS = TARGETING_MATCHERS.filter((m) => m.surface === "atrule");
export const HTML_MATCHERS = TARGETING_MATCHERS.filter((m) => m.surface === "html");

function scopedClientIds(surface: TargetingMatcher["surface"], text: string): readonly string[] | null {
  const hits: TargetingMatcher[] = [];
  for (const matcher of TARGETING_MATCHERS) {
    if (matcher.surface !== surface || !matcher.scopesCompatibility || matcher.clientIds.length === 0) continue;
    matcher.pattern.lastIndex = 0;
    if (!matcher.pattern.test(text)) continue;
    hits.push(matcher);
  }
  if (hits.length === 0) return null;
  // Nested Gmail wrappers both match `u + .body`; keep the longest pattern.
  const max = Math.max(...hits.map((h) => h.pattern.source.length));
  const ids = new Set<string>();
  for (const matcher of hits) {
    if (matcher.pattern.source.length !== max) continue;
    for (const id of matcher.clientIds) ids.add(id);
  }
  return [...ids];
}

export function detectSelectorTargetingScope(selectorText: string): readonly string[] | null {
  return scopedClientIds("selector", selectorText);
}

export function detectSelectorListTargetingScope(selectors: readonly string[]): readonly string[] | null {
  if (selectors.length === 0) return null;
  const clientSet = new Set<string>();
  for (const sel of selectors) {
    const scope = detectSelectorTargetingScope(sel);
    if (!scope || scope.length === 0) return null;
    for (const id of scope) clientSet.add(id);
  }
  return [...clientSet];
}

export function detectAtRuleTargetingScope(preludeText: string): readonly string[] | null {
  return scopedClientIds("atrule", preludeText);
}

export function inlineTargetingScope($el: { is: (sel: string) => boolean }): readonly string[] | null {
  for (const matcher of TARGETING_MATCHERS) {
    if (!matcher.inlineCheerio) continue;
    if ($el.is(matcher.inlineCheerio)) return matcher.clientIds;
  }
  return null;
}

export function shouldPreserveSelector(selectorText: string): boolean {
  return SELECTOR_MATCHERS.some((m) => m.preserveOnInline && m.pattern.test(selectorText));
}

export function applyTargetingSimulation($: CheerioAPI, clientId: string): void {
  for (const matcher of TARGETING_MATCHERS) {
    if (!matcher.simulate || !matcher.clientIds.includes(clientId)) continue;
    const sim = matcher.simulate;
    if (sim.kind === "wrap-body") {
      const body = $("body");
      if (body.length === 0) continue;
      if (sim.id) {
        if ($(`#${sim.id}`).length > 0) continue;
        body.wrapInner(`<div id="${sim.id}"></div>`);
      } else if (sim.className) {
        if ($(`.${sim.className}`).length > 0) continue;
        body.wrapInner(`<div class="${sim.className}"></div>`);
      }
      continue;
    }
    if (sim.if && $(sim.if).length === 0) continue;
    if (sim.unless && $(sim.unless).length > 0) continue;
    if (sim.kind === "wrap-then-insert") {
      const body = $("body").first();
      if (body.length === 0) continue;
      body.wrap(sim.wrapHtml);
      body.before(sim.html);
    } else {
      $("body").first().before(sim.html);
    }
  }
}

export function matcherUpstreamKeys(): string[] {
  return TARGETING_MATCHERS.map((m) => m.upstreamKey);
}

export function getTargetingHacksForClient(clientId: string): TargetingHack[] {
  const keys = new Set(
    TARGETING_MATCHERS.filter((m) => m.clientIds.includes(clientId)).map((m) => m.upstreamKey),
  );
  return TARGETING_HACKS.filter((h) => keys.has(h.key));
}

export function getWorkingTargetingHacks(): TargetingHack[] {
  return TARGETING_HACKS.filter((h) => h.status === "working");
}
