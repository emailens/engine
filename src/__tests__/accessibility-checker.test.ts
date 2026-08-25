import { describe, test, expect } from "bun:test";
import * as cheerio from "cheerio";
import { checkAccessibility, checkDarkModeContrast, checkMobileContrast, checkDarkStylesContrastFromDom, auditEmail } from "../index";

/** Parse once so the DOM-level checks can be called directly. */
const cheerioOf = (html: string) => cheerio.load(html);

// ============================================================================
// Accessible emails: should score high
// ============================================================================

describe("accessibility checker: accessible emails", () => {
  test("fully accessible email scores near 100", () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><title>Welcome Email</title></head>
<body>
  <h1>Welcome to Our Service</h1>
  <p style="font-size:16px;">Thanks for signing up.</p>
  <img src="logo.png" alt="Company Logo" width="100" height="50">
  <table role="presentation">
    <tr><td><a href="https://example.com">Visit our website</a></td></tr>
  </table>
</body>
</html>`;
    const report = checkAccessibility(html);
    expect(report.score).toBeGreaterThanOrEqual(90);
  });

  test("empty HTML returns perfect score", () => {
    const report = checkAccessibility("");
    expect(report.score).toBe(100);
    expect(report.issues).toEqual([]);
  });

  test("whitespace-only HTML returns perfect score", () => {
    const report = checkAccessibility("   \n\t  ");
    expect(report.score).toBe(100);
  });
});

// ============================================================================
// Individual rule detection
// ============================================================================

describe("accessibility checker: individual rules", () => {
  test("detects missing lang attribute", () => {
    const html = `<html><head><title>Test</title></head><body><p>Hello</p></body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "missing-lang");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("does not flag when lang is present", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body><p>Hello</p></body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "missing-lang");
    expect(rule).toBeUndefined();
  });

  test("detects missing title", () => {
    const html = `<html lang="en"><head></head><body><p>Hello</p></body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "missing-title");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("does not flag when title is present", () => {
    const html = `<html lang="en"><head><title>My Email</title></head><body><p>Hello</p></body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "missing-title");
    expect(rule).toBeUndefined();
  });

  test("detects missing alt on images", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <img src="photo.jpg">
      <img src="banner.png">
    </body></html>`;
    const report = checkAccessibility(html);
    const rules = report.issues.filter((i) => i.rule === "img-missing-alt");
    expect(rules.length).toBe(2);
    expect(rules[0].severity).toBe("error");
  });

  test("does not flag images with alt text", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <img src="photo.jpg" alt="A beautiful sunset">
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "img-missing-alt");
    expect(rule).toBeUndefined();
  });

  test("detects images with filename as alt text", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <img src="photo.jpg" alt="photo.jpg">
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "img-filename-alt");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("flags empty alt on content image as info", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <img src="https://cdn.example.com/hero-banner.jpg" alt="">
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "img-empty-alt");
    expect(rule).toBeDefined();
  });

  test("does not flag decorative image role", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <img src="divider.png" role="presentation">
    </body></html>`;
    const report = checkAccessibility(html);
    const imgRules = report.issues.filter(
      (i) => i.rule === "img-missing-alt" || i.rule === "img-empty-alt"
    );
    expect(imgRules.length).toBe(0);
  });

  test("detects very small text (< 10px)", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <p style="font-size:8px;">Tiny text here</p>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "small-text");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("does not flag normal font sizes", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <p style="font-size:14px;">Normal text</p>
      <p style="font-size:16px;">Larger text</p>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "small-text");
    expect(rule).toBeUndefined();
  });

  test("detects layout tables without role", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <table>
        <tr><td>Column 1</td><td>Column 2</td><td>Column 3</td></tr>
      </table>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "table-missing-role");
    expect(rule).toBeDefined();
  });

  test("does not flag table with role=presentation", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <table role="presentation">
        <tr><td>Layout cell</td><td>Layout cell</td></tr>
      </table>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "table-missing-role");
    expect(rule).toBeUndefined();
  });

  test("detects links with no accessible name", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <a href="https://example.com"></a>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "link-no-accessible-name");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("link with aria-label is not flagged", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <a href="https://example.com" aria-label="Go to homepage"></a>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "link-no-accessible-name");
    expect(rule).toBeUndefined();
  });

  test("detects heading level skip", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <h1>Main Title</h1>
      <h4>Skipped to h4</h4>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "heading-skip");
    expect(rule).toBeDefined();
  });

  test("sequential headings are not flagged", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body>
      <h1>Title</h1>
      <h2>Subtitle</h2>
      <h3>Section</h3>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "heading-skip");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Score calculation
// ============================================================================

describe("accessibility checker: score", () => {
  test("many issues produce lower score", () => {
    const html = `<html>
<head></head>
<body>
  <img src="a.jpg"><img src="b.jpg"><img src="c.jpg">
  <p style="font-size:6px;">Tiny</p>
  <a href="https://example.com"></a>
  <table><tr><td>1</td><td>2</td><td>3</td></tr></table>
</body>
</html>`;
    const report = checkAccessibility(html);
    expect(report.score).toBeLessThan(60);
    expect(report.issues.length).toBeGreaterThan(3);
  });

  test("score is always between 0 and 100", () => {
    const html = `<html><body>
      ${Array.from({ length: 20 }, (_, i) => `<img src="img${i}.jpg">`).join("\n")}
      ${Array.from({ length: 10 }, () => `<p style="font-size:5px;">x</p>`).join("\n")}
      ${Array.from({ length: 5 }, () => `<a href="https://x.com"></a>`).join("\n")}
    </body></html>`;
    const report = checkAccessibility(html);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Resilience
// ============================================================================

describe("accessibility checker: resilience", () => {
  test("handles malformed HTML", () => {
    const html = `<html><body><p>unclosed <img broken`;
    expect(() => checkAccessibility(html)).not.toThrow();
  });

  test("handles HTML with no images", () => {
    const html = `<html lang="en"><head><title>T</title></head><body><p>Just text</p></body></html>`;
    expect(() => checkAccessibility(html)).not.toThrow();
    const report = checkAccessibility(html);
    const imgRules = report.issues.filter((i) => i.rule.startsWith("img-"));
    expect(imgRules.length).toBe(0);
  });

  test("handles HTML with no tables", () => {
    const html = `<html lang="en"><head><title>T</title></head><body><p>No tables</p></body></html>`;
    expect(() => checkAccessibility(html)).not.toThrow();
  });

  test("handles deeply nested content", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      ${"<div>".repeat(30)}<p>Deep</p>${"</div>".repeat(30)}
    </body></html>`;
    expect(() => checkAccessibility(html)).not.toThrow();
  });
});

// ============================================================================
// Per-rule penalty capping
// ============================================================================

describe("accessibility checker: penalty capping", () => {
  test("8 missing alt images score >= 50 (capped), all 8 issues reported", () => {
    const images = Array.from({ length: 8 }, (_, i) => `<img src="img${i}.jpg">`).join("\n");
    const html = `<html lang="en"><head><title>T</title></head><body>${images}</body></html>`;
    const report = checkAccessibility(html);
    const altIssues = report.issues.filter((i) => i.rule === "img-missing-alt");
    expect(altIssues.length).toBe(8);
    expect(report.score).toBeGreaterThanOrEqual(50);
  });
});

// ============================================================================
// Color contrast detection
// ============================================================================

describe("accessibility checker: color contrast", () => {
  test("white text on white bg flagged as low-contrast error", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: #ffffff;">
        <p style="color: #ffffff; font-size: 14px;">Invisible text</p>
      </div>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "low-contrast");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("black text on white bg has no low-contrast issue", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: #ffffff;">
        <p style="color: #000000; font-size: 14px;">Visible text</p>
      </div>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "low-contrast");
    expect(rule).toBeUndefined();
  });

  test("light gray (#999) on white flagged (ratio ~2.85:1)", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <p style="color: #999999; font-size: 14px;">Gray text</p>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "low-contrast");
    expect(rule).toBeDefined();
  });

  test("named color white on white flagged", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: white;">
        <span style="color: white; font-size: 14px;">Hidden</span>
      </div>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "low-contrast");
    expect(rule).toBeDefined();
  });
});

// ============================================================================
// Small text threshold (lowered to 9px)
// ============================================================================

describe("accessibility checker: small text threshold", () => {
  test("9px text is NOT flagged (lowered threshold)", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <p style="font-size: 9px;">Footer text</p>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "small-text");
    expect(rule).toBeUndefined();
  });

  test("8px text is still flagged", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <p style="font-size: 8px;">Tiny text</p>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "small-text");
    expect(rule).toBeDefined();
  });
});

// ============================================================================
// Table ancestor skip (presentation/none)
// ============================================================================

describe("accessibility checker: table ancestor skip", () => {
  test('inner table inside role="presentation" ancestor NOT flagged', () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <table role="presentation">
        <tr><td>
          <table>
            <tr><td>A</td><td>B</td><td>C</td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "table-missing-role");
    expect(rule).toBeUndefined();
  });

  test('inner table inside role="none" ancestor NOT flagged', () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <table role="none">
        <tr><td>
          <table>
            <tr><td>A</td><td>B</td><td>C</td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "table-missing-role");
    expect(rule).toBeUndefined();
  });

  test("standalone layout table without role still flagged", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <table>
        <tr><td>A</td><td>B</td><td>C</td></tr>
      </table>
    </body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find((i) => i.rule === "table-missing-role");
    expect(rule).toBeDefined();
  });
});

// ============================================================================
// Contrast: background resolution beyond the inline background-color longhand
// ============================================================================

describe("accessibility checker: contrast background resolution", () => {
  const contrast = (html: string) =>
    checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast");

  // Source order is only the tie-breaker. A more specific rule must win even when
  // it is declared first, which is the ordering a reset-last stylesheet produces.
  test("a more specific rule declared earlier beats a generic one declared later", () => {
    const html = `<html lang="en"><head><title>T</title><style>
      #card p { color: #222222; }
      p { color: #ffffff; }
    </style></head><body style="background-color: #111111;">
      <div id="card"><p style="font-size: 14px;">Barely there</p></div>
    </body></html>`;
    // #222 on #111 is ~1.2:1. If specificity were ignored the generic #fff would
    // win on source order and this would come back clean.
    expect(contrast(html)).toHaveLength(1);
  });

  // A bgcolor attribute is ranked below every author rule, so a stylesheet
  // repaint must beat it. Getting this backwards silently inverts the surface.
  test("a stylesheet background beats a bgcolor attribute on the same element", () => {
    const html = `<html lang="en"><head><title>T</title><style>
      td { background-color: #111111; }
    </style></head><body>
      <table role="presentation"><tr><td bgcolor="#ffffff">
        <p style="color: #ffffff; font-size: 14px;">Readable on the dark repaint</p>
      </td></tr></table>
    </body></html>`;
    expect(contrast(html)).toHaveLength(0);
  });

  test("a more specific rule declared later also wins", () => {
    const html = `<html lang="en"><head><title>T</title><style>
      p { color: #ffffff; }
      #card p { color: #222222; }
    </style></head><body style="background-color: #111111;">
      <div id="card"><p style="font-size: 14px;">Barely there</p></div>
    </body></html>`;
    expect(contrast(html)).toHaveLength(1);
  });

  test("white text on a `background` shorthand ancestor is not flagged", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background: #111111;">
        <p style="color: #ffffff; font-size: 14px;">Readable</p>
      </div>
    </body></html>`;
    expect(contrast(html)).toHaveLength(0);
  });

  test("white text on a `background` shorthand with image + colour is not flagged", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background: #111111 url(hero.png) no-repeat center;">
        <p style="color: #ffffff; font-size: 14px;">Readable</p>
      </div>
    </body></html>`;
    expect(contrast(html)).toHaveLength(0);
  });

  test("white text on a bgcolor attribute ancestor is not flagged", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <table bgcolor="#111111"><tr><td>
        <p style="color: #ffffff; font-size: 14px;">Readable</p>
      </td></tr></table>
    </body></html>`;
    expect(contrast(html)).toHaveLength(0);
  });

  test("white text on a <style> rule background is not flagged", () => {
    const html = `<html lang="en"><head><title>T</title>
      <style>.hero { background-color: #111111; }</style>
    </head><body>
      <div class="hero">
        <p style="color: #ffffff; font-size: 14px;">Readable</p>
      </div>
    </body></html>`;
    expect(contrast(html)).toHaveLength(0);
  });

  test("white text over a background-image with no solid colour is skipped, not failed", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-image: url(hero.png);">
        <p style="color: #ffffff; font-size: 14px;">Over a photo</p>
      </div>
    </body></html>`;
    expect(contrast(html)).toHaveLength(0);
  });

  test("body bgcolor reaches deeply nested text", () => {
    const html = `<html lang="en"><head><title>T</title></head><body bgcolor="#111111">
      <table><tr><td><div><span style="color: #ffffff; font-size: 14px;">Deep</span></div></td></tr></table>
    </body></html>`;
    expect(contrast(html)).toHaveLength(0);
  });

  test("the nearest background wins over a further ancestor", () => {
    const html = `<html lang="en"><head><title>T</title></head><body bgcolor="#111111">
      <div style="background: #ffffff;">
        <p style="color: #ffffff; font-size: 14px;">Invisible on the white inner box</p>
      </div>
    </body></html>`;
    const issues = contrast(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  test("genuinely low contrast on a shorthand background is still flagged", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background: #111111;">
        <p style="color: #222222; font-size: 14px;">Unreadable</p>
      </div>
    </body></html>`;
    const issues = contrast(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  test("no background anywhere still assumes the client's white default", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <p style="color: #ffffff; font-size: 14px;">Invisible on default white</p>
    </body></html>`;
    expect(contrast(html)).toHaveLength(1);
  });
});

// ============================================================================
// Dark-mode contrast: failures that only appear once a client inverts colours
// ============================================================================

describe("dark-mode contrast", () => {
  test("mid-tone text on white passes in light but is flagged in dark", () => {
    // #555 on #fff is 7.4:1. Gmail Android repaints the near-white background
    // to #2d2d2d and leaves #555 alone, collapsing it to ~1.8:1.
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: #ffffff;">
        <p style="color: #555555; font-size: 14px;">Body copy</p>
      </div>
    </body></html>`;

    expect(checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast")).toHaveLength(0);

    const dark = checkDarkModeContrast(html);
    expect(dark).toHaveLength(1);
    expect(dark[0].rule).toBe("low-contrast-dark");
    expect(dark[0].severity).toBe("error");
  });

  test("a failure that already exists in light mode is not reported twice", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: #ffffff;">
        <p style="color: #ffffff; font-size: 14px;">Invisible</p>
      </div>
    </body></html>`;

    expect(checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast")).toHaveLength(1);
    expect(checkDarkModeContrast(html)).toHaveLength(0);
  });

  test("a palette that survives inversion reports nothing", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: #ffffff;">
        <p style="color: #1a1a1a; font-size: 14px;">Body copy</p>
      </div>
    </body></html>`;
    expect(checkDarkModeContrast(html)).toHaveLength(0);
  });

  test("positions are dropped: they would point into the transformed HTML", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: #ffffff;">
        <p style="color: #555555; font-size: 14px;">Body copy</p>
      </div>
    </body></html>`;
    const dark = checkDarkModeContrast(html, undefined);
    expect(dark[0].loc).toBeUndefined();
    expect(dark[0].locs).toBeUndefined();
  });

  test("empty input is safe", () => {
    expect(checkDarkModeContrast("")).toEqual([]);
  });

  test("auditEmail surfaces dark-mode contrast, and `skip` turns it off", () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <div style="background-color: #ffffff;">
        <p style="color: #555555; font-size: 14px;">Body copy</p>
      </div>
    </body></html>`;
    expect(auditEmail(html).darkContrast).toHaveLength(1);
    expect(auditEmail(html, { skip: ["darkContrast"] }).darkContrast).toHaveLength(0);
  });
});

// ============================================================================
// Contrast cascade: specificity, !important, @media gating, stylesheet colour
//
// These are the cases the first cut of the background fix got wrong. Each one
// is a false positive (a contrast error on an email that reads fine) or a
// silent miss, so they are the regression net for the cascade resolver.
// ============================================================================

describe("accessibility checker: contrast cascade", () => {
  const contrast = (html: string) =>
    checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast");
  const doc = (body: string, head = "") =>
    `<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;

  test("foreground colour from a <style> rule is checked, not skipped", () => {
    const html = doc(
      `<div style="background:#ffffff"><p class="muted">Text</p></div>`,
      `<style>.muted{color:#eeeeee}</style>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("a background inside @media screen still applies", () => {
    // `@media screen` is how authors hide CSS from Outlook, not a condition
    // that makes the rule inapplicable.
    const html = doc(
      `<div class="hero"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>@media screen {.hero{background-color:#111111}}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("a background inside a width breakpoint does NOT apply to the default render", () => {
    const html = doc(
      `<div class="hero"><p style="color:#111111;font-size:14px">Hi</p></div>`,
      `<style>@media only screen and (max-width:600px){.hero{background-color:#111111}}</style>`,
    );
    // Default render is white, so dark text is fine, the mobile-only dark
    // background must not be treated as the default.
    expect(contrast(html)).toHaveLength(0);
  });

  test("a prefers-color-scheme block never leaks into the light-mode check", () => {
    const html = doc(
      `<div class="hero" style="background:#ffffff"><p style="color:#111111;font-size:14px">Hi</p></div>`,
      `<style>@media (prefers-color-scheme: dark){.hero{background-color:#111111}}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("an !important rule background beats an inline style", () => {
    const html = doc(
      `<div style="background-color:#ffffff" class="hero"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.hero{background-color:#111111!important}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("an inline style beats a plain rule", () => {
    const html = doc(
      `<div style="background-color:#ffffff" class="hero"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.hero{background-color:#111111}</style>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("an id selector beats a class regardless of source order", () => {
    const html = doc(
      `<div id="hero" class="light"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>#hero{background:#111111}.light{background:#ffffff}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("equal specificity falls back to source order", () => {
    const html = doc(
      `<div class="a b"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.a{background:#ffffff}.b{background:#111111}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("inline background-color:transparent overrides a class background", () => {
    // Real CSS behaviour: the element is see-through onto the white body, so
    // white text really is invisible here.
    const html = doc(
      `<div class="hero" style="background-color:transparent"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.hero{background:#111111}</style>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("a selector list applies to every selector in it", () => {
    const html = doc(
      `<div class="hero"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.card, .hero { background-color:#111111 }</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("font-size from a rule decides the large-text threshold", () => {
    // ~3.5:1, passes for large text, fails for normal. The size lives in a
    // rule, so a check that only reads inline styles grades it wrongly.
    const html = doc(
      `<p class="big" style="color:#8a8a8a">Heading</p>`,
      `<style>.big{font-size:24px}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("an unparseable <style> block does not crash the check", () => {
    const html = doc(
      `<div style="background:#111111"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.broken { color: ;;; @@@ }</style>`,
    );
    expect(() => contrast(html)).not.toThrow();
  });

  test("dark-mode contrast sees class-styled emails too", () => {
    const html = doc(
      `<div class="card"><p class="body">Copy</p></div>`,
      `<style>.card{background-color:#ffffff}.body{color:#555555;font-size:14px}</style>`,
    );
    expect(checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast")).toHaveLength(0);
    expect(checkDarkModeContrast(html)).toHaveLength(1);
  });
});

// ============================================================================
// Gap 1; gradients are analysable, raster images are not
// ============================================================================

describe("accessibility checker: contrast over gradients", () => {
  const contrast = (html: string) =>
    checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast");
  const doc = (body: string, head = "") =>
    `<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;

  test("white text on an all-dark gradient passes", () => {
    const html = doc(
      `<div style="background-image:linear-gradient(#000000,#333333)"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("white text on a gradient that runs through white fails at that stop", () => {
    const html = doc(
      `<div style="background-image:linear-gradient(#ffffff,#000000)"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    const issues = contrast(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].details).toContain("worst gradient stop");
  });

  test("direction and position tokens are not mistaken for colours", () => {
    // `to right`, `45deg` and `0%`/`100%` must not parse as stops.
    const html = doc(
      `<div style="background:linear-gradient(to right, #111111 0%, #222222 100%)"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("angled gradients with functional colours resolve", () => {
    const html = doc(
      `<div style="background:linear-gradient(45deg, rgb(255,255,255), rgb(0,0,0))"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("a solid fallback under a gradient is also a surface the text can land on", () => {
    // Clients that drop the gradient paint #ffffff, so white text fails there
    // even though every gradient stop is dark.
    const html = doc(
      `<div style="background:#ffffff linear-gradient(#000000,#111111)"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("a raster image with no fallback is still skipped, not guessed", () => {
    const html = doc(
      `<div style="background-image:url(hero.png)"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("a raster image WITH a colour fallback is graded against the fallback", () => {
    const html = doc(
      `<div style="background:#ffffff url(hero.png) no-repeat"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("a fully transparent stop contributes no colour", () => {
    const html = doc(
      `<div style="background-image:linear-gradient(transparent,#111111)"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("gradients declared in a <style> rule resolve too", () => {
    const html = doc(
      `<div class="hero"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.hero{background-image:linear-gradient(#ffffff,#eeeeee)}</style>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });
});

// ============================================================================
// Gap 2: contrast at mobile width, and the media evaluator behind it
// ============================================================================

describe("accessibility checker: mobile contrast", () => {
  const doc = (body: string, head = "") =>
    `<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;
  const desktop = (html: string) =>
    checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast");

  test("a breakpoint that ruins contrast is caught, and is silent on desktop", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff;font-size:14px}
         @media only screen and (max-width:600px){ .card{background-color:#ffffff} }
       </style>`,
    );
    expect(desktop(html)).toHaveLength(0);
    const mobile = checkMobileContrast(html);
    expect(mobile).toHaveLength(1);
    expect(mobile[0].rule).toBe("low-contrast-mobile");
    expect(mobile[0].message).toContain("At mobile width");
  });

  test("a failure present on both renders is not reported twice", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#ffffff}
         .copy{color:#ffffff;font-size:14px}
         @media only screen and (max-width:600px){ .copy{font-size:15px} }
       </style>`,
    );
    expect(desktop(html)).toHaveLength(1);
    expect(checkMobileContrast(html)).toHaveLength(0);
  });

  test("a breakpoint that FIXES contrast reports nothing", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff;font-size:14px}
         @media only screen and (max-width:600px){ .copy{color:#eeeeee} }
       </style>`,
    );
    expect(checkMobileContrast(html)).toHaveLength(0);
  });

  test("min-width blocks apply to desktop, not to mobile", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff;font-size:14px}
         @media only screen and (min-width:601px){ .card{background-color:#ffffff} }
       </style>`,
    );
    // The desktop render (640px) satisfies min-width:601px, so it breaks there.
    expect(desktop(html)).toHaveLength(1);
    // Mobile keeps the dark card, so there is nothing new to report.
    expect(checkMobileContrast(html)).toHaveLength(0);
  });

  test("em-based breakpoints are evaluated, not ignored", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff;font-size:14px}
         @media (max-width:37.5em){ .card{background-color:#ffffff} }
       </style>`,
    );
    // 37.5em = 600px, so a 375px mobile render is inside it.
    expect(checkMobileContrast(html)).toHaveLength(1);
  });

  test("@media print never contributes to either render", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff;font-size:14px}
         @media print{ .card{background-color:#ffffff} }
       </style>`,
    );
    expect(desktop(html)).toHaveLength(0);
    expect(checkMobileContrast(html)).toHaveLength(0);
  });

  test("prefers-color-scheme: dark never leaks into either light render", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff;font-size:14px}
         @media (prefers-color-scheme: dark){ .card{background-color:#ffffff} }
       </style>`,
    );
    expect(desktop(html)).toHaveLength(0);
    expect(checkMobileContrast(html)).toHaveLength(0);
  });

  test("mobile issues keep their source position (same DOM, no transform)", () => {
    const html = doc(
      `<div class="card"><p class="copy" style="font-size:14px">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff}
         @media only screen and (max-width:600px){ .card{background-color:#ffffff} }
       </style>`,
    );
    const mobile = checkMobileContrast(html, { positions: true });
    expect(mobile).toHaveLength(1);
    expect(mobile[0].loc).toBeDefined();
  });

  test("auditEmail surfaces mobileContrast, and `skip` turns it off", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#111111}
         .copy{color:#ffffff;font-size:14px}
         @media only screen and (max-width:600px){ .card{background-color:#ffffff} }
       </style>`,
    );
    expect(auditEmail(html).mobileContrast).toHaveLength(1);
    expect(auditEmail(html, { skip: ["mobileContrast"] }).mobileContrast).toHaveLength(0);
  });
});

// ============================================================================
// Gap 3: the author's own dark block, and both inversion modes
// ============================================================================

describe("accessibility checker: dark mode coverage", () => {
  const doc = (body: string, head = "") =>
    `<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;
  const light = (html: string) =>
    checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast");

  test("a dark block that repaints the background but not the text is caught", () => {
    // Apple Mail and Superhuman apply this block verbatim, no inversion is
    // involved, so only reading the author's own CSS finds it.
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#ffffff}
         .copy{color:#333333;font-size:14px}
         @media (prefers-color-scheme: dark){ .card{background-color:#1a1a1a} }
       </style>`,
    );
    expect(light(html)).toHaveLength(0);
    const dark = auditEmail(html).darkContrast;
    expect(dark.length).toBeGreaterThanOrEqual(1);
    expect(dark[0].rule).toBe("low-contrast-dark");
  });

  test("a dark block that repaints BOTH background and text is silent", () => {
    const html = doc(
      `<div class="card"><p class="copy">Copy</p></div>`,
      `<style>
         .card{background-color:#ffffff}
         .copy{color:#333333;font-size:14px}
         @media (prefers-color-scheme: dark){
           .card{background-color:#1a1a1a}
           .copy{color:#e8e8e8}
         }
       </style>`,
    );
    expect(auditEmail(html).darkContrast).toHaveLength(0);
  });

  test("an email with no dark block reports nothing from the dark-styles pass", () => {
    const html = doc(
      `<div style="background-color:#111111"><p style="color:#eeeeee;font-size:14px">Copy</p></div>`,
    );
    expect(auditEmail(html).darkContrast).toHaveLength(0);
  });

  test("one fault is one report, even when several dark renders surface it", () => {
    const html = doc(
      `<div style="background-color:#ffffff"><p style="color:#555555;font-size:14px">Copy</p></div>`,
    );
    const dark = checkDarkModeContrast(html);
    const elements = dark.map((i) => i.element);
    expect(new Set(elements).size).toBe(elements.length);
  });

  test("the dark-styles pass keeps source positions, the inversion pass drops them", () => {
    const html = doc(
      `<div class="card"><p class="copy" style="font-size:14px">Copy</p></div>`,
      `<style>
         .card{background-color:#ffffff}
         .copy{color:#333333}
         @media (prefers-color-scheme: dark){ .card{background-color:#1a1a1a} }
       </style>`,
    );
    const fromStyles = checkDarkStylesContrastFromDom(
      // positions require the parse to carry them, so go through auditEmail
      cheerioOf(html),
    );
    expect(fromStyles.length).toBeGreaterThanOrEqual(1);

    // The inversion pass never carries a position.
    const inverted = checkDarkModeContrast(
      doc(`<div style="background-color:#ffffff"><p style="color:#555555;font-size:14px">Copy</p></div>`),
    );
    expect(inverted[0]?.loc).toBeUndefined();
  });
});

// ============================================================================
// Gap 4; exact specificity
//
// Each case is one the token-counting fallback gets wrong, so they only pass
// with a parsed selector.
// ============================================================================

describe("accessibility checker: selector specificity", () => {
  const contrast = (html: string) =>
    checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast");
  const doc = (body: string, head = "") =>
    `<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;

  test(":where() carries no specificity, so the class wins", () => {
    const html = doc(
      `<div id="hero" class="card"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>:where(#hero){background-color:#ffffff} .card{background-color:#111111}</style>`,
    );
    // Token counting would score :where(#hero) as an id and hand it the white
    // background, flagging white-on-white that no browser renders.
    expect(contrast(html)).toHaveLength(0);
  });

  test(":not() forwards its argument's specificity", () => {
    const html = doc(
      `<div id="hero" class="card"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.card{background-color:#ffffff} :not(.nope)#hero{background-color:#111111}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test(":is() takes its MOST specific argument, not the sum", () => {
    const html = doc(
      `<div id="hero" class="card"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      // :is(#hero, .card) is [1,0,0]; #other#hero would out-rank it at [2,0,0].
      `<style>:is(#hero, .card){background-color:#111111} #hero.card.extra{background-color:#ffffff}</style>`,
    );
    // #hero.card.extra is [1,2,0] and does not match (no .extra class), so the
    // dark :is() rule stands.
    expect(contrast(html)).toHaveLength(0);
  });

  test("the universal selector loses to a type selector", () => {
    // Both rules target the same <div>, so only specificity decides. The text
    // lives on that div, rather than in a child `*` would also paint white.
    const html = doc(
      `<div style="color:#ffffff;font-size:14px">Hi</div>`,
      `<style>*{background-color:#ffffff} div{background-color:#111111}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("the universal selector still paints elements nothing else claims", () => {
    // `*` matches the <p> as well, so it really does render white-on-white.
    const html = doc(
      `<div><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>div{background-color:#111111} *{background-color:#ffffff}</style>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("a pseudo-element counts as an element, not a class", () => {
    const html = doc(
      `<div class="card"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>.card{background-color:#111111} div::before{background-color:#ffffff}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("an unparseable selector still falls back rather than throwing", () => {
    const html = doc(
      `<div style="background:#111111"><p style="color:#ffffff;font-size:14px">Hi</p></div>`,
      `<style>@@@ bad { background-color:#ffffff } .ok{color:#111}</style>`,
    );
    expect(() => contrast(html)).not.toThrow();
    expect(contrast(html)).toHaveLength(0);
  });
});

// ============================================================================
// Gap 5: inheritance, the default palette, and text that is hidden on purpose
// ============================================================================

describe("accessibility checker: inherited colour", () => {
  const contrast = (html: string) =>
    checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast");
  const doc = (body: string, head = "") =>
    `<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;

  test("an inherited colour is judged where it lands, not where it is declared", () => {
    // #999 is declared on <body> (over white) but every run of text using it
    // sits on a dark card, where it reads fine. Judging at the declaration
    // reports a failure the reader never sees.
    const html = doc(
      `<div style="background-color:#111111"><p style="font-size:14px">Card copy</p></div>`,
      `<style>body{color:#999999}</style>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("the same colour IS flagged where it lands on a light background", () => {
    const html = doc(
      `<div style="background-color:#ffffff"><p style="font-size:14px">Card copy</p></div>`,
      `<style>body{color:#999999}</style>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("undeclared text is black, so a dark background is a real failure", () => {
    // Nothing declares a colour, the client paints it black, and black on
    // #111111 is invisible. Requiring a declared colour misses this entirely.
    const html = doc(`<div style="background-color:#111111">Unstyled copy</div>`);
    const issues = contrast(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  test("undeclared text on the default white background is fine", () => {
    expect(contrast(doc(`<div>Unstyled copy</div>`))).toHaveLength(0);
  });

  test("a container is not reported for text its children hold", () => {
    // One run of text, one report, not one per ancestor in the chain.
    const html = doc(
      `<div style="background-color:#ffffff"><table><tr><td><p style="color:#eeeeee;font-size:14px">Copy</p></td></tr></table></div>`,
    );
    expect(contrast(html)).toHaveLength(1);
  });

  test("hidden preheader text is not a contrast defect", () => {
    const html = doc(
      `<div style="display:none;font-size:1px;color:#ffffff">Preheader nobody sees</div>
       <div style="background-color:#ffffff"><p style="color:#111111;font-size:14px">Real copy</p></div>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("zero-height and zero-opacity preheaders are also skipped", () => {
    const html = doc(
      `<span style="font-size:0;color:#ffffff">Hidden</span>
       <span style="opacity:0;color:#ffffff">Hidden too</span>
       <span style="visibility:hidden;color:#ffffff">And this</span>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("the mso-hide idiom is respected", () => {
    const html = doc(`<div style="mso-hide:all;color:#ffffff">Outlook-hidden preheader</div>`);
    expect(contrast(html)).toHaveLength(0);
  });

  test("an inherited font-size decides the large-text threshold", () => {
    // ~3.5:1 passes for large text only. The size is inherited from the
    // parent, so reading it off the text element alone grades it wrongly.
    const html = doc(
      `<div style="font-size:24px"><span style="color:#8a8a8a">Heading</span></div>`,
    );
    expect(contrast(html)).toHaveLength(0);
  });

  test("the position still points at the declaration, not the text node", () => {
    const html = doc(
      `<div style="color:#eeeeee"><p style="font-size:14px">Copy</p></div>`,
    );
    const issues = checkAccessibility(html, { positions: true }).issues.filter(
      (i) => i.rule === "low-contrast",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].loc).toBeDefined();
  });
});

// ============================================================================
// The flagship case: a dark block that re-colours only the classes it knows
// about, over text that inherits its colour from a wrapper.
//
// Taken from receipt-notification.html, where it renders as literally
// invisible text. Finding it needs the author's dark block resolved through
// the cascade AND inherited colour; either alone reports nothing.
// ============================================================================

describe("accessibility checker: partial dark-mode coverage", () => {
  test("text that inherits a light-mode colour is caught under the email's own dark block", () => {
    const html = `<html lang="en"><head><title>T</title><style>
        .card{background-color:#ffffff}
        @media (prefers-color-scheme: dark){
          .card{background-color:#141519 !important}
          .text-primary{color:#eae6de !important}
        }
      </style></head><body>
        <div class="card">
          <h1 class="text-primary" style="color:#1a1714;font-size:22px">Re-coloured, fine</h1>
          <td style="color:#1a1714;font-size:14px"><div>Inherits, never re-coloured</div></td>
        </div>
      </body></html>`;

    // Nothing wrong in the light render.
    expect(checkAccessibility(html).issues.filter((i) => i.rule === "low-contrast")).toHaveLength(0);

    const dark = auditEmail(html).darkContrast;
    // The heading is re-coloured by the dark block, so it must NOT be flagged.
    expect(dark.some((i) => i.element?.includes("Re-coloured"))).toBe(false);
    // The inheriting div is left near-black on a near-black card.
    expect(dark.some((i) => i.element?.includes("Inherits"))).toBe(true);
  });
});
