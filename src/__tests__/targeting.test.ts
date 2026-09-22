import { describe, it, expect } from "bun:test";
import {
  TARGETING_HACKS,
  TARGETING_MATCHERS,
  getTargetingHacksForClient,
  getWorkingTargetingHacks,
  checkTargetingHacks,
  detectSelectorListTargetingScope,
  transformForClient,
  analyzeEmail,
  generateCompatibilityScore,
  auditEmail,
  createSession,
} from "../index";

describe("Targeting Hacks Catalog", () => {
  it("loads all targeting hacks with valid properties", () => {
    expect(TARGETING_HACKS.length).toBeGreaterThanOrEqual(70);
    const working = getWorkingTargetingHacks();
    expect(working.length).toBeGreaterThan(40);

    for (const hack of TARGETING_HACKS) {
      expect(hack.key).toBeTruthy();
      expect(hack.client).toBeTruthy();
      expect(hack.code).toBeTruthy();
      expect(["working", "deprecated"]).toContain(hack.status);
    }
  });

  it("pins every matcher to a catalog key", () => {
    const keys = new Set(TARGETING_HACKS.map((h) => h.key));
    for (const matcher of TARGETING_MATCHERS) {
      expect(keys.has(matcher.upstreamKey)).toBe(true);
    }
  });

  it("filters hacks by client correctly", () => {
    const gmailHacks = getTargetingHacksForClient("gmail-web");
    expect(gmailHacks.length).toBeGreaterThan(0);

    const outlookHacks = getTargetingHacksForClient("outlook-web");
    expect(outlookHacks.length).toBeGreaterThan(0);

    const appleHacks = getTargetingHacksForClient("apple-mail-ios");
    expect(appleHacks.length).toBeGreaterThan(0);
  });
});

describe("checkTargetingHacks Linter", () => {
  it("detects MSO conditional comments", () => {
    const html = '<div><!--[if mso]><p>Outlook only</p><![endif]--></div>';
    const report = checkTargetingHacks(html);
    expect(report.detectedHacks.some(d => d.foundIn === "conditional-comment")).toBe(true);
  });

  it("detects Gmail u + .body selector hack", () => {
    const html = `<style>u + .body .cta { color: red; }</style><div class="body"><div class="cta">Button</div></div>`;
    const report = checkTargetingHacks(html);
    expect(report.detectedHacks.some(d => /u\s*\+\s*\.body/.test(d.matchedText))).toBe(true);
    expect(report.warnings.length).toBe(0);
  });

  it("detects Gmail Android div > u + .body selector hack", () => {
    const html = `<style>div > u + .body .cta { color: red; }</style><div class="body"><div class="cta">Button</div></div>`;
    const report = checkTargetingHacks(html);
    expect(report.detectedHacks.some((d) => /div\s*>\s*u\s*\+\s*\.body/.test(d.matchedText))).toBe(true);
  });

  it("emits warning for deprecated client hack", () => {
    const html = `<style>_:-webkit-full-screen, :root .card { background: blue; }</style><div class="card">Card</div>`;
    const report = checkTargetingHacks(html);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings[0].message).toContain("Deprecated email client hack detected");
  });
});

describe("transformForClient with Targeting Selectors", () => {
  it("preserves u + .body during inlining and applies it for Gmail", () => {
    const html = `<!DOCTYPE html><html><head><style>u + .body .btn { color: #ff0000; }</style></head><body class="body"><div class="btn">Test</div></body></html>`;
    const result = transformForClient(html, "gmail-web");
    // Should contain the style block with preserved u+.body or u + .body selector
    expect(/u\s*\+\s*\.body/.test(result.html)).toBe(true);
    // Should simulate the <u></u> tag
    expect(result.html).toContain("<u></u>");
  });

  it("simulates #MessageWebViewDiv for Samsung Mail", () => {
    const html = `<!DOCTYPE html><html><head><style>#MessageWebViewDiv .card { padding: 10px; }</style></head><body><div class="card">Hello</div></body></html>`;
    const result = transformForClient(html, "samsung-mail");
    expect(result.html).toContain('id="MessageWebViewDiv"');
  });

  it("simulates div > u + .body for Gmail Android", () => {
    const html = `<!DOCTYPE html><html><head><style>div > u + .body .btn { color: #ff0000; }</style></head><body class="body"><div class="btn">Test</div></body></html>`;
    const result = transformForClient(html, "gmail-android");
    expect(/div[\s\S]*<u><\/u>[\s\S]*class="body"/.test(result.html) || result.html.includes("<u></u>")).toBe(true);
    expect(/u\s*\+\s*\.body/.test(result.html)).toBe(true);
  });

  it("simulates #proton-root and .ShadowHTML wrappers", () => {
    const html = `<!DOCTYPE html><html><head><style>#proton-root .a { color: red; } .ShadowHTML .b { color: blue; }</style></head><body><div class="a b">x</div></body></html>`;
    expect(transformForClient(html, "protonmail").html).toContain('id="proton-root"');
    expect(transformForClient(html, "superhuman").html).toContain("ShadowHTML");
  });
});

describe("analyzeEmail Targeting Scoping & False Positive Suppression", () => {
  it("suppresses Outlook warnings for properties inside Gmail-only targeting wrapper", () => {
    const targetedHtml = `<!DOCTYPE html><html><head><style>u + .body .btn { border-radius: 8px; }</style></head><body><div class="body"><div class="btn">Button</div></div></body></html>`;
    const targetedWarnings = analyzeEmail(targetedHtml);
    // Outlook does not support border-radius, but border-radius is scoped strictly to Gmail!
    // So Outlook should NOT have a warning for border-radius.
    const outlookRadiusWarning = targetedWarnings.find(
      (w) => w.client.startsWith("outlook") && w.property === "border-radius"
    );
    expect(outlookRadiusWarning).toBeUndefined();
  });

  it("still emits Outlook warnings for properties declared globally", () => {
    const globalHtml = `<!DOCTYPE html><html><head><style>.btn { border-radius: 8px; }</style></head><body><div class="btn">Button</div></body></html>`;
    const globalWarnings = analyzeEmail(globalHtml);
    const outlookRadiusWarning = globalWarnings.find(
      (w) => w.client === "outlook-windows" && w.property === "border-radius"
    );
    expect(outlookRadiusWarning).toBeDefined();
  });

  it("does not fold targeting findings into compatibility warnings", () => {
    const depHtml = `<!DOCTYPE html><html><head><style>_:-webkit-full-screen, :root .card { background: blue; }</style></head><body><div class="card">Card</div></body></html>`;
    const warnings = analyzeEmail(depHtml);
    expect(warnings.find((w) => w.property === "css-hack")).toBeUndefined();
    const report = checkTargetingHacks(depHtml);
    expect(report.warnings.find((w) => w.property === "css-hack")).toBeDefined();
  });

  it("scopes [data-ogsc] styles to Outlook and provides code fixes", () => {
    const html = `<!DOCTYPE html><html><head><style>[data-ogsc] .heading { color: #ffffff !important; }</style></head><body><div class="heading">Title</div></body></html>`;
    const warnings = analyzeEmail(html);
    // [data-ogsc] targets Outlook Web / iOS / Android, so clients like Apple Mail or Gmail don't get warnings
    const nonOutlookWarning = warnings.find((w) => w.client === "apple-mail-macos" && w.property === "color");
    expect(nonOutlookWarning).toBeUndefined();
  });
});

describe("Targeting Fix Snippets & Suggestions", () => {
  it("provides code fix and suggestion for css-hack", () => {
    const { getCodeFix, getSuggestion } = require("../index");
    const fix = getCodeFix("css-hack", "outlook-windows");
    expect(fix).toBeDefined();
    expect(fix.description).toContain("deprecated");

    const sug = getSuggestion("css-hack", "outlook-windows");
    expect(sug).toBeDefined();
    expect(sug.text).toContain("Deprecated");
  });

  it("provides code fix and suggestion for [data-ogsc] and [data-ogsb]", () => {
    const { getCodeFix, getSuggestion } = require("../index");
    const fixOgsc = getCodeFix("[data-ogsc]", "outlook-web");
    expect(fixOgsc).toBeDefined();
    expect(fixOgsc.after).toContain("[data-ogsc]");

    const fixOgsb = getCodeFix("[data-ogsb]", "outlook-web");
    expect(fixOgsb).toBeDefined();
    expect(fixOgsb.after).toContain("[data-ogsb]");
  });
});

describe("Selector-Level Granularity (Comma-Separated Selectors)", () => {
  it("detectSelectorListTargetingScope correctly evaluates list of selectors", () => {
    expect(detectSelectorListTargetingScope([])).toBeNull();
    // One global selector invalidates targeting scope for the whole rule
    expect(detectSelectorListTargetingScope([".global-btn", "u + .body .btn"])).toBeNull();
    expect(detectSelectorListTargetingScope(["u + .body .btn", ".container"])).toBeNull();

    // Single targeted selector
    expect(detectSelectorListTargetingScope(["u + .body .btn"])).toEqual(["gmail-web"]);
    expect(detectSelectorListTargetingScope(["div > u + .body .btn"])).toEqual(["gmail-android"]);
    expect(detectSelectorListTargetingScope(["div > u + .body .btn"])).not.toContain("gmail-web");

    // Multiple targeted selectors for same client
    expect(detectSelectorListTargetingScope(["u + .body .btn", "u + #body .btn"])).toEqual(["gmail-web"]);

    // Multiple targeted selectors combining clients
    const combined = detectSelectorListTargetingScope(["[data-ogsc] .btn", "#MessageWebViewDiv .btn"]);
    expect(combined).toContain("outlook-web");
    expect(combined).toContain("samsung-mail");
  });

  it("still emits Outlook warning when a rule mixes global and targeted selectors", () => {
    const mixedHtml = `<!DOCTYPE html><html><head><style>.global-btn, u + .body .btn { border-radius: 8px; }</style></head><body><div class="global-btn">Button</div></body></html>`;
    const warnings = analyzeEmail(mixedHtml);
    const outlookRadiusWarning = warnings.find(
      (w) => w.client === "outlook-windows" && w.property === "border-radius"
    );
    expect(outlookRadiusWarning).toBeDefined();
  });

  it("suppresses Outlook warning when ALL selectors in a comma-separated list are targeted", () => {
    const allTargetedHtml = `<!DOCTYPE html><html><head><style>u + .body .btn, u + #body .btn { border-radius: 8px; }</style></head><body><div class="body"><div class="btn">Button</div></div></body></html>`;
    const warnings = analyzeEmail(allTargetedHtml);
    const outlookRadiusWarning = warnings.find(
      (w) => w.client.startsWith("outlook") && w.property === "border-radius"
    );
    expect(outlookRadiusWarning).toBeUndefined();
  });
});

describe("TargetingPolicy Configuration", () => {
  const targetedHtml = `<!DOCTYPE html><html><head><style>u + .body .btn { border-radius: 8px; }</style></head><body><div class="body"><div class="btn">Button</div></div></body></html>`;
  const deprecatedHackHtml = `<!DOCTYPE html><html><head><style>_:-webkit-full-screen, :root .card { background: blue; }</style></head><body><div class="card">Card</div></body></html>`;

  it("progressive policy (default): suppresses false positives and warns on deprecated hacks", () => {
    // False positive suppression for working hack
    const progWarnings = analyzeEmail(targetedHtml);
    expect(progWarnings.some((w) => w.client === "outlook-windows" && w.property === "border-radius")).toBe(false);
    expect(progWarnings.some((w) => w.property === "css-hack")).toBe(false);

    const depReport = checkTargetingHacks(deprecatedHackHtml);
    const hackWarn = depReport.warnings.find((w) => w.property === "css-hack");
    expect(hackWarn).toBeDefined();
    expect(hackWarn?.severity).toBe("warning");
  });

  it("strict policy: does not suppress compatibility warnings and flags targeting hacks as info", () => {
    const strictWarnings = analyzeEmail(targetedHtml, undefined, { targetingPolicy: "strict" });

    // Does NOT suppress Outlook warning for border-radius despite u + .body
    const outlookWarning = strictWarnings.find(
      (w) => w.client === "outlook-windows" && w.property === "border-radius"
    );
    expect(outlookWarning).toBeDefined();

    // Emits info finding on the targeting hack itself
    const hackInfo = checkTargetingHacks(targetedHtml, "strict").warnings.find((w) => w.property === "css-hack");
    expect(hackInfo).toBeDefined();
    expect(hackInfo?.severity).toBe("info");
    expect(hackInfo?.message).toContain("Strict policy");
  });

  it("does not flag MSO conditionals even under strict policy", () => {
    const msoHtml = `<div><!--[if mso]><p>Outlook</p><![endif]--></div>`;
    const report = checkTargetingHacks(msoHtml, "strict");
    expect(report.detectedHacks.some((d) => d.foundIn === "conditional-comment")).toBe(true);
    expect(report.warnings.some((w) => w.property === "css-hack")).toBe(false);
  });

  it("lenient policy: suppresses false positives and ignores non-fatal warnings", () => {
    // False positive suppressed
    const lenientWarnings = analyzeEmail(targetedHtml, undefined, { targetingPolicy: "lenient" });
    expect(lenientWarnings.some((w) => w.client === "outlook-windows" && w.property === "border-radius")).toBe(false);
    expect(lenientWarnings.some((w) => w.property === "css-hack")).toBe(false);

    // Non-fatal deprecated hack is ignored
    const depWarnings = checkTargetingHacks(deprecatedHackHtml, "lenient");
    expect(depWarnings.warnings.some((w) => w.property === "css-hack")).toBe(false);
  });

  it("integrates targetingPolicy with auditEmail and createSession", () => {
    // auditEmail with strict policy
    const auditStrict = auditEmail(targetedHtml, { targetingPolicy: "strict" });
    expect(auditStrict.compatibility.warnings.some((w) => w.client === "outlook-windows" && w.property === "border-radius")).toBe(true);
    expect(auditStrict.targeting.warnings.some((w) => w.severity === "info")).toBe(true);

    // createSession with strict policy
    const session = createSession(targetedHtml, { targetingPolicy: "strict" });
    const sessionWarnings = session.analyze();
    expect(sessionWarnings.some((w) => w.client === "outlook-windows" && w.property === "border-radius")).toBe(true);

    const sessionTargeting = session.checkTargeting();
    expect(sessionTargeting.warnings.some((w) => w.severity === "info")).toBe(true);
  });
});

describe("Occurrence-Aware Scoping & Advanced Client Targeting Matrix", () => {
  it("narrows warning locations to the untargeted declaration when same property appears globally and targeted", () => {
    // Line 1: global declaration (unsupported by Outlook)
    // Line 2: Gmail-targeted declaration (should NOT be underlined in Outlook's warning)
    const html = `<!DOCTYPE html><html><head><style>
.global-box { border-radius: 4px; }
u + .body .btn { border-radius: 8px; }
</style></head><body><div class="global-box"></div></body></html>`;

    const warnings = analyzeEmail(html, undefined, { positions: true });
    const outlookRadius = warnings.find((w) => w.client === "outlook-windows" && w.property === "border-radius");

    expect(outlookRadius).toBeDefined();
    // Outlook's warning must only point to the global declaration, never leaking the targeted location
    expect(outlookRadius?.locs).toBeDefined();
    expect(outlookRadius?.locs?.length).toBe(1);
    expect(outlookRadius?.locs?.[0].line).toBe(2); // .global-box line
  });

  it("suppresses warnings when multiple targeted rules declare the same property across different clients", () => {
    // border-radius used in Gmail-web AND Outlook-web (dark mode)
    // Neither targets Outlook Classic (Word engine)
    const html = `<!DOCTYPE html><html><head><style>
u + .body .btn { border-radius: 8px; }
[data-ogsc] .box { border-radius: 4px; }
</style></head><body><div class="body"><div class="btn">Click</div></div></body></html>`;

    const warnings = analyzeEmail(html);
    const outlookClassicRadius = warnings.find((w) => w.client === "outlook-windows-legacy" && w.property === "border-radius");
    expect(outlookClassicRadius).toBeUndefined();
  });

  it("scopes @supports feature query targeting to iOS WebKit clients", () => {
    // @supports (-webkit-overflow-scrolling: touch) isolates styles to apple-mail-ios
    const html = `<!DOCTYPE html><html><head><style>
@supports (-webkit-overflow-scrolling: touch) {
  .card { border-radius: 8px; }
}
</style></head><body><div class="card">iOS only</div></body></html>`;

    const warnings = analyzeEmail(html);
    // Desktop Outlook Classic does not support border-radius, but the rule is gated behind iOS WebKit feature query
    const outlookWarning = warnings.find((w) => w.client.startsWith("outlook") && w.property === "border-radius");
    expect(outlookWarning).toBeUndefined();
  });

  it("scopes pseudo-classes inside targeted rules without flagging untargeted clients", () => {
    const html = `<!DOCTYPE html><html><head><style>
u + .body .btn:hover { background-color: #0070f3; }
</style></head><body><div class="body"><div class="btn">Hover me</div></div></body></html>`;

    const warnings = analyzeEmail(html);
    // :hover is not supported in Outlook Classic, but it is scoped to Gmail Web
    const outlookHover = warnings.find((w) => w.client === "outlook-windows" && w.property === ":hover");
    expect(outlookHover).toBeUndefined();
  });

  it("scopes compound value features and functions inside targeted rules", () => {
    const html = `<!DOCTYPE html><html><head><style>
u + .body .grid-layout { display: flex; width: calc(100% - 20px); }
</style></head><body><div class="body"><div class="grid-layout">Flex</div></div></body></html>`;

    const warnings = analyzeEmail(html);
    const outlookFlex = warnings.find((w) => w.client === "outlook-windows" && w.property === "display:flex");
    const outlookCalc = warnings.find((w) => w.client === "outlook-windows" && w.property === "calc()");
    expect(outlookFlex).toBeUndefined();
    expect(outlookCalc).toBeUndefined();
  });

  it("demonstrates compatibility score recovery when moving an unsupported property into a targeted scope", () => {
    const globalHtml = `<!DOCTYPE html><html><head><style>
.btn { border-radius: 8px; }
</style></head><body><div class="btn">Button</div></body></html>`;

    const targetedHtml = `<!DOCTYPE html><html><head><style>
u + .body .btn { border-radius: 8px; }
</style></head><body><div class="body"><div class="btn">Button</div></div></body></html>`;

    const globalScore = generateCompatibilityScore(analyzeEmail(globalHtml))["outlook-windows"].score;
    const targetedScore = generateCompatibilityScore(analyzeEmail(targetedHtml))["outlook-windows"].score;

    // Outlook's score must improve because the unsupported border-radius is no longer evaluated for it
    expect(targetedScore).toBeGreaterThan(globalScore);
    expect(targetedScore).toBe(97); // 100 - 3 for <style> element warning
  });
});




