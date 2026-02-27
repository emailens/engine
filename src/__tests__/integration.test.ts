import { describe, test, expect } from "bun:test";
import {
  analyzeEmail,
  generateCompatibilityScore,
  transformForAllClients,
  diffResults,
  auditEmail,
} from "../index";

describe("Full pipeline integration", () => {
  const COMPLEX_HTML = `
<html lang="en">
<head>
  <title>Newsletter</title>
  <style>
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #6d28d9, #4f46e5); padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #6d28d9;
              color: #ffffff; border-radius: 6px; text-decoration: none; }
    @media (max-width: 600px) { .container { width: 100% !important; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #6d28d9, #4f46e5); padding: 20px;">
      <h1 style="color: #ffffff; font-size: 24px;">Welcome</h1>
    </div>
    <table role="presentation" width="100%">
      <tr>
        <td style="padding: 20px; color: #333333; font-size: 16px; background-color: #ffffff;">
          <p>Hello! This is our newsletter.</p>
          <a href="https://example.com" class="button"
             style="display: inline-block; padding: 12px 24px; background-color: #6d28d9;
                    color: #ffffff; border-radius: 6px; text-decoration: none;">
            Get Started
          </a>
          <br/><br/>
          <img src="https://example.com/hero.png" alt="Hero image" width="600" height="300" style="display:block;" />
          <p>Thanks for reading!</p>
          <a href="https://example.com/unsubscribe">Unsubscribe</a>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

  test("analyze → score → transform → diff pipeline", () => {
    // Step 1: Analyze
    const warnings = analyzeEmail(COMPLEX_HTML);
    expect(warnings.length).toBeGreaterThan(0);

    // Step 2: Score
    const scores = generateCompatibilityScore(warnings);
    expect(Object.keys(scores).length).toBeGreaterThanOrEqual(10);
    for (const [_id, score] of Object.entries(scores)) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
    }

    // Step 3: Transform for all clients
    const transforms = transformForAllClients(COMPLEX_HTML);
    expect(transforms.length).toBeGreaterThanOrEqual(10);
    for (const result of transforms) {
      expect(result.clientId).toBeTruthy();
      expect(result.html).toBeTruthy();
      expect(Array.isArray(result.warnings)).toBe(true);
    }

    // Step 4: Diff (before vs. after a fix)
    const fixedHtml = COMPLEX_HTML.replace(/linear-gradient\([^)]+\)/g, "#6d28d9");
    const warningsBefore = analyzeEmail(COMPLEX_HTML);
    const warningsAfter = analyzeEmail(fixedHtml);
    const scoresBefore = generateCompatibilityScore(warningsBefore);
    const scoresAfter = generateCompatibilityScore(warningsAfter);
    const diffs = diffResults(
      { scores: scoresBefore, warnings: warningsBefore },
      { scores: scoresAfter, warnings: warningsAfter },
    );
    expect(diffs.length).toBeGreaterThan(0);
    for (const d of diffs) {
      expect(d).toHaveProperty("clientId");
      expect(d).toHaveProperty("scoreBefore");
      expect(d).toHaveProperty("scoreAfter");
      expect(d).toHaveProperty("scoreDelta");
    }
  });

  test("auditEmail full pipeline", () => {
    const report = auditEmail(COMPLEX_HTML);

    // Compatibility
    expect(report.compatibility.warnings.length).toBeGreaterThan(0);
    expect(Object.keys(report.compatibility.scores).length).toBeGreaterThanOrEqual(10);

    // Spam — should be clean (has unsubscribe link)
    expect(report.spam.score).toBeGreaterThanOrEqual(70);

    // Links
    expect(report.links.totalLinks).toBeGreaterThan(0);
    expect(report.links.breakdown.https).toBeGreaterThan(0);

    // Accessibility
    expect(typeof report.accessibility.score).toBe("number");

    // Images
    expect(report.images.total).toBeGreaterThan(0);
  });

  test("auditEmail with framework='jsx'", () => {
    const report = auditEmail(COMPLEX_HTML, { framework: "jsx" });

    // Should have framework-specific fix snippets
    const warningsWithFix = report.compatibility.warnings.filter(w => w.fix);
    if (warningsWithFix.length > 0) {
      const hasJsxFix = warningsWithFix.some(
        w => w.fix?.language === "jsx" || w.fix?.language === "html"
      );
      expect(hasJsxFix).toBe(true);
    }
  });
});

describe("Warning helpers", () => {
  const {
    warningsForClient,
    errorWarnings,
    structuralWarnings,
  } = require("../analyze");

  const STYLED_HTML = `
<html><head><style>.x { display: flex; }</style></head>
<body>
  <div style="display: flex; gap: 10px;">
    <svg><circle r="10" /></svg>
    <form><input type="text" /></form>
  </div>
</body>
</html>`;

  test("warningsForClient filters by client", () => {
    const allWarnings = analyzeEmail(STYLED_HTML);
    const gmailOnly = warningsForClient(allWarnings, "gmail-web");
    expect(gmailOnly.length).toBeGreaterThan(0);
    expect(gmailOnly.every((w: any) => w.client === "gmail-web")).toBe(true);
  });

  test("errorWarnings filters by severity", () => {
    const allWarnings = analyzeEmail(STYLED_HTML);
    const errors = errorWarnings(allWarnings);
    expect(errors.every((w: any) => w.severity === "error")).toBe(true);
  });

  test("structuralWarnings filters by fixType", () => {
    const allWarnings = analyzeEmail(STYLED_HTML);
    const structural = structuralWarnings(allWarnings);
    expect(structural.every((w: any) => w.fixType === "structural")).toBe(true);
  });
});
