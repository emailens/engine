import { describe, expect, test } from "bun:test";
import { contrastRatio, parseColor, relativeLuminance, simulateDarkMode } from "../index";

// Real Gmail Android app, dark theme, 2026-10-30: each row's text and
// background read off the screenshot pixels (emailens.dev
// apps/app/fidelity/probes/gmail-app-dark-grade.ts). [sent fg, sent bg, real fg, real bg]
const MEASURED: Array<[string, string, string, string]> = [
  ["#555555", "#ffffff", "#b5b5b5", "#121212"],
  ["#333333", "#ffffff", "#dfdfdf", "#121212"],
  ["#777777", "#ffffff", "#909090", "#121212"],
  ["#999999", "#ffffff", "#999999", "#121212"],
  ["#ffffff", "#1d4ed8", "#ffffff", "#1d4ed8"],
  ["#ffffff", "#1e3a8a", "#ffffff", "#1e3a8a"],
  ["#ffffff", "#dc2626", "#ffffff", "#dc2626"],
  ["#111111", "#f4f4f5", "#ffffff", "#232324"],
  ["#1d4ed8", "#ffffff", "#99a4ff", "#121212"],
  ["#333333", "#eeeae4", "#dfdfdf", "#2d2a25"],
  ["#ffffff", "#000000", "#ffffff", "#000000"],
  ["#6b7280", "#f9fafb", "#9097a6", "#1e1f20"],
];

const ratio = (a: string, b: string) => {
  const x = parseColor(a)!, y = parseColor(b)!;
  return contrastRatio(relativeLuminance(x.r, x.g, x.b), relativeLuminance(y.r, y.g, y.b));
};

// Colours the first, fitted model never saw: it agreed on 10 of 12 at the WCAG
// line, the generic invert on 6, and the WebView rule now on all 12.
const HELDOUT: Array<[string, string, string, string]> = [
  ["#111111", "#f59e0b", "#ffffff", "#f59e0b"],
  ["#1f2937", "#fde68a", "#e3eeff", "#382c00"],
  ["#111827", "#93c5fd", "#f8ffff", "#93c5fd"],
  ["#ffffff", "#9ca3af", "#ffffff", "#9ca3af"],
  ["#374151", "#d1d5db", "#c4cfe3", "#383b40"],
  ["#dc2626", "#ffffff", "#ff5141", "#121212"],
  ["#16a34a", "#ffffff", "#008e37", "#121212"],
  ["#7c3aed", "#ffffff", "#c87dff", "#121212"],
  ["#9ca3af", "#1f2937", "#9ca3af", "#1f2937"],
  ["#0f766e", "#ccfbf1", "#56afa5", "#002c25"],
  ["#ffffff", "#16a34a", "#ffffff", "#16a34a"],
  ["#444444", "#e5e7eb", "#cacaca", "#2b2d30"],
];
const KNOWN_MISSES = new Set<string>();

function simulated(fg: string, bg: string): number {
  const html = `<html><body><table><tr><td style="background-color:${bg};color:${fg}">x</td></tr></table></body></html>`;
  const style = simulateDarkMode(html, "gmail-android").html.match(/<td style="([^"]*)"/)![1];
  const get = (p: string) => style.split(";").map((d) => d.split(":").map((s) => s.trim())).find((d) => d[0] === p)![1];
  return ratio(get("color"), get("background-color"));
}

describe("gmail-android dark mode on held-out colours", () => {
  for (const [fg, bg, realFg, realBg] of HELDOUT) {
    const name = `${fg} on ${bg}`;
    test(name, () => {
      const agrees = (simulated(fg, bg) >= 4.5) === (ratio(realFg, realBg) >= 4.5);
      expect(agrees).toBe(!KNOWN_MISSES.has(name));
    });
  }
});

describe("gmail-android dark mode matches the real app", () => {
  for (const [fg, bg, realFg, realBg] of MEASURED) {
    test(`${fg} on ${bg}`, () => {
      const sim = simulated(fg, bg);
      const real = ratio(realFg, realBg);
      // Same verdict at the WCAG line, and the ratio within 25% of the phone's.
      expect(sim >= 4.5).toBe(real >= 4.5);
      expect(Math.abs(sim - real) / real).toBeLessThan(0.25);
    });
  }
});

// Measured on the Gmail app, 2026-10-31. The rule predicted 423 of 424 frozen
// held-out rows within 4/255 (emailens.dev docs/fidelity/gmail-android-dark-2026-10-31.md).
describe("gmail-android dark mode follows the WebView's rule", () => {
  const colours = (fg: string, bg: string) => {
    const html = `<html><body><table><tr><td style="background-color:${bg};color:${fg}">x</td></tr></table></body></html>`;
    const style = simulateDarkMode(html, "gmail-android").html.match(/<td style="([^"]*)"/)![1];
    const get = (p: string) => style.split(";").map((d) => d.split(":").map((s) => s.trim())).find((d) => d[0] === p)![1];
    return { fg: get("color"), bg: get("background-color") };
  };

  test("text flips below brightness 150, and mid-tones get darker", () => {
    expect(colours("#649b79", "#ffffff").fg).toBe("#4e8463");
    expect(colours("#97ba6f", "#ffffff").fg).toBe("#97ba6f");
  });

  test("a text colour does not depend on its background", () => {
    const fg = "#16a34a";
    expect(colours(fg, "#ffffff").fg).toBe(colours(fg, "#e5e7eb").fg);
  });

  test("a background flips above brightness 206", () => {
    expect(colours("#111111", "#d1d5db").bg).toBe("#383c40");
    expect(colours("#111111", "#5fd604").bg).toBe("#5fd604");
  });

  for (const [bg, real] of [
    ["#ffffff", "#121212"],
    ["#fefefe", "#121212"],
    ["#fdfdfd", "#1d1d1d"],
    ["#fcfcfc", "#121212"],
    ["#fafafa", "#1f1f1f"],
    ["#f9f9f9", "#121212"],
    ["#f8f8f8", "#202020"],
  ]) {
    test(`near-white ${bg}`, () => {
      const { r } = parseColor(colours("#111111", bg).bg)!;
      expect(Math.abs(r - parseColor(real)!.r)).toBeLessThanOrEqual(2);
    });
  }
});
