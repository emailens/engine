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

describe("gmail-android dark mode matches the real app", () => {
  for (const [fg, bg, realFg, realBg] of MEASURED) {
    test(`${fg} on ${bg}`, () => {
      const html = `<html><body><table><tr><td style="background-color:${bg};color:${fg}">x</td></tr></table></body></html>`;
      const style = simulateDarkMode(html, "gmail-android").html.match(/<td style="([^"]*)"/)![1];
      const get = (p: string) => style.split(";").map((d) => d.split(":").map((s) => s.trim())).find((d) => d[0] === p)![1];
      const sim = ratio(get("color"), get("background-color"));
      const real = ratio(realFg, realBg);
      // Same verdict at the WCAG line, and the ratio within 25% of the phone's.
      expect(sim >= 4.5).toBe(real >= 4.5);
      expect(Math.abs(sim - real) / real).toBeLessThan(0.25);
    });
  }
});
