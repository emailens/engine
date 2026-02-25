import { describe, test, expect } from "bun:test";
import {
  analyzeEmail,
  generateCompatibilityScore,
  transformForClient,
  transformForAllClients,
  simulateDarkMode,
  diffResults,
  EMAIL_CLIENTS,
  getClient,
  getCodeFix,
} from "../index";

// ============================================================================
// Analyzer tests
// ============================================================================

describe("analyzeEmail", () => {
  test("detects <style> blocks as partial support in Gmail", () => {
    const html = `<html><head><style>.test { color: red; }</style></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    const gmailStyleWarning = warnings.find(
      (w) => w.client === "gmail-web" && w.property === "<style>"
    );
    expect(gmailStyleWarning).toBeDefined();
    expect(gmailStyleWarning!.severity).toBe("warning");
  });

  test("detects <link> stylesheets", () => {
    const html = `<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    const linkWarnings = warnings.filter((w) => w.property === "<link>");
    expect(linkWarnings.length).toBeGreaterThan(0);
  });

  test("detects SVG elements", () => {
    const html = `<html><body><svg><circle r="10" /></svg></body></html>`;
    const warnings = analyzeEmail(html);
    const svgWarnings = warnings.filter((w) => w.property === "<svg>");
    expect(svgWarnings.length).toBeGreaterThan(0);
  });

  test("detects form elements", () => {
    const html = `<html><body><form><input type="text"><button type="submit">Go</button></form></body></html>`;
    const warnings = analyzeEmail(html);
    const formWarnings = warnings.filter((w) => w.property === "<form>");
    expect(formWarnings.length).toBeGreaterThan(0);
  });

  test("detects @font-face in <style> blocks (not text content)", () => {
    const htmlWithFontFace = `<html><head><style>@font-face { font-family: "Custom"; src: url(font.woff2); }</style></head><body></body></html>`;
    const warnings = analyzeEmail(htmlWithFontFace);
    const fontWarnings = warnings.filter((w) => w.property === "@font-face");
    expect(fontWarnings.length).toBeGreaterThan(0);
  });

  test("does NOT false-positive on @font-face in text content", () => {
    const htmlWithText = `<html><body><p>Use @font-face to load custom fonts</p></body></html>`;
    const warnings = analyzeEmail(htmlWithText);
    const fontWarnings = warnings.filter((w) => w.property === "@font-face");
    expect(fontWarnings.length).toBe(0);
  });

  test("detects @media queries via css-tree parsing", () => {
    const html = `<html><head><style>@media (max-width: 600px) { .mobile { font-size: 14px; } }</style></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    const mediaWarnings = warnings.filter((w) => w.property === "@media");
    expect(mediaWarnings.length).toBeGreaterThan(0);
  });

  test("detects inline style properties", () => {
    const html = `<html><body><div style="position: absolute; transform: rotate(45deg);">test</div></body></html>`;
    const warnings = analyzeEmail(html);
    const positionWarnings = warnings.filter((w) => w.property === "position");
    expect(positionWarnings.length).toBeGreaterThan(0);
    const transformWarnings = warnings.filter((w) => w.property === "transform");
    expect(transformWarnings.length).toBeGreaterThan(0);
  });

  test("returns no warnings for simple, compatible HTML", () => {
    const html = `<html><body><table><tr><td style="color: red; padding: 10px;">Hello</td></tr></table></body></html>`;
    const warnings = analyzeEmail(html);
    // Should have no errors (color and padding are universally supported)
    const errors = warnings.filter((w) => w.severity === "error");
    expect(errors.length).toBe(0);
  });

  test("sorts warnings: errors first, then warnings, then info", () => {
    const html = `<html><head><style>.x { position: absolute; }</style></head><body><svg></svg><div style="box-shadow: 1px 1px black;"></div></body></html>`;
    const warnings = analyzeEmail(html);
    if (warnings.length > 1) {
      for (let i = 1; i < warnings.length; i++) {
        const order = { error: 0, warning: 1, info: 2 } as const;
        const prev = order[warnings[i - 1].severity];
        const curr = order[warnings[i].severity];
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });
});

describe("getCodeFix — framework-aware resolution", () => {
  test("jsx: display:flex + outlook returns Row/Column fix (tier 1)", () => {
    const fix = getCodeFix("display:flex", "outlook-windows", "jsx");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("Row");
    expect(fix!.after).toContain("Column");
    expect(fix!.after).toContain("@react-email/components");
  });

  test("jsx: display:grid returns Row/Column fix (tier 2 — no client prefix)", () => {
    const fix = getCodeFix("display:grid", "gmail-web", "jsx");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("Row");
    expect(fix!.after).toContain("Column");
  });

  test("jsx: @font-face returns Font component fix (tier 2)", () => {
    const fix = getCodeFix("@font-face", "gmail-android", "jsx");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("Font");
    expect(fix!.after).toContain("@react-email/components");
  });

  test("mjml: @font-face returns mj-font fix (tier 2)", () => {
    const fix = getCodeFix("@font-face", "gmail-android", "mjml");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("mj-font");
    expect(fix!.after).toContain("mj-head");
  });

  test("mjml: border-radius + outlook returns MJML limitation guidance (tier 1)", () => {
    const fix = getCodeFix("border-radius", "outlook-windows", "mjml");
    expect(fix).toBeDefined();
    expect(fix!.description).toMatch(/limitation/i);
  });

  test("no framework (undefined): display:flex + outlook returns VML/table fix (tier 3 fallback)", () => {
    const fix = getCodeFix("display:flex", "outlook-windows", undefined);
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("<!--[if mso]>");
    expect(fix!.after).toContain("<table");
    expect(fix!.after).not.toContain("@react-email/components");
  });

  test("undefined framework: display:flex + outlook returns HTML table fix (backward compat)", () => {
    const fix = getCodeFix("display:flex", "outlook-windows");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("<!--[if mso]>");
    expect(fix!.after).not.toContain("@react-email/components");
  });

  test("maizzle: display:flex + outlook returns Tailwind/MSO conditional fix (tier 1)", () => {
    const fix = getCodeFix("display:flex", "outlook-windows", "maizzle");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("<!--[if mso]>");
    expect(fix!.after).toContain("class=");
  });

  test("maizzle: @font-face returns googleFonts config guidance (tier 2)", () => {
    const fix = getCodeFix("@font-face", "gmail-web", "maizzle");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("googleFonts");
    expect(fix!.after).toContain("config.js");
  });

  test("unknown framework falls back gracefully to html fix", () => {
    // @ts-expect-error — intentional unknown framework for runtime fallback test
    const fix = getCodeFix("display:flex", "outlook-windows", "unknown-framework");
    expect(fix).toBeDefined();
    expect(fix!.after).toContain("<!--[if mso]>");
  });

  test("property with no fix returns undefined regardless of framework", () => {
    const fix = getCodeFix("some-unsupported-property", "gmail-web", "jsx");
    expect(fix).toBeUndefined();
  });
});

describe("analyzeEmail — framework-aware fixes", () => {
  const flexHtml = `<html><body><div style="display: flex; gap: 16px;"><div>A</div><div>B</div></div></body></html>`;
  const fontHtml = `<html><head><style>@font-face { font-family: "Custom"; src: url(font.woff2); }</style></head><body></body></html>`;

  test("jsx: display:flex warning for outlook contains Row/Column fix", () => {
    const warnings = analyzeEmail(flexHtml, "jsx");
    const outlookFlexWarn = warnings.find(
      (w) => w.client === "outlook-windows" && w.property === "display:flex"
    );
    expect(outlookFlexWarn).toBeDefined();
    expect(outlookFlexWarn!.fix).toBeDefined();
    expect(outlookFlexWarn!.fix!.after).toContain("Row");
    expect(outlookFlexWarn!.fix!.after).toContain("@react-email/components");
  });

  test("mjml: @font-face warning contains mj-font fix", () => {
    const warnings = analyzeEmail(fontHtml, "mjml");
    const fontWarn = warnings.find((w) => w.property === "@font-face");
    expect(fontWarn).toBeDefined();
    expect(fontWarn!.fix).toBeDefined();
    expect(fontWarn!.fix!.after).toContain("mj-font");
  });

  test("no framework: display:flex warning for outlook returns VML table fix (backward compat)", () => {
    const warnings = analyzeEmail(flexHtml);
    const outlookFlexWarn = warnings.find(
      (w) => w.client === "outlook-windows" && w.property === "display:flex"
    );
    expect(outlookFlexWarn).toBeDefined();
    expect(outlookFlexWarn!.fix).toBeDefined();
    expect(outlookFlexWarn!.fix!.after).toContain("<!--[if mso]>");
    expect(outlookFlexWarn!.fix!.after).not.toContain("@react-email/components");
  });

  test("no framework: behaves identically to explicit undefined", () => {
    const withUndefined = analyzeEmail(flexHtml, undefined);
    const withNone = analyzeEmail(flexHtml);
    const undefinedFix = withUndefined.find(
      (w) => w.client === "outlook-windows" && w.property === "display:flex"
    )?.fix;
    const noneFix = withNone.find(
      (w) => w.client === "outlook-windows" && w.property === "display:flex"
    )?.fix;
    expect(undefinedFix?.after).toEqual(noneFix?.after);
  });

  test("maizzle: @font-face warning contains googleFonts config guidance", () => {
    const warnings = analyzeEmail(fontHtml, "maizzle");
    const fontWarn = warnings.find((w) => w.property === "@font-face");
    expect(fontWarn).toBeDefined();
    expect(fontWarn!.fix!.after).toContain("googleFonts");
  });

  test("jsx: linear-gradient in inline style gets framework-specific fix (regression: missing framework arg)", () => {
    const gradientHtml = `<html><body><div style="background: linear-gradient(#e66465, #9198e5);">test</div></body></html>`;
    const warnings = analyzeEmail(gradientHtml, "jsx");
    const gradientWarn = warnings.find((w) => w.property === "linear-gradient");
    expect(gradientWarn).toBeDefined();
    // Fix should exist (previously undefined due to missing framework arg on line 222)
    expect(gradientWarn!.fix).toBeDefined();
  });
});

describe("generateCompatibilityScore", () => {
  test("returns scores for all clients", () => {
    const warnings = analyzeEmail(`<html><head><style>.x{}</style></head><body></body></html>`);
    const scores = generateCompatibilityScore(warnings);
    for (const client of EMAIL_CLIENTS) {
      expect(scores[client.id]).toBeDefined();
      expect(scores[client.id].score).toBeGreaterThanOrEqual(0);
      expect(scores[client.id].score).toBeLessThanOrEqual(100);
    }
  });

  test("gives 100 for clean, compatible HTML", () => {
    const html = `<html><body><table><tr><td>Hello</td></tr></table></body></html>`;
    const warnings = analyzeEmail(html);
    const scores = generateCompatibilityScore(warnings);
    // Apple Mail should be 100 (most compatible)
    expect(scores["apple-mail-macos"].score).toBe(100);
  });

  test("penalizes errors more than warnings", () => {
    const warnings = analyzeEmail(`<html><head><style>.x{}</style></head><body><svg></svg></body></html>`);
    const scores = generateCompatibilityScore(warnings);
    // Gmail has <style> (warning/partial) and <svg> (error) issues
    expect(scores["gmail-web"].score).toBeLessThan(100);
  });
});

// ============================================================================
// Transformer tests
// ============================================================================

describe("transformForClient", () => {
  test("Gmail strips <style> blocks", () => {
    const html = `<html><head><style>.red { color: red; }</style></head><body><p class="red">Test</p></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).not.toContain("<style>");
    // Style should be inlined onto the element (css-tree may compact spacing)
    expect(result.html).toMatch(/color:\s*red/);
  });

  test("Gmail strips <link> elements", () => {
    const html = `<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).not.toContain("<link");
  });

  test("Gmail removes SVG and replaces with img", () => {
    const html = `<html><body><svg><circle r="10"/></svg></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).not.toContain("<svg>");
    expect(result.html).toContain("<img");
  });

  test("Gmail strips unsupported inline CSS properties", () => {
    const html = `<html><body><div style="position: absolute; color: red; box-shadow: 1px 1px black;">test</div></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).not.toContain("position");
    expect(result.html).not.toContain("box-shadow");
    expect(result.html).toContain("color: red");
  });

  test("Outlook Windows strips border-radius, box-shadow, max-width", () => {
    const html = `<html><body><div style="border-radius: 8px; box-shadow: 1px 1px black; max-width: 600px; color: red;">test</div></body></html>`;
    const result = transformForClient(html, "outlook-windows");
    expect(result.html).not.toContain("border-radius");
    expect(result.html).not.toContain("box-shadow");
    expect(result.html).not.toContain("max-width");
    expect(result.html).toContain("color: red");
  });

  test("Apple Mail passes through with minimal changes", () => {
    const html = `<html><body><div style="border-radius: 8px; color: red;">test</div></body></html>`;
    const result = transformForClient(html, "apple-mail-macos");
    expect(result.html).toContain("border-radius");
    expect(result.html).toContain("color: red");
    expect(result.warnings.filter((w) => w.severity === "error").length).toBe(0);
  });

  test("handles unknown client gracefully", () => {
    const html = `<html><body>test</body></html>`;
    const result = transformForClient(html, "nonexistent-client");
    expect(result.clientId).toBe("nonexistent-client");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].severity).toBe("info");
  });
});

describe("transformForAllClients", () => {
  test("returns results for all clients", () => {
    const html = `<html><body><p>Hello</p></body></html>`;
    const results = transformForAllClients(html);
    expect(results.length).toBe(EMAIL_CLIENTS.length);
  });

  test("each result has valid clientId", () => {
    const html = `<html><body><p>Hello</p></body></html>`;
    const results = transformForAllClients(html);
    const clientIds = EMAIL_CLIENTS.map((c) => c.id);
    for (const result of results) {
      expect(clientIds).toContain(result.clientId);
    }
  });
});

// ============================================================================
// CSS inlining tests (via Gmail transform which inlines then strips <style>)
// ============================================================================

describe("CSS inlining", () => {
  test("inlines simple class selectors", () => {
    const html = `<html><head><style>.red { color: red; }</style></head><body><p class="red">Test</p></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).toMatch(/color:\s*red/);
  });

  test("handles media queries without breaking", () => {
    const html = `<html><head><style>
      .test { color: blue; }
      @media (max-width: 600px) {
        .test { font-size: 14px; }
      }
      .other { background: green; }
    </style></head><body><p class="test">Test</p><p class="other">Other</p></body></html>`;
    const result = transformForClient(html, "gmail-web");
    // Should inline .test and .other without crashing on @media
    expect(result.html).toMatch(/color:\s*blue/);
    expect(result.html).toMatch(/background:\s*green/);
  });

  test("handles CSS comments without breaking", () => {
    const html = `<html><head><style>
      /* This is a comment */
      .test { color: red; }
    </style></head><body><p class="test">Test</p></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).toMatch(/color:\s*red/);
  });

  test("handles multi-selector rules", () => {
    const html = `<html><head><style>h1, h2, .heading { color: navy; }</style></head><body><h1>Title</h1><h2>Subtitle</h2></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).toMatch(/color:\s*navy/);
  });
});

// ============================================================================
// Dark mode tests
// ============================================================================

describe("simulateDarkMode", () => {
  test("warns about transparent PNG images", () => {
    const html = `<html><body><img src="logo.png" /><img src="photo.jpg" /></body></html>`;
    const result = simulateDarkMode(html, "gmail-android");
    const pngWarnings = result.warnings.filter(
      (w) => w.property === "dark-mode" && w.message.includes("transparent")
    );
    expect(pngWarnings.length).toBeGreaterThan(0);
  });

  test("applies dark background on body", () => {
    const html = `<html><body><p>Test</p></body></html>`;
    const result = simulateDarkMode(html, "gmail-android");
    expect(result.html).toContain("background-color");
    expect(result.html).toContain("#1a1a1a");
  });

  test("skips dark mode for Outlook Windows", () => {
    const html = `<html><body style="background-color: #ffffff;"><p style="color: #000000;">Test</p></body></html>`;
    const result = simulateDarkMode(html, "outlook-windows");
    // Outlook Windows has no dark mode, but body still gets the wrapper styling
    expect(result.warnings.length).toBe(0);
  });

  test("suggests prefers-color-scheme for Apple Mail", () => {
    const html = `<html><body><p>Test</p></body></html>`;
    const result = simulateDarkMode(html, "apple-mail-macos");
    const prefersWarning = result.warnings.find(
      (w) => w.message.includes("prefers-color-scheme")
    );
    expect(prefersWarning).toBeDefined();
  });
});

// ============================================================================
// Client data tests
// ============================================================================

describe("EMAIL_CLIENTS", () => {
  test("has correct number of clients", () => {
    expect(EMAIL_CLIENTS.length).toBeGreaterThanOrEqual(12);
  });

  test("each client has required fields", () => {
    for (const client of EMAIL_CLIENTS) {
      expect(client.id).toBeDefined();
      expect(client.name).toBeDefined();
      expect(["webmail", "desktop", "mobile"]).toContain(client.category);
      expect(client.engine).toBeDefined();
      expect(typeof client.darkModeSupport).toBe("boolean");
    }
  });

  test("getClient returns correct client", () => {
    const gmail = getClient("gmail-web");
    expect(gmail).toBeDefined();
    expect(gmail!.name).toBe("Gmail");
  });

  test("getClient returns undefined for unknown client", () => {
    expect(getClient("unknown")).toBeUndefined();
  });
});

// ============================================================================
// Edge case tests
// ============================================================================

describe("edge cases: empty/whitespace HTML", () => {
  test("analyzeEmail returns empty array for empty string", () => {
    expect(analyzeEmail("")).toEqual([]);
  });

  test("analyzeEmail returns empty array for whitespace-only HTML", () => {
    expect(analyzeEmail("   \n\t  ")).toEqual([]);
  });

  test("transformForClient returns empty result for empty string", () => {
    const result = transformForClient("", "gmail-web");
    expect(result.clientId).toBe("gmail-web");
    expect(result.html).toBe("");
    expect(result.warnings).toEqual([]);
  });

  test("transformForClient returns empty result for whitespace-only HTML", () => {
    const result = transformForClient("   ", "gmail-web");
    expect(result.clientId).toBe("gmail-web");
    expect(result.warnings).toEqual([]);
  });

  test("simulateDarkMode returns empty result for empty string", () => {
    const result = simulateDarkMode("", "gmail-web");
    expect(result.html).toBe("");
    expect(result.warnings).toEqual([]);
  });

  test("generateCompatibilityScore returns 100 for all clients when no warnings", () => {
    const scores = generateCompatibilityScore([]);
    for (const client of EMAIL_CLIENTS) {
      expect(scores[client.id].score).toBe(100);
      expect(scores[client.id].errors).toBe(0);
      expect(scores[client.id].warnings).toBe(0);
      expect(scores[client.id].info).toBe(0);
    }
  });
});

describe("edge cases: malformed HTML and CSS", () => {
  test("analyzeEmail handles malformed/unclosed HTML gracefully", () => {
    const html = `<html><body><div style="color: red"><p>unclosed`;
    const warnings = analyzeEmail(html);
    // Should not throw, may or may not return warnings
    expect(Array.isArray(warnings)).toBe(true);
  });

  test("transformForClient handles malformed CSS in style attribute", () => {
    const html = `<html><body><div style="color: ; position: !!!invalid; background: red;">test</div></body></html>`;
    const result = transformForClient(html, "gmail-web");
    // Should not throw
    expect(result.clientId).toBe("gmail-web");
    expect(typeof result.html).toBe("string");
  });

  test("analyzeEmail handles unparseable CSS in <style> blocks", () => {
    const html = `<html><head><style>@!invalid { broken { }}</style></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    expect(Array.isArray(warnings)).toBe(true);
  });

  test("transformForClient handles CSS with data URIs (semicolons in values)", () => {
    const html = `<html><body><div style="background: url('data:image/png;base64,abc'); color: red;">test</div></body></html>`;
    const result = transformForClient(html, "apple-mail-macos");
    // Should preserve both properties (Apple Mail keeps all)
    expect(result.html).toContain("color");
    expect(result.html).toContain("red");
  });

  test("analyzeEmail handles CSS with data URIs in inline styles", () => {
    const html = `<html><body><div style="background-image: url('data:image/svg+xml;charset=utf-8,<svg></svg>'); padding: 10px;">test</div></body></html>`;
    const warnings = analyzeEmail(html);
    // Should not throw and should detect padding
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe("edge cases: deeply nested and large HTML", () => {
  test("handles deeply nested elements", () => {
    let html = "<html><body>";
    for (let i = 0; i < 50; i++) {
      html += `<div style="padding: ${i}px;">`;
    }
    html += "content";
    for (let i = 0; i < 50; i++) {
      html += "</div>";
    }
    html += "</body></html>";

    const warnings = analyzeEmail(html);
    expect(Array.isArray(warnings)).toBe(true);

    const result = transformForClient(html, "gmail-web");
    expect(result.html).toContain("content");
  });

  test("handles HTML with many style blocks", () => {
    let styles = "";
    for (let i = 0; i < 20; i++) {
      styles += `<style>.class${i} { color: red; padding: ${i}px; }</style>`;
    }
    const html = `<html><head>${styles}</head><body><p class="class0">Test</p></body></html>`;

    const result = transformForClient(html, "gmail-web");
    // Gmail strips <style> blocks
    expect(result.html).not.toContain("<style>");
  });
});

describe("edge cases: special characters in HTML", () => {
  test("handles HTML entities in content", () => {
    const html = `<html><body><p style="color: red;">&lt;script&gt;alert('xss')&lt;/script&gt;</p></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
  });

  test("handles unicode content", () => {
    const html = `<html><body><p style="color: red;">日本語テスト 🎉 émojis</p></body></html>`;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).toContain("日本語テスト");
  });
});

describe("edge cases: score clamping", () => {
  test("score never goes below 0 with many errors", () => {
    // Create warnings that would exceed -100 penalty
    const warnings = [];
    for (let i = 0; i < 20; i++) {
      warnings.push({
        severity: "error" as const,
        client: "gmail-web",
        property: `prop${i}`,
        message: `Error ${i}`,
      });
    }
    const scores = generateCompatibilityScore(warnings);
    expect(scores["gmail-web"].score).toBe(0);
    // Other clients should still be 100
    expect(scores["apple-mail-macos"].score).toBe(100);
  });
});

// ============================================================================
// Animation sub-property detection tests
//
// transformSuperhuman and transformThunderbird must warn when animation-* or
// transition-* sub-properties appear in inline styles, not just when the
// shorthand "animation" or "transition" properties are used. Before the fix,
// elements like style="animation-duration: 2s" were silently ignored.
// ============================================================================

describe("animation sub-property detection: Superhuman", () => {
  test("warns when animation shorthand is in an inline style", () => {
    const html = `<html><body><p style="animation: spin 1s linear infinite;">Hello</p></body></html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(true);
  });

  test("warns when animation-duration sub-property is in an inline style", () => {
    const html = `<html><body><p style="animation-duration: 2s;">Hello</p></body></html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(true);
  });

  test("warns when animation-name sub-property is in an inline style", () => {
    const html = `<html><body><p style="animation-name: slide-in;">Hello</p></body></html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(true);
  });

  test("warns when transition shorthand is in an inline style", () => {
    const html = `<html><body><a style="transition: color 0.3s ease;">Link</a></body></html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(true);
  });

  test("warns when transition-delay sub-property is in an inline style", () => {
    const html = `<html><body><a style="transition-delay: 100ms;">Link</a></body></html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(true);
  });

  test("warns when transition-property sub-property is in an inline style", () => {
    const html = `<html><body><a style="transition-property: opacity;">Link</a></body></html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(true);
  });

  test("does not warn when no animation or transition properties are present", () => {
    const html = `<html><body><p style="color: red; font-size: 16px;">Hello</p></body></html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(false);
  });

  test("detects animation sub-properties in <style> blocks as well", () => {
    const html = `<html>
      <head><style>.fade { animation-duration: 0.5s; }</style></head>
      <body><p class="fade">Hello</p></body>
    </html>`;
    const result = transformForClient(html, "superhuman");
    const hasAnimationWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasAnimationWarn).toBe(true);
  });
});

describe("animation sub-property detection: Thunderbird", () => {
  test("warns when animation shorthand is in an inline style", () => {
    const html = `<html><body><p style="animation: spin 1s linear infinite;">Hello</p></body></html>`;
    const result = transformForClient(html, "thunderbird");
    const hasWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasWarn).toBe(true);
  });

  test("warns when animation-delay sub-property is in an inline style", () => {
    const html = `<html><body><p style="animation-delay: 0.2s;">Hello</p></body></html>`;
    const result = transformForClient(html, "thunderbird");
    const hasWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasWarn).toBe(true);
  });

  test("warns when transition-timing-function sub-property is in an inline style", () => {
    const html = `<html><body><a style="transition-timing-function: ease-in-out;">Link</a></body></html>`;
    const result = transformForClient(html, "thunderbird");
    const hasWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasWarn).toBe(true);
  });

  test("does not warn for static styles only", () => {
    const html = `<html><body><p style="margin: 0; padding: 20px; color: #333;">Hello</p></body></html>`;
    const result = transformForClient(html, "thunderbird");
    const hasWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasWarn).toBe(false);
  });

  test("detects animation sub-properties in <style> blocks", () => {
    const html = `<html>
      <head><style>p { transition-duration: 0.3s; }</style></head>
      <body><p>Hello</p></body>
    </html>`;
    const result = transformForClient(html, "thunderbird");
    const hasWarn = result.warnings.some(
      (w) => w.property === "animation"
    );
    expect(hasWarn).toBe(true);
  });
});

describe("edge cases: diffResults", () => {
  test("handles empty before and after", () => {
    const diffs = diffResults(
      { scores: {}, warnings: [] },
      { scores: {}, warnings: [] }
    );
    expect(diffs.length).toBe(EMAIL_CLIENTS.length);
    for (const diff of diffs) {
      expect(diff.scoreBefore).toBe(100); // defaults to 100
      expect(diff.scoreAfter).toBe(100);
      expect(diff.scoreDelta).toBe(0);
      expect(diff.fixed).toEqual([]);
      expect(diff.introduced).toEqual([]);
    }
  });

  test("detects fixed warnings", () => {
    const before = {
      scores: { "gmail-web": { score: 80, errors: 0, warnings: 4, info: 0 } },
      warnings: [
        { severity: "warning" as const, client: "gmail-web", property: "position", message: "bad" },
      ],
    };
    const after = {
      scores: { "gmail-web": { score: 100, errors: 0, warnings: 0, info: 0 } },
      warnings: [],
    };
    const diffs = diffResults(before, after);
    const gmailDiff = diffs.find((d) => d.clientId === "gmail-web")!;
    expect(gmailDiff.fixed.length).toBe(1);
    expect(gmailDiff.introduced.length).toBe(0);
    expect(gmailDiff.scoreDelta).toBe(20);
  });

  test("detects introduced warnings", () => {
    const before = {
      scores: { "gmail-web": { score: 100, errors: 0, warnings: 0, info: 0 } },
      warnings: [],
    };
    const after = {
      scores: { "gmail-web": { score: 85, errors: 1, warnings: 0, info: 0 } },
      warnings: [
        { severity: "error" as const, client: "gmail-web", property: "<svg>", message: "bad" },
      ],
    };
    const diffs = diffResults(before, after);
    const gmailDiff = diffs.find((d) => d.clientId === "gmail-web")!;
    expect(gmailDiff.introduced.length).toBe(1);
    expect(gmailDiff.fixed.length).toBe(0);
    expect(gmailDiff.scoreDelta).toBe(-15);
  });
});
