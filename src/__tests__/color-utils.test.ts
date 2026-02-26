import { describe, test, expect } from "bun:test";
import { parseColor, relativeLuminance, contrastRatio, wcagGrade, alphaBlend } from "../color-utils";

// ============================================================================
// parseColor
// ============================================================================

describe("color-utils — parseColor", () => {
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

describe("color-utils — relativeLuminance", () => {
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

describe("color-utils — contrastRatio", () => {
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

describe("color-utils — wcagGrade", () => {
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

describe("color-utils — alphaBlend", () => {
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
