import { describe, test, expect } from "bun:test";
import { analyzeImages, IMAGE_SUPPORT } from "../index";

// ============================================================================
// Clean images: should have no issues
// ============================================================================

describe("image analyzer: clean images", () => {
  test("image with all attributes is clean", () => {
    const html = `<html><body>
      <img src="https://cdn.example.com/hero.png" alt="Hero banner" width="600" height="300" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.total).toBe(1);
    const nonTrackingIssues = report.issues.filter((i) => i.rule !== "tracking-pixel");
    expect(nonTrackingIssues.length).toBe(0);
  });

  test("empty HTML returns empty report", () => {
    const report = analyzeImages("");
    expect(report.total).toBe(0);
    expect(report.totalDataUriBytes).toBe(0);
    expect(report.issues).toEqual([]);
    expect(report.images).toEqual([]);
  });

  test("HTML with no images returns empty report", () => {
    const html = `<html><body><p>No images here.</p></body></html>`;
    const report = analyzeImages(html);
    expect(report.total).toBe(0);
    expect(report.images).toEqual([]);
  });
});

// ============================================================================
// Individual rule detection
// ============================================================================

describe("image analyzer: individual rules", () => {
  test("detects missing width/height", () => {
    const html = `<html><body>
      <img src="https://cdn.example.com/photo.jpg" alt="Photo">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "missing-dimensions");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("does not flag image with width/height attributes", () => {
    const html = `<html><body>
      <img src="photo.jpg" alt="Photo" width="400" height="300" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "missing-dimensions");
    expect(rule).toBeUndefined();
  });

  test("does not flag image with inline style dimensions", () => {
    const html = `<html><body>
      <img src="photo.jpg" alt="Photo" style="width:400px;height:300px;display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "missing-dimensions");
    expect(rule).toBeUndefined();
  });

  test("detects missing alt attribute", () => {
    const html = `<html><body>
      <img src="photo.jpg" width="100" height="100" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "missing-alt");
    expect(rule).toBeDefined();
  });

  test("does not flag image with alt attribute", () => {
    const html = `<html><body>
      <img src="photo.jpg" alt="" width="100" height="100" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "missing-alt");
    expect(rule).toBeUndefined();
  });

  test("detects WebP format", () => {
    const html = `<html><body>
      <img src="https://cdn.example.com/image.webp" alt="WebP" width="100" height="100" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "webp-format");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("info");
  });

  test("detects SVG format", () => {
    const html = `<html><body>
      <img src="icon.svg" alt="Icon" width="24" height="24" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "svg-format");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("info");
  });

  test("detects missing display:block", () => {
    const html = `<html><body>
      <img src="photo.jpg" alt="Photo" width="400" height="300">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "missing-display-block");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("info");
  });

  test("does not flag image with display:block", () => {
    const html = `<html><body>
      <img src="photo.jpg" alt="Photo" width="400" height="300" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "missing-display-block");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Tracking pixel detection
// ============================================================================

describe("image analyzer: tracking pixels", () => {
  test("detects 1x1 tracking pixel", () => {
    const html = `<html><body>
      <img src="https://track.example.com/pixel.gif" width="1" height="1" alt="">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.images[0].isTrackingPixel).toBe(true);
    const rule = report.issues.find((i) => i.rule === "tracking-pixel");
    expect(rule).toBeDefined();
  });

  test("detects hidden tracking pixel (display:none)", () => {
    const html = `<html><body>
      <img src="https://track.example.com/open" style="display:none" alt="">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.images[0].isTrackingPixel).toBe(true);
  });

  test("detects hidden tracking pixel (visibility:hidden)", () => {
    const html = `<html><body>
      <img src="https://track.example.com/open" style="visibility:hidden" alt="">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.images[0].isTrackingPixel).toBe(true);
  });

  test("detects 0-width tracking pixel", () => {
    const html = `<html><body>
      <img src="https://track.example.com/open" width="0" height="0" alt="">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.images[0].isTrackingPixel).toBe(true);
  });

  test("tracking pixels don't get other issues", () => {
    const html = `<html><body>
      <img src="https://track.example.com/open" width="1" height="1">
    </body></html>`;
    const report = analyzeImages(html);
    const otherIssues = report.issues.filter(
      (i) => i.rule !== "tracking-pixel"
    );
    expect(otherIssues.length).toBe(0);
  });
});

// ============================================================================
// Data URI analysis
// ============================================================================

describe("image analyzer: data URIs", () => {
  test("calculates data URI size correctly", () => {
    const payload = "AAAA".repeat(10); // 40 chars = 30 bytes
    const html = `<html><body>
      <img src="data:image/png;base64,${payload}" alt="Small" width="10" height="10" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.images[0].dataUriBytes).toBeGreaterThan(0);
    expect(report.totalDataUriBytes).toBeGreaterThan(0);
  });

  test("flags large data URI (>100KB)", () => {
    const payload = "A".repeat(200_000); // ~150KB decoded
    const html = `<html><body>
      <img src="data:image/png;base64,${payload}" alt="Large" width="100" height="100" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "large-data-uri");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("flags total data URI size exceeding 500KB", () => {
    const payload = "A".repeat(250_000); // ~187KB each
    const html = `<html><body>
      <img src="data:image/png;base64,${payload}" alt="1" width="100" height="100" style="display:block;">
      <img src="data:image/png;base64,${payload}" alt="2" width="100" height="100" style="display:block;">
      <img src="data:image/png;base64,${payload}" alt="3" width="100" height="100" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "total-data-uri-size");
    expect(rule).toBeDefined();
  });
});

// ============================================================================
// Aggregate checks
// ============================================================================

describe("image analyzer: aggregate checks", () => {
  test("flags high image count (>10)", () => {
    const imgs = Array.from(
      { length: 12 },
      (_, i) => `<img src="img${i}.jpg" alt="Image ${i}" width="100" height="100" style="display:block;">`
    ).join("\n");
    const html = `<html><body>${imgs}</body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "high-image-count");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("info");
  });

  test("does not flag reasonable image count", () => {
    const imgs = Array.from(
      { length: 5 },
      (_, i) => `<img src="img${i}.jpg" alt="Image ${i}" width="100" height="100" style="display:block;">`
    ).join("\n");
    const html = `<html><body>${imgs}</body></html>`;
    const report = analyzeImages(html);
    const rule = report.issues.find((i) => i.rule === "high-image-count");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// ImageInfo output
// ============================================================================

describe("image analyzer: image info", () => {
  test("returns correct ImageInfo for each image", () => {
    const html = `<html><body>
      <img src="https://cdn.example.com/hero.jpg" alt="Hero" width="600" height="300" style="display:block;">
      <img src="icon.png" width="24" height="24" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.images.length).toBe(2);

    expect(report.images[0].src).toContain("hero.jpg");
    expect(report.images[0].alt).toBe("Hero");
    expect(report.images[0].width).toBe("600");
    expect(report.images[0].height).toBe("300");
    expect(report.images[0].isTrackingPixel).toBe(false);

    expect(report.images[1].alt).toBeNull();
    expect(report.images[1].width).toBe("24");
  });

  test("truncates long data URI src", () => {
    const payload = "A".repeat(1000);
    const html = `<html><body>
      <img src="data:image/png;base64,${payload}" alt="X" width="10" height="10" style="display:block;">
    </body></html>`;
    const report = analyzeImages(html);
    expect(report.images[0].src).toContain("data:image/png;");
    expect(report.images[0].src.length).toBeLessThan(100);
  });
});

// ============================================================================
// Resilience
// ============================================================================

describe("image analyzer: resilience", () => {
  test("handles malformed HTML", () => {
    const html = `<body><img src="broken" <div>mess`;
    expect(() => analyzeImages(html)).not.toThrow();
  });

  test("handles img with empty src", () => {
    const html = `<html><body><img src="" alt="Empty" width="100" height="100" style="display:block;"></body></html>`;
    expect(() => analyzeImages(html)).not.toThrow();
  });

  test("handles img with no attributes", () => {
    const html = `<html><body><img></body></html>`;
    expect(() => analyzeImages(html)).not.toThrow();
  });

  test("handles deeply nested images", () => {
    const html = `<html><body>
      ${"<div>".repeat(20)}
      <img src="deep.jpg" alt="Deep" width="100" height="100" style="display:block;">
      ${"</div>".repeat(20)}
    </body></html>`;
    expect(() => analyzeImages(html)).not.toThrow();
  });
});

// ─── Format detection ───────────────────────────────────────────────────────
// The format is read from the `src`, and everything downstream (which clients
// break, what to ship instead) hangs off getting that read right.

describe("reading the format out of a src", () => {
  const rules = (src: string) =>
    analyzeImages(`<html><body><img src="${src}" alt="" width="600" height="200"></body></html>`)
      .issues.filter((i) => i.rule.endsWith("-format"))
      .map((i) => i.rule)
      .sort();

  test("reads the path, not the query string or fragment", () => {
    expect(rules("a.webp?v=2")).toEqual(["webp-format"]);
    expect(rules("a.webp#frag")).toEqual(["webp-format"]);
    // The extension has to end the path; "webp" as a query value is not a format.
    expect(rules("https://x.com/i?url=a.png&amp;fmt=webp")).toEqual([]);
    expect(rules("https://x.com/a.png/resize/w_600")).toEqual([]);
  });

  test("ignores case, and does not need a scheme", () => {
    expect(rules("A.AVIF")).toEqual(["avif-format"]);
    expect(rules("//cdn.example.com/a.avif")).toEqual(["avif-format"]);
  });

  test("grades a data URI twice: once for delivery, once for payload", () => {
    expect(rules("data:image/webp;base64,AAA")).toEqual(["base64-format", "webp-format"]);
    // PNG renders everywhere, so only the delivery mechanism is reported.
    expect(rules("data:image/png;base64,AAAA")).toEqual(["base64-format"]);
    // Not base64-encoded, so only the payload format counts.
    expect(rules("data:image/svg+xml;utf8,<svg/>")).toEqual(["svg-format"]);
    expect(rules("data:image/jpeg,AAAA")).toEqual([]);
  });

  test("maps the mime spellings that are not the extension", () => {
    // Both spell ICO. Without the alias the payload is invisible and only the
    // base64 delivery gets graded.
    expect(rules("data:image/x-icon;base64,AAAA")).toEqual(["base64-format", "ico-format"]);
    expect(rules("data:image/vnd.microsoft.icon;base64,AAAA")).toEqual([
      "base64-format", "ico-format",
    ]);
    expect(rules("a.ico")).toEqual(["ico-format"]);
  });

  test("maps an alias extension onto the format caniemail grades", () => {
    expect(rules("a.heic")).toEqual(["heif-format"]);
    expect(rules("a.tif")).toEqual(["tiff-format"]);
    expect(rules("a.jfif")).toEqual([]); // jpg, universal
  });

  test("says nothing about an extension it does not know", () => {
    expect(rules("https://cdn.example.com/img/1234")).toEqual([]);
    expect(rules("a.jxl")).toEqual([]);
  });

  test("every format in the matrix is reachable from some src", () => {
    // A format nobody can name is a row that can never be reported.
    const byExt: Record<string, string> = {
      apng: "a.apng", avif: "a.avif", bmp: "a.bmp", gif: "a.gif", hdr: "a.hdr",
      heif: "a.heif", ico: "a.ico", jpg: "a.jpg", mp4: "a.mp4", png: "a.png",
      svg: "a.svg", tiff: "a.tiff", webp: "a.webp", base64: "data:image/gif;base64,AAA",
    };
    expect(Object.keys(byExt).sort()).toEqual(Object.keys(IMAGE_SUPPORT).sort());
  });
});

describe("naming the clients that break", () => {
  const message = (src: string) =>
    analyzeImages(`<html><body><img src="${src}" alt="" width="600" height="200"></body></html>`)
      .issues.find((i) => i.rule.endsWith("-format"))?.message ?? "";

  test("counts agree with the list, and read as a sentence", () => {
    // APNG breaks in exactly five clients, one over the four the message names
    // in full. "and 1 others" is the wording that makes a reader distrust the
    // number beside it.
    expect(message("a.apng")).toContain("and 1 other (5 of 21 clients)");
    expect(message("a.apng")).not.toContain("1 others");
    // Two names join with "and", no comma, no remainder.
    expect(message("a.webp")).toContain("Outlook (New) and Outlook for Mac (2 of 21 clients");
  });

  test("names a format the way a person would write it", () => {
    expect(message("a.webp")).toStartWith("WebP is not supported by");
    expect(message("a.mp4")).toStartWith("Video-as-image (MP4) is not supported by");
  });
});
