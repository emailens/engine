import { describe, test, expect } from "bun:test";
import { parseColor, relativeLuminance, contrastRatio, wcagGrade, alphaBlend, backgroundShorthandColor } from "../color-utils";

// ============================================================================
// parseColor
// ============================================================================

describe("color-utils: parseColor", () => {
  test("parses 3-digit hex (#fff)", () => {
    const c = parseColor("#fff");
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test("parses 6-digit hex (#000000)", () => {
    const c = parseColor("#000000");
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test("parses 6-digit hex (#ffffff)", () => {
    const c = parseColor("#ffffff");
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test("parses rgb(255,255,255)", () => {
    const c = parseColor("rgb(255, 255, 255)");
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test("parses rgba(0,0,0,0.5)", () => {
    const c = parseColor("rgba(0, 0, 0, 0.5)");
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  test("parses named color white", () => {
    const c = parseColor("white");
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test("parses named color red", () => {
    const c = parseColor("red");
    expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  test("parses transparent", () => {
    const c = parseColor("transparent");
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test("returns null for var(--color)", () => {
    expect(parseColor("var(--color)")).toBeNull();
  });

  test("returns null for inherit", () => {
    expect(parseColor("inherit")).toBeNull();
  });

  test("returns null for currentColor", () => {
    expect(parseColor("currentColor")).toBeNull();
  });
});

// ============================================================================
// relativeLuminance
// ============================================================================

describe("color-utils: relativeLuminance", () => {
  test("white has luminance ~1", () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 2);
  });

  test("black has luminance ~0", () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 2);
  });
});

// ============================================================================
// contrastRatio
// ============================================================================

describe("color-utils: contrastRatio", () => {
  test("black on white ≈ 21:1", () => {
    const lWhite = relativeLuminance(255, 255, 255);
    const lBlack = relativeLuminance(0, 0, 0);
    expect(contrastRatio(lWhite, lBlack)).toBeCloseTo(21, 0);
  });

  test("same color ≈ 1:1", () => {
    const l = relativeLuminance(128, 128, 128);
    expect(contrastRatio(l, l)).toBeCloseTo(1, 2);
  });
});

// ============================================================================
// wcagGrade
// ============================================================================

describe("color-utils: wcagGrade", () => {
  test("21:1 → AAA", () => {
    expect(wcagGrade(21)).toBe("AAA");
  });

  test("7:1 → AAA", () => {
    expect(wcagGrade(7)).toBe("AAA");
  });

  test("4.5:1 → AA", () => {
    expect(wcagGrade(4.5)).toBe("AA");
  });

  test("3:1 → AA Large", () => {
    expect(wcagGrade(3)).toBe("AA Large");
  });

  test("2:1 → Fail", () => {
    expect(wcagGrade(2)).toBe("Fail");
  });
});

// ============================================================================
// alphaBlend
// ============================================================================

describe("color-utils: alphaBlend", () => {
  test("opaque foreground ignores background", () => {
    const result = alphaBlend({ r: 255, g: 0, b: 0, a: 1 }, 0, 0, 255);
    expect(result).toEqual([255, 0, 0]);
  });

  test("50% alpha blends equally", () => {
    const [r, g, b] = alphaBlend({ r: 0, g: 0, b: 0, a: 0.5 }, 255, 255, 255);
    // 0*0.5 + 255*0.5 = 127.5 → 128
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });
});

// Preview J9vFS4nm_LGl (2026-10-30): a CTA with
// `background: radial-gradient(73.32% 826.89% at 100% 50%, #F024F6 0%, ...)`.
// Splitting on spaces left `#F024F6` outside any "(" token, so the stop was
// taken as the fallback colour and Outlook Classic got a magenta button; real
// Word painted nothing.
describe("backgroundShorthandColor skips gradient stops", () => {
  test("a gradient with spaced arguments has no solid colour", () => {
    expect(
      backgroundShorthandColor(
        "radial-gradient(73.32% 826.89% at 100% 50%, #F024F6 0%, #8200FA 100%)",
      ),
    ).toBeNull();
  });
  test("a colour beside the gradient is still found", () => {
    expect(
      backgroundShorthandColor("#111 linear-gradient(90deg, #F024F6 0%, #000 100%)"),
    ).toBe("#111");
  });
});

describe("Outlook Classic and a radial-gradient CTA (J9vFS4nm_LGl)", () => {
  test("Word paints no fill, so the button keeps no background", async () => {
    const { transformForClient } = await import("../index");
    const html = `<html><body><a href="#" style="display:block;color:#ffffff;background:radial-gradient(73.32% 826.89% at 100% 50%, #F024F6 0%, #8200FA 100%);padding:14px 16px">Start</a></body></html>`;
    const out = transformForClient(html, "outlook-windows-legacy");
    const tag = (typeof out === "string" ? out : out.html).match(/<a[^>]*>/)?.[0];
    expect(tag).not.toMatch(/background/);
  });
});
