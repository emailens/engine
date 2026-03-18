import { describe, test, expect } from "bun:test";
import { parseColor, formatRgb } from "../color-utils";
import { downlevelCSS } from "../downlevel";
import { toPlainText } from "../plain-text";
import { transformForClient } from "../transform";

// =============================================================================
// 1. Color parsing expansion (parseColor)
// =============================================================================

describe("parseColor", () => {
  test("#f00a (4-char hex) parses correctly", () => {
    const c = parseColor("#f00a");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
    // 0xaa / 255 ≈ 0.667
    expect(c!.a).toBeCloseTo(0.667, 2);
  });

  test("rgb(255 0 0) space syntax", () => {
    const c = parseColor("rgb(255 0 0)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
    expect(c!.a).toBe(1);
  });

  test("rgb(255 0 0 / 0.5) space syntax with alpha", () => {
    const c = parseColor("rgb(255 0 0 / 0.5)");
    expect(c).not.toBeNull();
    expect(c!.a).toBeCloseTo(0.5, 2);
  });

  test("rgb(255 0 0 / 50%) space syntax with percentage alpha", () => {
    const c = parseColor("rgb(255 0 0 / 50%)");
    expect(c).not.toBeNull();
    expect(c!.a).toBeCloseTo(0.5, 2);
  });

  test("hsl(0, 100%, 50%) → red", () => {
    const c = parseColor("hsl(0, 100%, 50%)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
  });

  test("hsl(120 100% 50%) → green (space syntax)", () => {
    const c = parseColor("hsl(120 100% 50%)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(0);
    // Green channel should be high (128 or 255 depending on algorithm)
    expect(c!.g).toBeGreaterThanOrEqual(128);
    expect(c!.b).toBe(0);
  });

  test("hsla(240, 100%, 50%, 0.5) → blue with alpha", () => {
    const c = parseColor("hsla(240, 100%, 50%, 0.5)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(0);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(255);
    expect(c!.a).toBeCloseTo(0.5, 2);
  });

  test("hwb(0 0% 0%) → pure red", () => {
    const c = parseColor("hwb(0 0% 0%)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
  });

  test("hwb(120 10% 20%) → greenish, parses without error", () => {
    const c = parseColor("hwb(120 10% 20%)");
    expect(c).not.toBeNull();
    // Should be greenish: g channel dominant
    expect(c!.g).toBeGreaterThan(c!.r);
    expect(c!.g).toBeGreaterThan(c!.b);
  });

  test("oklch(0.7 0.15 180) → valid RGBA", () => {
    const c = parseColor("oklch(0.7 0.15 180)");
    expect(c).not.toBeNull();
    expect(c!.r).toBeGreaterThanOrEqual(0);
    expect(c!.r).toBeLessThanOrEqual(255);
    expect(c!.g).toBeGreaterThanOrEqual(0);
    expect(c!.g).toBeLessThanOrEqual(255);
    expect(c!.b).toBeGreaterThanOrEqual(0);
    expect(c!.b).toBeLessThanOrEqual(255);
    expect(c!.a).toBe(1);
  });

  test("oklch(0.5 0.2 270 / 0.8) → alpha 0.8", () => {
    const c = parseColor("oklch(0.5 0.2 270 / 0.8)");
    expect(c).not.toBeNull();
    expect(c!.a).toBeCloseTo(0.8, 2);
  });

  test("existing formats still work: #fff", () => {
    const c = parseColor("#fff");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(255);
    expect(c!.b).toBe(255);
  });

  test("existing formats still work: #ffffff", () => {
    const c = parseColor("#ffffff");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(255);
    expect(c!.b).toBe(255);
  });

  test("existing formats still work: rgb(255, 0, 0)", () => {
    const c = parseColor("rgb(255, 0, 0)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
  });

  test("existing formats still work: named color 'red'", () => {
    const c = parseColor("red");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(255);
    expect(c!.g).toBe(0);
    expect(c!.b).toBe(0);
  });
});

describe("formatRgb", () => {
  test("opaque color → rgb()", () => {
    expect(formatRgb({ r: 255, g: 0, b: 0, a: 1 })).toBe("rgb(255, 0, 0)");
  });

  test("semi-transparent color → rgba()", () => {
    expect(formatRgb({ r: 255, g: 0, b: 0, a: 0.5 })).toBe(
      "rgba(255, 0, 0, 0.5)",
    );
  });
});

// =============================================================================
// 2. CSS downleveling (downlevelCSS)
// =============================================================================

describe("downlevelCSS", () => {
  test("modern colors in inline styles: oklch → rgb", () => {
    const html = '<div style="color: oklch(0.7 0.15 180)">text</div>';
    const result = downlevelCSS(html);
    expect(result).toContain("rgb(");
    expect(result).not.toContain("oklch");
  });

  test("hsl in inline styles → rgb", () => {
    const html = '<div style="color: hsl(120, 100%, 50%)">text</div>';
    const result = downlevelCSS(html);
    expect(result).toContain("rgb(");
    expect(result).not.toContain("hsl");
  });

  test("modern colors in style blocks: oklch → rgb", () => {
    const html =
      "<style>.foo { color: oklch(0.7 0.15 180) }</style><div>text</div>";
    const result = downlevelCSS(html);
    expect(result).toContain("rgb(");
    expect(result).not.toContain("oklch");
  });

  test("space-based rgb → comma-based rgb", () => {
    const html = '<div style="color: rgb(255 0 0)">text</div>';
    const result = downlevelCSS(html);
    expect(result).toContain("rgb(255, 0, 0)");
  });

  test("logical properties inline: padding-inline → padding-left/right", () => {
    const html = '<div style="padding-inline: 10px 20px">text</div>';
    const result = downlevelCSS(html);
    expect(result).toContain("padding-left");
    expect(result).toContain("padding-right");
    expect(result).not.toContain("padding-inline");
  });

  test("logical properties single value: margin-block → margin-top/bottom", () => {
    const html = '<div style="margin-block: 8px">text</div>';
    const result = downlevelCSS(html);
    expect(result).toContain("margin-top");
    expect(result).toContain("margin-bottom");
    expect(result).not.toContain("margin-block");
  });

  test("calc(infinity * 1px) → 9999px", () => {
    const html =
      '<div style="border-radius: calc(infinity * 1px)">text</div>';
    const result = downlevelCSS(html);
    expect(result).toContain("9999px");
    expect(result).not.toContain("infinity");
  });

  test("range media queries → legacy min/max syntax", () => {
    const html =
      "<style>@media (width >= 40rem) { .x { padding: 1rem } }</style>";
    const result = downlevelCSS(html);
    expect(result).toMatch(/min-width:\s*40rem/);
    expect(result).not.toContain(">=");
  });

  test("CSS nesting → flat rules", () => {
    const html =
      "<style>.sm_p-4{@media (min-width:40rem){padding:1rem!important}}</style>";
    const result = downlevelCSS(html);
    expect(result).toContain("@media");
    expect(result).toContain(".sm_p-4");
    // The @media should wrap the selector, not be nested inside it
    const mediaIdx = result.indexOf("@media");
    const selectorIdx = result.indexOf(".sm_p-4", mediaIdx);
    expect(selectorIdx).toBeGreaterThan(mediaIdx);
  });

  test("CSS variables resolved within same stylesheet", () => {
    const html =
      "<style>:root { --color: red } .foo { color: var(--color) }</style>";
    const result = downlevelCSS(html);
    expect(result).toContain("red");
    expect(result).not.toContain("var(--color)");
  });

  test("normal CSS passes through unchanged (no data loss)", () => {
    const html =
      '<div style="color: red; font-size: 16px; margin: 10px">text</div>';
    const result = downlevelCSS(html);
    expect(result).toContain("color");
    expect(result).toContain("red");
    expect(result).toContain("font-size");
    expect(result).toContain("16px");
    expect(result).toContain("margin");
    expect(result).toContain("10px");
  });
});

// =============================================================================
// 3. Plain text conversion (toPlainText)
// =============================================================================

describe("toPlainText", () => {
  test("basic paragraph", () => {
    const result = toPlainText("<p>Hello world</p>");
    expect(result).toContain("Hello world");
  });

  test("link with different text includes href in parens", () => {
    const result = toPlainText(
      '<a href="https://example.com">Click here</a>',
    );
    expect(result).toContain("Click here (https://example.com)");
  });

  test("link where text matches href shows URL once", () => {
    const result = toPlainText(
      '<a href="https://example.com">https://example.com</a>',
    );
    expect(result).toContain("https://example.com");
    // Should NOT duplicate the URL
    const count = result.split("https://example.com").length - 1;
    expect(count).toBe(1);
  });

  test("image alt text", () => {
    const result = toPlainText('<img alt="Photo" src="photo.jpg">');
    expect(result).toContain("Photo");
  });

  test("style/script removal", () => {
    const result = toPlainText("<style>.foo{}</style><p>Hello</p>");
    expect(result).toContain("Hello");
    expect(result).not.toContain(".foo");
  });

  test("line breaks", () => {
    const result = toPlainText("Hello<br>World");
    expect(result).toContain("Hello\nWorld");
  });

  test("<hr> → ---", () => {
    const result = toPlainText("<p>Above</p><hr><p>Below</p>");
    expect(result).toContain("---");
  });

  test("list items", () => {
    const result = toPlainText("<ul><li>One</li><li>Two</li></ul>");
    expect(result).toContain("- One");
    expect(result).toContain("- Two");
  });

  test("strips data-skip-in-text elements", () => {
    const result = toPlainText(
      '<div data-skip-in-text="true">Skip</div><p>Keep</p>',
    );
    expect(result).toContain("Keep");
    expect(result).not.toContain("Skip");
  });
});

// =============================================================================
// 4. Transform pipeline integration
// =============================================================================

describe("transformForClient integration", () => {
  test("downleveling happens before transform: oklch → rgb in output", () => {
    const html = '<div style="color: oklch(0.7 0.15 180)">text</div>';
    const result = transformForClient(html, "gmail-web");
    expect(result.html).toContain("rgb(");
    expect(result.html).not.toContain("oklch");
  });

  test("@media prefers-color-scheme preserved for Gmail", () => {
    const html = `
      <style>
        @media (prefers-color-scheme: dark) {
          .dark { color: white; }
        }
      </style>
      <div class="dark">text</div>
    `;
    const result = transformForClient(html, "gmail-web");
    expect(result.html).toContain("prefers-color-scheme");
  });
});
