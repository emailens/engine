/**
 * Accuracy Test Harness
 *
 * Tests the emailens engine against KNOWN real-world email client behavior
 * sourced from caniemail.com and documented email client quirks.
 *
 * All three fixture emails are showcase-quality: they intentionally exercise
 * every CSS feature that commonly breaks across email clients:
 *   <style>, @font-face, @media, <svg>, linear-gradient, radial-gradient,
 *   display:flex + gap, display:grid, border-radius, box-shadow, max-width,
 *   position, overflow, text-transform, letter-spacing, opacity, transition
 *
 * Methodology:
 * 1. Feed 3 showcase-quality email templates through transformForClient()
 * 2. For each client, define concrete assertions about what should/shouldn't
 *    appear in the transformed HTML
 * 3. Score: (correct assertions / total assertions) * 100
 *
 * Target: ≥70% accuracy for each individual test, ≥80% overall.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  transformForClient,
  analyzeEmail,
  generateCompatibilityScore,
} from "../index";

// ---------------------------------------------------------------------------
// Load fixtures
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(__dirname, "fixtures");

const templates = {
  transactional: readFileSync(
    join(FIXTURES_DIR, "leemunroe-responsive.html"),
    "utf-8"
  ),
  newsletter: readFileSync(
    join(FIXTURES_DIR, "cerberus-newsletter.html"),
    "utf-8"
  ),
  receipt: readFileSync(
    join(FIXTURES_DIR, "receipt-notification.html"),
    "utf-8"
  ),
};

// ---------------------------------------------------------------------------
// Test helper: count pass/fail assertions
// ---------------------------------------------------------------------------

interface AssertionResult {
  description: string;
  passed: boolean;
  details?: string;
}

class AccuracyTracker {
  results: AssertionResult[] = [];

  check(description: string, condition: boolean, details?: string) {
    this.results.push({ description, passed: condition, details });
  }

  get score(): number {
    if (this.results.length === 0) return 0;
    const passed = this.results.filter((r) => r.passed).length;
    return Math.round((passed / this.results.length) * 100);
  }

  get summary(): string {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed);
    let msg = `Score: ${this.score}% (${passed}/${this.results.length})\n`;
    if (failed.length > 0) {
      msg += "Failures:\n";
      for (const f of failed) {
        msg += `  ✗ ${f.description}${f.details ? ` (${f.details})` : ""}\n`;
      }
    }
    return msg;
  }
}

// ---------------------------------------------------------------------------
// GMAIL ACCURACY TESTS
// ---------------------------------------------------------------------------

describe("Gmail Transform Accuracy", () => {
  // Transactional: Attic welcome email (flex, grid, gradient, shadow, etc.)
  test("Template 1 (Transactional) — Gmail Web", () => {
    const tracker = new AccuracyTracker();
    const result = transformForClient(templates.transactional, "gmail-web");
    const html = result.html;

    // Gmail MUST strip <style> blocks
    tracker.check(
      "Strips <style> blocks",
      !/<style[\s>]/.test(html),
    );

    // Gmail should have inlined CSS before stripping <style>
    tracker.check(
      "Inlines CSS before stripping <style>",
      /border-radius/.test(html),
      "border-radius from .card should be inlined"
    );

    // Gmail keeps border-radius in inline styles
    tracker.check("Keeps border-radius", /border-radius/.test(html));

    // Gmail keeps color
    tracker.check(
      "Keeps color property",
      /\bcolor\s*:/.test(html),
    );

    // Gmail keeps background-color
    tracker.check("Keeps background-color", /background-color/.test(html));

    // Gmail keeps font-family
    tracker.check("Keeps font-family", /font-family/.test(html));

    // Gmail keeps padding
    tracker.check("Keeps padding", /padding/.test(html));

    // Gmail keeps text-align
    tracker.check("Keeps text-align", /text-align/.test(html));

    // Gmail keeps text-transform
    tracker.check("Keeps text-transform", /text-transform/.test(html));

    // Gmail keeps letter-spacing
    tracker.check("Keeps letter-spacing", /letter-spacing/.test(html));

    // Gmail keeps max-width
    tracker.check("Keeps max-width", /max-width/.test(html));

    // Gmail keeps display (basic values like flex, block, inline-block)
    tracker.check(
      "Keeps display property",
      /(style="[^"]*display\s*:)/.test(html),
    );

    // Gmail strips box-shadow from inline styles
    tracker.check(
      "Strips box-shadow",
      !/(style="[^"]*box-shadow\s*:)/.test(html),
    );

    // Gmail strips position from inline styles
    tracker.check(
      "Strips position",
      !/(style="[^"]*\bposition\s*:)/.test(html),
    );

    // Gmail strips opacity from inline styles
    tracker.check(
      "Strips opacity",
      !/(style="[^"]*\bopacity\s*:)/.test(html),
    );

    // Gmail strips overflow from inline styles
    tracker.check(
      "Strips overflow",
      !/(style="[^"]*\boverflow\s*:)/.test(html),
    );

    // Gmail strips transition from inline styles
    tracker.check(
      "Strips transition",
      !/(style="[^"]*transition\s*:)/.test(html),
    );

    // Gmail strips gap from inline styles
    tracker.check(
      "Strips gap",
      !/(style="[^"]*\bgap\s*:)/.test(html),
    );

    // Gmail strips display:grid
    tracker.check(
      "Strips display:grid",
      !/(style="[^"]*display\s*:\s*grid)/.test(html),
    );

    // Gmail strips linear-gradient from background
    tracker.check(
      "Strips linear-gradient",
      !/(style="[^"]*linear-gradient)/.test(html),
    );

    // Gmail strips radial-gradient
    tracker.check(
      "Strips radial-gradient",
      !/(style="[^"]*radial-gradient)/.test(html),
    );

    console.log(`\n--- Gmail Web + Transactional ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });

  // Newsletter: Craft Weekly (font-face, gradients, grid, shadows, etc.)
  test("Template 2 (Newsletter) — Gmail Web", () => {
    const tracker = new AccuracyTracker();
    const result = transformForClient(templates.newsletter, "gmail-web");
    const html = result.html;

    // Gmail strips <style>
    tracker.check("Strips <style> blocks", !/<style[\s>]/.test(html));

    // Gmail strips @font-face (was in <style> block)
    tracker.check("No @font-face rules remain", !html.includes("@font-face"));

    // Gmail strips box-shadow from inline styles
    tracker.check(
      "Strips box-shadow",
      !/(style="[^"]*box-shadow\s*:)/.test(html),
    );

    // Gmail strips linear-gradient
    tracker.check(
      "Strips linear-gradient",
      !/(style="[^"]*linear-gradient)/.test(html),
    );

    // Gmail strips radial-gradient
    tracker.check(
      "Strips radial-gradient",
      !/(style="[^"]*radial-gradient)/.test(html),
    );

    // Gmail strips transition
    tracker.check(
      "Strips transition",
      !/(style="[^"]*transition\s*:)/.test(html),
    );

    // Gmail strips position
    tracker.check(
      "Strips position",
      !/(style="[^"]*\bposition\s*:)/.test(html),
    );

    // Gmail strips overflow
    tracker.check(
      "Strips overflow",
      !/(style="[^"]*\boverflow\s*:)/.test(html),
    );

    // Gmail strips opacity
    tracker.check(
      "Strips opacity",
      !/(style="[^"]*\bopacity\s*:)/.test(html),
    );

    // Gmail strips display:grid
    tracker.check(
      "Strips display:grid",
      !/(style="[^"]*display\s*:\s*grid)/.test(html),
    );

    // Gmail strips gap
    tracker.check(
      "Strips gap",
      !/(style="[^"]*\bgap\s*:)/.test(html),
    );

    // Gmail keeps border-radius
    tracker.check("Keeps border-radius", /border-radius/.test(html));

    // Gmail keeps font-weight
    tracker.check("Keeps font-weight", /font-weight/.test(html));

    // Gmail keeps letter-spacing
    tracker.check("Keeps letter-spacing", /letter-spacing/.test(html));

    // Gmail keeps text-transform
    tracker.check("Keeps text-transform", /text-transform/.test(html));

    // Gmail keeps max-width
    tracker.check("Keeps max-width", /max-width/.test(html));

    // Gmail keeps font-family
    tracker.check("Keeps font-family", /font-family/.test(html));

    // Warnings should mention @font-face
    tracker.check(
      "Warns about @font-face",
      result.warnings.some((w) => w.property === "@font-face"),
    );

    // Warnings should mention <style> stripping
    tracker.check(
      "Warns about <style> stripping",
      result.warnings.some((w) => w.property === "<style>"),
    );

    console.log(`\n--- Gmail Web + Newsletter ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });

  // Receipt: Haven order confirmation (SVG, grid, flex, shadow, etc.)
  test("Template 3 (Receipt) — Gmail Web", () => {
    const tracker = new AccuracyTracker();
    const result = transformForClient(templates.receipt, "gmail-web");
    const html = result.html;

    // Gmail strips <style>
    tracker.check("Strips <style> blocks", !/<style[\s>]/.test(html));

    // Gmail strips SVG elements
    tracker.check("Strips/replaces SVG elements", !/<svg[\s>]/.test(html));

    // Gmail keeps display:flex
    tracker.check(
      "Keeps display:flex",
      /(style="[^"]*display\s*:\s*flex)/.test(html) || /(style="[^"]*display\s*:flex)/.test(html),
    );

    // Gmail strips display:grid
    tracker.check(
      "Strips display:grid",
      !/(style="[^"]*display\s*:\s*grid)/.test(html),
    );

    // Gmail strips gap
    tracker.check(
      "Strips gap",
      !/(style="[^"]*\bgap\s*:)/.test(html),
    );

    // Gmail strips box-shadow
    tracker.check(
      "Strips box-shadow",
      !/(style="[^"]*box-shadow\s*:)/.test(html),
    );

    // Gmail strips transition
    tracker.check(
      "Strips transition",
      !/(style="[^"]*transition\s*:)/.test(html),
    );

    // Gmail strips overflow
    tracker.check(
      "Strips overflow",
      !/(style="[^"]*\boverflow\s*:)/.test(html),
    );

    // Gmail strips position
    tracker.check(
      "Strips position",
      !/(style="[^"]*\bposition\s*:)/.test(html),
    );

    // Gmail strips opacity
    tracker.check(
      "Strips opacity",
      !/(style="[^"]*\bopacity\s*:)/.test(html),
    );

    // Gmail strips radial-gradient
    tracker.check(
      "Strips radial-gradient",
      !/(style="[^"]*radial-gradient)/.test(html),
    );

    // Gmail keeps border-radius
    tracker.check("Keeps border-radius", /border-radius/.test(html));

    // Gmail keeps background-color
    tracker.check("Keeps background-color", /background-color/.test(html));

    // Gmail keeps font-size
    tracker.check("Keeps font-size", /font-size/.test(html));

    // Gmail keeps font-weight
    tracker.check("Keeps font-weight", /font-weight/.test(html));

    // Gmail keeps text-align
    tracker.check("Keeps text-align", /text-align/.test(html));

    // Gmail keeps border
    tracker.check("Keeps border properties", /border/.test(html));

    // Gmail keeps width
    tracker.check("Keeps width", /\bwidth\s*:/.test(html));

    // Gmail keeps letter-spacing
    tracker.check("Keeps letter-spacing", /letter-spacing/.test(html));

    // Gmail keeps text-transform
    tracker.check("Keeps text-transform", /text-transform/.test(html));

    console.log(`\n--- Gmail Web + Receipt ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// OUTLOOK WINDOWS ACCURACY TESTS
// ---------------------------------------------------------------------------

describe("Outlook Windows Transform Accuracy", () => {
  test("Template 1 (Transactional) — Outlook Windows", () => {
    const tracker = new AccuracyTracker();
    const result = transformForClient(templates.transactional, "outlook-windows");
    const html = result.html;

    // Outlook Windows KEEPS <style> blocks
    tracker.check("Keeps <style> blocks", /<style[\s>]/.test(html));

    // Outlook strips border-radius
    tracker.check(
      "Strips border-radius",
      !/(style="[^"]*border-radius\s*:)/.test(html),
    );

    // Outlook strips box-shadow
    tracker.check(
      "Strips box-shadow",
      !/(style="[^"]*box-shadow\s*:)/.test(html),
    );

    // Outlook strips max-width
    tracker.check(
      "Strips max-width",
      !/(style="[^"]*max-width\s*:)/.test(html),
    );

    // Outlook strips position
    tracker.check(
      "Strips position",
      !/(style="[^"]*\bposition\s*:)/.test(html),
    );

    // Outlook strips display (flex, grid, inline-block)
    tracker.check(
      "Strips display from inline",
      !/(style="[^"]*\bdisplay\s*:\s*(flex|grid|inline-block))/.test(html),
    );

    // Outlook strips overflow
    tracker.check(
      "Strips overflow",
      !/(style="[^"]*\boverflow\s*:)/.test(html),
    );

    // Outlook strips opacity
    tracker.check(
      "Strips opacity",
      !/(style="[^"]*\bopacity\s*:)/.test(html),
    );

    // Outlook strips transition
    tracker.check(
      "Strips transition",
      !/(style="[^"]*transition\s*:)/.test(html),
    );

    // Outlook strips gap
    tracker.check(
      "Strips gap",
      !/(style="[^"]*\bgap\s*:)/.test(html),
    );

    // Outlook strips linear-gradient
    tracker.check(
      "Strips linear-gradient",
      !/(style="[^"]*linear-gradient)/.test(html),
    );

    // Outlook keeps color
    tracker.check("Keeps color", /color/.test(html));

    // Outlook keeps background-color
    tracker.check("Keeps background-color", /background-color/.test(html));

    // Outlook keeps font-family
    tracker.check("Keeps font-family", /font-family/.test(html));

    // Outlook keeps padding
    tracker.check("Keeps padding", /padding/.test(html));

    // Outlook keeps text-align
    tracker.check("Keeps text-align", /text-align/.test(html));

    // Outlook keeps width
    tracker.check("Keeps width", /width/.test(html));

    console.log(`\n--- Outlook Windows + Transactional ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });

  test("Template 2 (Newsletter) — Outlook Windows", () => {
    const tracker = new AccuracyTracker();
    const result = transformForClient(templates.newsletter, "outlook-windows");
    const html = result.html;

    // Outlook keeps <style>
    tracker.check("Keeps <style> blocks", /<style[\s>]/.test(html));

    // Outlook strips border-radius
    tracker.check(
      "Strips border-radius",
      !/(style="[^"]*border-radius\s*:)/.test(html),
    );

    // Outlook strips box-shadow
    tracker.check(
      "Strips box-shadow",
      !/(style="[^"]*box-shadow\s*:)/.test(html),
    );

    // Outlook strips max-width
    tracker.check(
      "Strips max-width",
      !/(style="[^"]*max-width\s*:)/.test(html),
    );

    // Outlook strips linear-gradient
    tracker.check(
      "Strips linear-gradient",
      !/(style="[^"]*linear-gradient)/.test(html),
    );

    // Outlook strips radial-gradient
    tracker.check(
      "Strips radial-gradient",
      !/(style="[^"]*radial-gradient)/.test(html),
    );

    // Outlook strips opacity
    tracker.check(
      "Strips opacity",
      !/(style="[^"]*\bopacity\s*:)/.test(html),
    );

    // Outlook strips overflow
    tracker.check(
      "Strips overflow",
      !/(style="[^"]*\boverflow\s*:)/.test(html),
    );

    // Outlook strips display (flex/grid)
    tracker.check(
      "Strips display (flex/grid)",
      !/(style="[^"]*\bdisplay\s*:\s*(flex|grid|inline-block))/.test(html),
    );

    // Outlook strips transition
    tracker.check(
      "Strips transition",
      !/(style="[^"]*transition\s*:)/.test(html),
    );

    // Outlook strips gap
    tracker.check(
      "Strips gap",
      !/(style="[^"]*\bgap\s*:)/.test(html),
    );

    // Outlook strips position
    tracker.check(
      "Strips position",
      !/(style="[^"]*\bposition\s*:)/.test(html),
    );

    // Outlook keeps color
    tracker.check("Keeps color", /color/.test(html));

    // Outlook keeps font-family
    tracker.check("Keeps font-family", /font-family/.test(html));

    // Outlook keeps font-size
    tracker.check("Keeps font-size", /font-size/.test(html));

    // Outlook keeps font-weight
    tracker.check("Keeps font-weight", /font-weight/.test(html));

    // Outlook keeps padding
    tracker.check("Keeps padding", /padding/.test(html));

    // Outlook keeps text-align
    tracker.check("Keeps text-align", /text-align/.test(html));

    // Warnings should flag flex/grid layout issues
    tracker.check(
      "Warns about flexbox/grid layout",
      result.warnings.some(
        (w) =>
          w.property === "display:flex" ||
          w.property === "display:grid" ||
          w.property === "display" ||
          w.message.toLowerCase().includes("flex") ||
          w.message.toLowerCase().includes("grid")
      ),
    );

    // Warnings should flag background-image
    tracker.check(
      "Warns about background-image/gradient",
      result.warnings.some(
        (w) =>
          w.property === "background-image" ||
          w.property === "linear-gradient" ||
          w.message.toLowerCase().includes("gradient") ||
          w.message.toLowerCase().includes("background")
      ),
    );

    console.log(`\n--- Outlook Windows + Newsletter ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });

  test("Template 3 (Receipt) — Outlook Windows", () => {
    const tracker = new AccuracyTracker();
    const result = transformForClient(templates.receipt, "outlook-windows");
    const html = result.html;

    // Outlook keeps <style>
    tracker.check("Keeps <style> blocks", /<style[\s>]/.test(html));

    // Outlook strips border-radius
    tracker.check(
      "Strips border-radius",
      !/(style="[^"]*border-radius\s*:)/.test(html),
    );

    // Outlook strips box-shadow
    tracker.check(
      "Strips box-shadow",
      !/(style="[^"]*box-shadow\s*:)/.test(html),
    );

    // Outlook strips max-width
    tracker.check(
      "Strips max-width",
      !/(style="[^"]*max-width\s*:)/.test(html),
    );

    // Outlook strips display:flex
    tracker.check(
      "Strips display:flex",
      !/(style="[^"]*display\s*:\s*flex)/.test(html),
    );

    // Outlook strips display:grid
    tracker.check(
      "Strips display:grid",
      !/(style="[^"]*display\s*:\s*grid)/.test(html),
    );

    // Outlook strips gap
    tracker.check(
      "Strips gap",
      !/(style="[^"]*\bgap\s*:)/.test(html),
    );

    // Outlook strips transition
    tracker.check(
      "Strips transition",
      !/(style="[^"]*transition\s*:)/.test(html),
    );

    // Outlook strips overflow
    tracker.check(
      "Strips overflow",
      !/(style="[^"]*\boverflow\s*:)/.test(html),
    );

    // Outlook strips position
    tracker.check(
      "Strips position",
      !/(style="[^"]*\bposition\s*:)/.test(html),
    );

    // Outlook strips opacity
    tracker.check(
      "Strips opacity",
      !/(style="[^"]*\bopacity\s*:)/.test(html),
    );

    // Outlook strips radial-gradient
    tracker.check(
      "Strips radial-gradient",
      !/(style="[^"]*radial-gradient)/.test(html),
    );

    // Outlook keeps color
    tracker.check("Keeps color", /\bcolor\s*:/.test(html));

    // Outlook keeps background-color
    tracker.check("Keeps background-color", /background-color/.test(html));

    // Outlook keeps font-size
    tracker.check("Keeps font-size", /font-size/.test(html));

    // Outlook keeps width
    tracker.check("Keeps width", /\bwidth\s*:/.test(html));

    // Outlook keeps text-align
    tracker.check("Keeps text-align", /text-align/.test(html));

    console.log(`\n--- Outlook Windows + Receipt ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// ANALYZER ACCURACY TESTS
// ---------------------------------------------------------------------------

describe("Analyzer Accuracy", () => {
  test("Correctly identifies issues in newsletter template", () => {
    const tracker = new AccuracyTracker();
    const warnings = analyzeEmail(templates.newsletter);

    // Should detect <style> blocks
    tracker.check(
      "Detects <style> usage",
      warnings.some((w) => w.property === "<style>"),
    );

    // Should detect @font-face
    tracker.check(
      "Detects @font-face",
      warnings.some((w) => w.property === "@font-face"),
    );

    // Should detect @media queries
    tracker.check(
      "Detects @media queries",
      warnings.some((w) => w.property === "@media"),
    );

    // Should detect box-shadow in inline styles
    tracker.check(
      "Detects box-shadow",
      warnings.some((w) => w.property === "box-shadow"),
    );

    // Should detect linear-gradient
    tracker.check(
      "Detects linear-gradient",
      warnings.some((w) => w.property === "linear-gradient"),
    );

    // Should detect display:flex
    tracker.check(
      "Detects display:flex",
      warnings.some((w) => w.property === "display:flex"),
    );

    // Should detect display:grid
    tracker.check(
      "Detects display:grid",
      warnings.some((w) => w.property === "display:grid"),
    );

    // Should detect transition
    tracker.check(
      "Detects transition",
      warnings.some((w) => w.property === "transition"),
    );

    // Should detect overflow
    tracker.check(
      "Detects overflow",
      warnings.some((w) => w.property === "overflow"),
    );

    // Should detect position
    tracker.check(
      "Detects position",
      warnings.some((w) => w.property === "position"),
    );

    // Should detect gap
    tracker.check(
      "Detects gap",
      warnings.some((w) => w.property === "gap"),
    );

    // Should detect opacity
    tracker.check(
      "Detects opacity",
      warnings.some((w) => w.property === "opacity"),
    );

    // Should NOT false-positive on universally supported properties
    const falsePositives = warnings.filter(
      (w) =>
        w.property === "color" ||
        w.property === "font-family" ||
        w.property === "text-align"
    );
    tracker.check(
      "No false positives on color/font-family/text-align",
      falsePositives.length === 0,
      falsePositives.length > 0 ? `Found ${falsePositives.length} false positives` : undefined,
    );

    console.log(`\n--- Analyzer + Newsletter ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });

  test("Correctly identifies issues in receipt template", () => {
    const tracker = new AccuracyTracker();
    const warnings = analyzeEmail(templates.receipt);

    // Should detect <style> blocks
    tracker.check(
      "Detects <style> usage",
      warnings.some((w) => w.property === "<style>"),
    );

    // Should detect SVG
    tracker.check(
      "Detects <svg> elements",
      warnings.some((w) => w.property === "<svg>"),
    );

    // Should detect @font-face
    tracker.check(
      "Detects @font-face",
      warnings.some((w) => w.property === "@font-face"),
    );

    // Should detect @media queries
    tracker.check(
      "Detects @media queries",
      warnings.some((w) => w.property === "@media"),
    );

    // Should detect display:flex in inline styles
    tracker.check(
      "Detects display:flex",
      warnings.some((w) => w.property === "display:flex"),
    );

    // Should detect display:grid in inline styles
    tracker.check(
      "Detects display:grid",
      warnings.some((w) => w.property === "display:grid"),
    );

    // Should detect box-shadow in inline styles
    tracker.check(
      "Detects box-shadow",
      warnings.some((w) => w.property === "box-shadow"),
    );

    // Should detect gap in inline styles
    tracker.check(
      "Detects gap",
      warnings.some((w) => w.property === "gap"),
    );

    // Should detect overflow
    tracker.check(
      "Detects overflow",
      warnings.some((w) => w.property === "overflow"),
    );

    // Should detect transition
    tracker.check(
      "Detects transition",
      warnings.some((w) => w.property === "transition"),
    );

    // Should detect position
    tracker.check(
      "Detects position",
      warnings.some((w) => w.property === "position"),
    );

    // Should detect opacity
    tracker.check(
      "Detects opacity",
      warnings.some((w) => w.property === "opacity"),
    );

    console.log(`\n--- Analyzer + Receipt ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });

  test("Correctly identifies issues in transactional template", () => {
    const tracker = new AccuracyTracker();
    const warnings = analyzeEmail(templates.transactional);

    // Should detect <style> blocks
    tracker.check(
      "Detects <style> usage",
      warnings.some((w) => w.property === "<style>"),
    );

    // Should detect @media queries
    tracker.check(
      "Detects @media queries",
      warnings.some((w) => w.property === "@media"),
    );

    // Should detect display:flex
    tracker.check(
      "Detects display:flex",
      warnings.some((w) => w.property === "display:flex"),
    );

    // Should detect display:grid
    tracker.check(
      "Detects display:grid",
      warnings.some((w) => w.property === "display:grid"),
    );

    // Should detect linear-gradient
    tracker.check(
      "Detects linear-gradient",
      warnings.some((w) => w.property === "linear-gradient"),
    );

    // Should detect box-shadow
    tracker.check(
      "Detects box-shadow",
      warnings.some((w) => w.property === "box-shadow"),
    );

    // Should detect position
    tracker.check(
      "Detects position",
      warnings.some((w) => w.property === "position"),
    );

    // Should detect overflow
    tracker.check(
      "Detects overflow",
      warnings.some((w) => w.property === "overflow"),
    );

    // Should detect transition
    tracker.check(
      "Detects transition",
      warnings.some((w) => w.property === "transition"),
    );

    // Should detect opacity
    tracker.check(
      "Detects opacity",
      warnings.some((w) => w.property === "opacity"),
    );

    // Should detect gap
    tracker.check(
      "Detects gap",
      warnings.some((w) => w.property === "gap"),
    );

    console.log(`\n--- Analyzer + Transactional ---`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// COMPATIBILITY SCORE ACCURACY
// ---------------------------------------------------------------------------

describe("Compatibility Score Accuracy", () => {
  test("Newsletter: Apple Mail scores highest, Gmail/Outlook lower", () => {
    const tracker = new AccuracyTracker();
    const warnings = analyzeEmail(templates.newsletter);
    const scores = generateCompatibilityScore(warnings);

    const appleScore = scores["apple-mail-macos"].score;
    const gmailScore = scores["gmail-web"].score;
    const outlookScore = scores["outlook-windows"].score;

    tracker.check(
      "Apple Mail scores higher than Gmail",
      appleScore > gmailScore,
      `Apple: ${appleScore}, Gmail: ${gmailScore}`,
    );

    tracker.check(
      "Apple Mail scores higher than Outlook Windows",
      appleScore > outlookScore,
      `Apple: ${appleScore}, Outlook: ${outlookScore}`,
    );

    // Gmail should score below 80 — this template is full of unsupported features
    tracker.check(
      "Gmail scores below 80 for modern CSS template",
      gmailScore < 80,
      `Gmail score: ${gmailScore}`,
    );

    // Outlook should score below 80
    tracker.check(
      "Outlook Windows scores below 80 for modern CSS template",
      outlookScore < 80,
      `Outlook score: ${outlookScore}`,
    );

    // Thunderbird (Gecko engine) should score high
    const tbScore = scores["thunderbird"].score;
    tracker.check(
      "Thunderbird scores higher than Gmail",
      tbScore > gmailScore,
      `Thunderbird: ${tbScore}, Gmail: ${gmailScore}`,
    );

    console.log(`\n--- Compatibility Scores (Newsletter) ---`);
    console.log(`Apple Mail: ${appleScore}`);
    console.log(`Gmail Web: ${gmailScore}`);
    console.log(`Outlook Windows: ${outlookScore}`);
    console.log(`Thunderbird: ${tbScore}`);
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(80);
  });

  test("Receipt: scores reflect SVG + grid + flex feature coverage", () => {
    const tracker = new AccuracyTracker();
    const warnings = analyzeEmail(templates.receipt);
    const scores = generateCompatibilityScore(warnings);

    const appleScore = scores["apple-mail-macos"].score;
    const gmailScore = scores["gmail-web"].score;
    const outlookScore = scores["outlook-windows"].score;

    // Apple Mail should score highest
    tracker.check(
      "Apple Mail scores highest",
      appleScore > gmailScore && appleScore > outlookScore,
      `Apple: ${appleScore}, Gmail: ${gmailScore}, Outlook: ${outlookScore}`,
    );

    // Gmail strips SVG, grid, shadow, transition — should be penalized
    tracker.check(
      "Gmail scores below Apple Mail",
      gmailScore < appleScore,
      `Gmail: ${gmailScore}, Apple: ${appleScore}`,
    );

    // Outlook should be lowest (Word engine strips the most)
    tracker.check(
      "Outlook Windows scores below Apple Mail",
      outlookScore <= appleScore,
      `Outlook: ${outlookScore}, Apple: ${appleScore}`,
    );

    console.log(`\n--- Compatibility Scores (Receipt) ---`);
    for (const [id, data] of Object.entries(scores)) {
      console.log(`${id}: ${data.score} (E:${data.errors} W:${data.warnings} I:${data.info})`);
    }
    console.log(tracker.summary);
    expect(tracker.score).toBeGreaterThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// OVERALL ACCURACY SUMMARY
// ---------------------------------------------------------------------------

describe("Overall Accuracy Score", () => {
  test("computes combined accuracy across all Gmail + Outlook tests", () => {
    const tracker = new AccuracyTracker();

    // Run all Gmail transforms
    for (const [name, html] of Object.entries(templates)) {
      const result = transformForClient(html, "gmail-web");
      const out = result.html;

      // Core Gmail behaviors
      tracker.check(`[Gmail/${name}] Strips <style>`, !/<style[\s>]/.test(out));
      tracker.check(`[Gmail/${name}] Keeps color`, /color/.test(out));
      tracker.check(`[Gmail/${name}] Keeps background-color`, /background-color/.test(out));
      tracker.check(`[Gmail/${name}] Keeps font-family`, /font-family/.test(out));
      tracker.check(`[Gmail/${name}] Keeps padding`, /padding/.test(out));
      tracker.check(`[Gmail/${name}] Keeps border-radius`, /border-radius/.test(out));
      tracker.check(`[Gmail/${name}] Strips box-shadow`, !/(style="[^"]*box-shadow\s*:)/.test(out));
      tracker.check(`[Gmail/${name}] Strips position`, !/(style="[^"]*\bposition\s*:)/.test(out));
      tracker.check(`[Gmail/${name}] Strips overflow`, !/(style="[^"]*\boverflow\s*:)/.test(out));
      tracker.check(`[Gmail/${name}] Strips transition`, !/(style="[^"]*transition\s*:)/.test(out));
      tracker.check(`[Gmail/${name}] Strips opacity`, !/(style="[^"]*\bopacity\s*:)/.test(out));
    }

    // Run all Outlook transforms
    for (const [name, html] of Object.entries(templates)) {
      const result = transformForClient(html, "outlook-windows");
      const out = result.html;

      // Core Outlook behaviors
      tracker.check(`[Outlook/${name}] Keeps <style>`, /<style[\s>]/.test(out));
      tracker.check(`[Outlook/${name}] Strips border-radius from inline`, !/(style="[^"]*border-radius\s*:)/.test(out));
      tracker.check(`[Outlook/${name}] Strips box-shadow`, !/(style="[^"]*box-shadow\s*:)/.test(out));
      tracker.check(`[Outlook/${name}] Strips max-width`, !/(style="[^"]*max-width\s*:)/.test(out));
      tracker.check(`[Outlook/${name}] Keeps color`, /color/.test(out));
      tracker.check(`[Outlook/${name}] Keeps background-color`, /background-color/.test(out));
      tracker.check(`[Outlook/${name}] Keeps font-family`, /font-family/.test(out));
    }

    console.log(`\n========================================`);
    console.log(`OVERALL ACCURACY SCORE: ${tracker.score}%`);
    console.log(`========================================`);
    console.log(tracker.summary);

    // THIS IS THE KEY THRESHOLD: ≥80% means simulation approach is viable
    expect(tracker.score).toBeGreaterThanOrEqual(80);
  });
});
