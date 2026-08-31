import { describe, test, expect } from "bun:test";
import { validateLinks } from "../index";

// ============================================================================
// Clean emails
// ============================================================================

describe("link validator: clean emails", () => {
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

describe("link validator: individual rules", () => {
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

describe("link validator: breakdown", () => {
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

describe("link validator: complex scenarios", () => {
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

describe("link validator: resilience", () => {
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

// ============================================================================
// Protocol-relative URLs
// ============================================================================

describe("link validator: protocol-relative URLs", () => {
  test("protocol-relative URL flagged as warning", () => {
    const html = `<html><body><a href="//cdn.example.com/page">Link</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "protocol-relative");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("protocol-relative counted in breakdown.protocolRelative", () => {
    const html = `<html><body><a href="//cdn.example.com/page">Link</a></body></html>`;
    const report = validateLinks(html);
    expect(report.breakdown.protocolRelative).toBe(1);
  });
});

// ============================================================================
// javascript: breakdown
// ============================================================================

describe("link validator: javascript breakdown", () => {
  test("javascript: counted in breakdown.javascript", () => {
    const html = `<html><body><a href="javascript:alert(1)">X</a></body></html>`;
    const report = validateLinks(html);
    expect(report.breakdown.javascript).toBe(1);
  });
});

// ============================================================================
// Empty tel:
// ============================================================================

describe("link validator: empty tel", () => {
  test("empty tel: flagged as error", () => {
    const html = `<html><body><a href="tel:">Call us</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "empty-tel");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("valid tel:+15551234567 not flagged", () => {
    const html = `<html><body><a href="tel:+15551234567">Call us</a></body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "empty-tel");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Duplicate links
// ============================================================================

describe("link validator: duplicate links", () => {
  test("6x same URL triggers duplicate-links info issue", () => {
    const links = Array.from({ length: 6 }, () =>
      `<a href="https://example.com/same">Link</a>`
    ).join("\n");
    const html = `<html><body>${links}</body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "duplicate-links");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("info");
  });

  test("5x same URL does not trigger duplicate issue", () => {
    const links = Array.from({ length: 5 }, () =>
      `<a href="https://example.com/same">Link</a>`
    ).join("\n");
    const html = `<html><body>${links}</body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "duplicate-links");
    expect(rule).toBeUndefined();
  });

  test("10 unique URLs does not trigger duplicate issue", () => {
    const links = Array.from({ length: 10 }, (_, i) =>
      `<a href="https://example.com/page${i}">Link ${i}</a>`
    ).join("\n");
    const html = `<html><body>${links}</body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find((i) => i.rule === "duplicate-links");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Link inventory
// ============================================================================

describe("link validator: inventory", () => {
  test("every anchor appears in links, not just the problematic ones", () => {
    // ImageReport has carried a full `images` inventory from the start while
    // LinkReport carried only counts, so anything wanting to act per-link had
    // to re-parse the HTML the engine had already parsed.
    const html = `<html><body>
      <a href="https://example.com/a">A</a>
      <a href="https://example.com/b">B</a>
      <a href="#">Broken</a>
    </body></html>`;
    const report = validateLinks(html);
    expect(report.links).toHaveLength(3);
    expect(report.links.map((l) => l.href)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "#",
    ]);
  });

  test("href is kept whole, because a truncated URL cannot be resolved", () => {
    const long = "https://example.com/" + "x".repeat(300);
    const report = validateLinks(`<a href="${long}">go</a>`);
    expect(report.links[0].href).toBe(long);
  });

  test("scheme classifies each link", () => {
    const html = `<html><body>
      <a href="https://a.com">s</a>
      <a href="http://b.com">i</a>
      <a href="mailto:x@y.com">m</a>
      <a href="tel:+1">t</a>
      <a href="#top">a</a>
      <a href="//cdn.example.com">p</a>
      <a href="">e</a>
    </body></html>`;
    expect(validateLinks(html).links.map((l) => l.scheme)).toEqual([
      "https", "http", "mailto", "tel", "anchor", "protocol-relative", "empty",
    ]);
  });

  test("isPlaceholder marks the hrefs that go nowhere", () => {
    const html = `<html><body>
      <a href="#">a</a>
      <a href="javascript:void(0)">b</a>
      <a href="https://real.com">c</a>
    </body></html>`;
    expect(validateLinks(html).links.map((l) => l.isPlaceholder)).toEqual([true, true, false]);
  });

  test("issues names the rules that fired for that link, like ImageInfo does", () => {
    const report = validateLinks(`<a href="http://insecure.com">click here</a>`);
    expect(report.links[0].issues).toContain("insecure-link");
    expect(report.links[0].issues).toContain("generic-link-text");
  });

  test("a clean link has an empty issues array", () => {
    const report = validateLinks(`<a href="https://example.com">Read the guide</a>`);
    expect(report.links[0].issues).toEqual([]);
  });

  test("text is captured and bounded", () => {
    const report = validateLinks(`<a href="https://e.com">${"word ".repeat(40)}</a>`);
    expect(report.links[0].text.length).toBeLessThanOrEqual(80);
  });

  test("an email with no links has an empty inventory, not a missing one", () => {
    const report = validateLinks(`<p>no links here</p>`);
    expect(report.links).toEqual([]);
  });

  test("unparseable input still returns an inventory array", () => {
    expect(validateLinks("").links).toEqual([]);
  });
});
