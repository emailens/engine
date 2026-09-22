import { describe, it, expect } from "bun:test";
import * as cheerio from "cheerio";
import { extractCssVariables, resolveCssValue, usesCustomProperties } from "../css-variables";
import { analyzeEmail } from "../analyze";
import { checkAccessibility } from "../accessibility-checker";
import { parseColor } from "../color-utils";

describe("Phase 1: CSS Variables Engine", () => {
  describe("usesCustomProperties", () => {
    it("detects custom property declarations", () => {
      expect(usesCustomProperties("--brand-color")).toBe(true);
      expect(usesCustomProperties("--spacing-lg", "16px")).toBe(true);
      expect(usesCustomProperties("color", "#333")).toBe(false);
    });

    it("detects var() usage in values", () => {
      expect(usesCustomProperties("color", "var(--brand-color)")).toBe(true);
      expect(usesCustomProperties("border", "1px solid var(--border-color, #ccc)")).toBe(true);
      expect(usesCustomProperties("background", "linear-gradient(to right, var(--c1), var(--c2))")).toBe(true);
      expect(usesCustomProperties("margin", "10px 0")).toBe(false);
    });
  });

  describe("extractCssVariables", () => {
    it("extracts custom properties from <style> blocks", () => {
      const html = `
        <style>
          :root {
            --primary: #007bff;
            --secondary: #6c757d;
          }
          body {
            --font-size: 16px;
          }
        </style>
      `;
      const $ = cheerio.load(html);
      const vars = extractCssVariables($);
      expect(vars.get("--primary")).toBe("#007bff");
      expect(vars.get("--secondary")).toBe("#6c757d");
      expect(vars.get("--font-size")).toBe("16px");
    });

    it("extracts custom properties from inline styles", () => {
      const html = `
        <div style="--card-bg: #ffffff; --card-padding: 20px;">
          <p style="--text-color: #333333;">Hello</p>
        </div>
      `;
      const $ = cheerio.load(html);
      const vars = extractCssVariables($);
      expect(vars.get("--card-bg")).toBe("#ffffff");
      expect(vars.get("--card-padding")).toBe("20px");
      expect(vars.get("--text-color")).toBe("#333333");
    });

    it("handles lowercase normalization", () => {
      const html = `<style>:root { --MyColor: #ff0000; }</style>`;
      const $ = cheerio.load(html);
      const vars = extractCssVariables($);
      expect(vars.get("--mycolor")).toBe("#ff0000");
    });
  });

  describe("resolveCssValue", () => {
    it("resolves direct variable replacement", () => {
      const vars = new Map([["--brand", "#007bff"]]);
      const res = resolveCssValue("var(--brand)", vars);
      expect(res.resolved).toBe("#007bff");
      expect(res.hadUnresolved).toBe(false);
      expect(res.usedVars).toEqual(["--brand"]);
    });

    it("resolves variable inside compound expression", () => {
      const vars = new Map([["--border-color", "#dddddd"]]);
      const res = resolveCssValue("1px solid var(--border-color)", vars);
      expect(res.resolved).toBe("1px solid #dddddd");
    });

    it("uses fallback when variable is not defined", () => {
      const vars = new Map<string, string>();
      const res = resolveCssValue("var(--missing, #444444)", vars);
      expect(res.resolved).toBe("#444444");
      expect(res.hadUnresolved).toBe(false);
    });

    it("resolves chained variables", () => {
      const vars = new Map([
        ["--a", "var(--b)"],
        ["--b", "var(--c)"],
        ["--c", "#123456"],
      ]);
      const res = resolveCssValue("var(--a)", vars);
      expect(res.resolved).toBe("#123456");
      expect(res.hadUnresolved).toBe(false);
    });

    it("resolves nested fallbacks", () => {
      const vars = new Map([["--theme-accent", "green"]]);
      const res = resolveCssValue("var(--missing1, var(--missing2, var(--theme-accent, red)))", vars);
      expect(res.resolved).toBe("green");
    });

    it("prevents infinite loops on circular references", () => {
      const vars = new Map([
        ["--loop-a", "var(--loop-b)"],
        ["--loop-b", "var(--loop-a)"],
      ]);
      const res = resolveCssValue("var(--loop-a, fallback)", vars);
      expect(res.hadUnresolved).toBe(true);
      expect(res.resolved).toBe("fallback");
    });

    it("handles fallback with commas (e.g. font-stack)", () => {
      const vars = new Map<string, string>();
      const res = resolveCssValue('var(--fonts, Arial, Helvetica, sans-serif)', vars);
      expect(res.resolved).toBe('Arial, Helvetica, sans-serif');
    });
  });

  describe("color-utils parseColor with variables", () => {
    it("parses color when variable is provided", () => {
      const vars = new Map([["--btn-bg", "#28a745"]]);
      const parsed = parseColor("var(--btn-bg)", vars);
      expect(parsed).toEqual({ r: 40, g: 167, b: 69, a: 1 });
    });

    it("parses color from fallback when variable is missing", () => {
      const vars = new Map<string, string>();
      const parsed = parseColor("var(--missing, #dc3545)", vars);
      expect(parsed).toEqual({ r: 220, g: 53, b: 69, a: 1 });
    });

    it("returns null for unresolvable variable without fallback", () => {
      const vars = new Map<string, string>();
      const parsed = parseColor("var(--missing)", vars);
      expect(parsed).toBeNull();
    });
  });

  describe("analyzeEmail Can I Email custom-properties detection", () => {
    it("flags custom-properties on Gmail, Outlook Windows, and Yahoo Mail", () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            :root {
              --main-bg: #f8f9fa;
            }
            .content {
              background-color: var(--main-bg);
            }
          </style>
        </head>
        <body>
          <div class="content">Hello</div>
        </body>
        </html>
      `;
      const warnings = analyzeEmail(html);
      const customPropWarnings = warnings.filter((w) => w.property === "custom-properties");

      expect(customPropWarnings.length).toBeGreaterThan(0);
      const clientsWithWarning = customPropWarnings.map((w) => w.client);
      expect(clientsWithWarning).toContain("gmail-web");
      expect(clientsWithWarning).toContain("outlook-windows-legacy");
      expect(clientsWithWarning).toContain("yahoo-mail");
    });

    it("flags custom-properties in inline styles", () => {
      const html = `<div style="--highlight: yellow; color: var(--highlight);">Warning test</div>`;
      const warnings = analyzeEmail(html);
      const customPropWarnings = warnings.filter((w) => w.property === "custom-properties");
      expect(customPropWarnings.length).toBeGreaterThan(0);
      expect(customPropWarnings.some((w) => w.client === "gmail-web")).toBe(true);
    });

    it("resolves custom properties so value caveats can inspect computed values", () => {
      // In value-caveats: negative margins trigger caveat for Yahoo Mail / Outlook
      const html = `
        <style>
          :root {
            --negative-space: -15px;
          }
          .box {
            margin: var(--negative-space);
          }
        </style>
        <div class="box">Negative margin test</div>
      `;
      const warnings = analyzeEmail(html);
      // Yahoo Mail notes say negative margins are not supported
      const marginWarnings = warnings.filter((w) => w.property === "margin" && w.client.includes("yahoo"));
      expect(marginWarnings.length).toBeGreaterThan(0);
    });
  });

  describe("checkAccessibility color contrast with variables", () => {
    it("computes contrast correctly when text color uses a CSS variable", () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Test Email</title>
          <style>
            :root {
              --light-text: #ffffff;
              --dark-bg: #000000;
            }
            body {
              background-color: var(--dark-bg);
              color: var(--light-text);
            }
          </style>
        </head>
        <body>
          <p>High contrast visible text</p>
        </body>
        </html>
      `;
      const report = checkAccessibility(html);
      const contrastIssues = report.issues.filter((i) => i.rule === "low-contrast");
      // White text on black background has 21:1 contrast ratio (AAA), should NOT have contrast issues
      expect(contrastIssues.length).toBe(0);
    });

    it("detects low contrast when resolved CSS variable fails WCAG", () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Test Email</title>
          <style>
            :root {
              --dim-gray: #777777;
              --dark-bg: #555555;
            }
            body {
              background-color: var(--dark-bg);
              color: var(--dim-gray);
            }
          </style>
        </head>
        <body>
          <p>Low contrast bad text</p>
        </body>
        </html>
      `;
      const report = checkAccessibility(html);
      const contrastIssues = report.issues.filter((i) => i.rule === "low-contrast");
      // #777777 on #555555 fails contrast
      expect(contrastIssues.length).toBeGreaterThan(0);
    });
  });
});
