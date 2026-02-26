import { describe, test, expect } from "bun:test";
import { checkAccessibility } from "../index";

// ============================================================================
// Accessible emails — should score high
// ============================================================================

describe("accessibility checker — accessible emails", () => {
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

describe("accessibility checker — individual rules", () => {
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

describe("accessibility checker — score", () => {
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

describe("accessibility checker — resilience", () => {
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

describe("accessibility checker — penalty capping", () => {
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

describe("accessibility checker — color contrast", () => {
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

describe("accessibility checker — small text threshold", () => {
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

describe("accessibility checker — table ancestor skip", () => {
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
