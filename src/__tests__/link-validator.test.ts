import { describe, test, expect } from "bun:test";
import { validateLinks } from "../index";

// ============================================================================
// Clean emails
// ============================================================================

describe("link validator — clean emails", () => {
  test("email with valid HTTPS links has no issues", () => {
    const html = `<html><body>
      <a href="https://example.com">Visit us</a>
      <a href="https://example.com/about">About</a>
    </body></html>`;
    const report = validateLinks(html);
    expect(report.totalLinks).toBe(2);
    const errors = report.issues.filter((i) => i.severity === "error");
    expect(errors.length).toBe(0);
  });

  test("empty HTML returns empty report", () => {
    const report = validateLinks("");
    expect(report.totalLinks).toBe(0);
    expect(report.issues).toEqual([]);
  });

  test("HTML with no links returns info about no links", () => {
    const html = `<html><body><p>No links here.</p></body></html>`;
    const report = validateLinks(html);
    expect(report.totalLinks).toBe(0);
  });
});

// ============================================================================
// Individual rule detection
// ============================================================================

describe("link validator — individual rules", () => {
  test("detects empty href", () => {
    const html = `<html><body><a href="">Click me</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "empty-href");
    expect(rule).toBeDefined();
  });

  test("detects placeholder href (#)", () => {
    const html = `<html><body><a href="#">Placeholder</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "placeholder-href");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("detects javascript: href", () => {
    const html = `<html><body><a href="javascript:alert('xss')">Click</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "javascript-href");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("javascript:void(0) is flagged as placeholder, not javascript-href", () => {
    const html = `<html><body><a href="javascript:void(0)">Toggle</a></body></html>`;
    const report = validateLinks(html);
    const jsRule = report.issues.find((i) => i.rule === "javascript-href");
    const placeholderRule = report.issues.find((i) => i.rule === "placeholder-href");
    expect(jsRule).toBeUndefined();
    expect(placeholderRule).toBeDefined();
  });

  test("detects HTTP links (insecure)", () => {
    const html = `<html><body><a href="http://example.com">Insecure</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "insecure-link");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("HTTPS links are not flagged as insecure", () => {
    const html = `<html><body><a href="https://example.com">Secure</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "insecure-link");
    expect(rule).toBeUndefined();
  });

  test("detects generic link text", () => {
    const html = `<html><body>
      <a href="https://example.com">click here</a>
      <a href="https://example.com/page">read more</a>
    </body></html>`;
    const report = validateLinks(html);
    const rules = report.issues.filter((i) => i.rule === "generic-link-text");
    expect(rules.length).toBe(2);
  });

  test("does not flag descriptive link text", () => {
    const html = `<html><body>
      <a href="https://example.com">Visit our documentation portal</a>
    </body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "generic-link-text");
    expect(rule).toBeUndefined();
  });

  test("detects empty link text (no text, no image)", () => {
    const html = `<html><body><a href="https://example.com"></a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "empty-link-text");
    expect(rule).toBeDefined();
  });

  test("link with image child is not flagged as empty", () => {
    const html = `<html><body><a href="https://example.com"><img src="icon.png" alt="icon"></a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "empty-link-text");
    expect(rule).toBeUndefined();
  });

  test("detects empty mailto", () => {
    const html = `<html><body><a href="mailto:">Email us</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "empty-mailto");
    expect(rule).toBeDefined();
  });

  test("valid mailto is not flagged", () => {
    const html = `<html><body><a href="mailto:hello@example.com">Email us</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "empty-mailto");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Protocol breakdown
// ============================================================================

describe("link validator — breakdown", () => {
  test("correctly counts protocol types", () => {
    const html = `<html><body>
      <a href="https://a.com">HTTPS</a>
      <a href="https://b.com">HTTPS</a>
      <a href="http://c.com">HTTP</a>
      <a href="mailto:a@b.com">Mail</a>
      <a href="tel:+1234567890">Call</a>
      <a href="#section">Anchor</a>
    </body></html>`;
    const report = validateLinks(html);
    expect(report.totalLinks).toBe(6);
    expect(report.breakdown.https).toBe(2);
    expect(report.breakdown.http).toBe(1);
    expect(report.breakdown.mailto).toBe(1);
    expect(report.breakdown.tel).toBe(1);
    expect(report.breakdown.anchor).toBe(1);
  });
});

// ============================================================================
// Complex scenarios
// ============================================================================

describe("link validator — complex scenarios", () => {
  test("mixed valid and invalid links", () => {
    const html = `<html><body>
      <a href="https://example.com">Good link</a>
      <a href="javascript:alert(1)">Bad link</a>
      <a href="">Empty link</a>
      <a href="http://insecure.com">HTTP link</a>
      <a href="https://example.com/page">Another good one</a>
    </body></html>`;
    const report = validateLinks(html);
    expect(report.totalLinks).toBe(5);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.rule === "javascript-href")).toBe(true);
    expect(report.issues.some((i) => i.rule === "empty-href")).toBe(true);
    expect(report.issues.some((i) => i.rule === "insecure-link")).toBe(true);
  });

  test("tel: links are not flagged as errors", () => {
    const html = `<html><body><a href="tel:+15551234567">Call us</a></body></html>`;
    const report = validateLinks(html);
    const errors = report.issues.filter((i) => i.severity === "error");
    expect(errors.length).toBe(0);
  });

  test("long URL is flagged as info", () => {
    const longUrl = "https://example.com/" + "a".repeat(2100);
    const html = `<html><body><a href="${longUrl}">Link</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "long-url");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("info");
  });
});

// ============================================================================
// Resilience
// ============================================================================

describe("link validator — resilience", () => {
  test("handles malformed HTML", () => {
    const html = `<body><a href="broken<div>mess</a>`;
    expect(() => validateLinks(html)).not.toThrow();
  });

  test("handles HTML with no anchor tags", () => {
    const html = `<html><body><p>Just text</p><img src="img.png"></body></html>`;
    expect(() => validateLinks(html)).not.toThrow();
  });

  test("handles link with missing href attribute entirely", () => {
    const html = `<html><body><a>No href at all</a></body></html>`;
    const report = validateLinks(html);
    expect(report.totalLinks).toBe(1);
  });

  test("handles deeply nested links", () => {
    const html = `<html><body>
      ${"<div>".repeat(20)}
      <a href="https://example.com">Deep link</a>
      ${"</div>".repeat(20)}
    </body></html>`;
    expect(() => validateLinks(html)).not.toThrow();
  });
});
