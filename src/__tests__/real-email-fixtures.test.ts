import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeEmail, generateCompatibilityScore } from "../analyze";
import { EMAIL_CLIENTS } from "../clients";
import { loadFrameworkFixtures } from "../../scripts/framework-fixtures";

const FIXTURES = join(import.meta.dir, "fixtures");

const BASE_NAMES = [
  "client-campaign.html",
  "abandoned-cart-warm.html",
  "shipping-luxe.html",
  "mjml-newsletter.html",
];
const provenance = JSON.parse(readFileSync(join(FIXTURES, "open-source", "provenance.json"), "utf8")) as {
  fixtures: Array<{ file: string }>;
};
const syntheticProvenance = JSON.parse(readFileSync(join(FIXTURES, "synthetic", "provenance.json"), "utf8")) as {
  fixtures: Array<{ file: string }>;
};
const NAMES = [
  ...BASE_NAMES,
  ...provenance.fixtures
    .filter(({ file }) => file.endsWith(".html"))
    .map(({ file }) => `open-source/${file}`),
  ...syntheticProvenance.fixtures.map(({ file }) => `synthetic/${file}`),
];

function read(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

describe("real email fixtures", () => {
  test.each(NAMES)("%s analyzes and every client score stays in range", (name) => {
    const scores = generateCompatibilityScore(analyzeEmail(read(name)));
    for (const client of EMAIL_CLIENTS) {
      const score = scores[client.id].score;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  test("the client campaign keeps the markup that matters and none of the account", () => {
    const html = read("client-campaign.html");
    expect(html).toContain("<!--[if mso]>");
    expect(html).toContain("border-radius");
    expect(html).toContain("https://example.com/");
    for (const secret of [/john\s*lewis/i, /johnlewis/i, /postcode/i, /click\.eml/i, /open\.aspx/i, /\b5FN\b/]) {
      expect(html).not.toMatch(secret);
    }
  });

  test("synthetic fixtures retain the edge-case patterns they were authored to cover", () => {
    const expectedPatterns: Record<string, RegExp[]> = {
      "dark-mode-rtl.html": [/prefers-color-scheme/, /dir="rtl"/i, /@font-face/],
      "hybrid-vml-background.html": [/<!--[\s]*\[if mso\]/i, /<v:rect/i, /background:/i],
      "modern-css-stress.html": [/var\(--/, /@keyframes/, /image\/webp/, /image\/avif/, /data:image\//],
      "amp-interactive.html": [/amp4email/i, /<amp-carousel/i, /<form\b/i, /<select\b/i],
      "template-markers.html": [/\{%\s*if/, /\{%\s*for/, /\{\{/],
      "plain-text-minimal.html": [/<html\b/i, /<a\b/i],
    };
    for (const [file, patterns] of Object.entries(expectedPatterns)) {
      const html = read(`synthetic/${file}`);
      for (const pattern of patterns) expect(html).toMatch(pattern);
    }
  });

  test("the engine reports expected compatibility findings for synthetic edge cases", () => {
    const expectedProperties: Record<string, string[]> = {
      "dark-mode-rtl.html": ["@font-face", "@media prefers-color-scheme", "[dir]", "custom-properties"],
      "hybrid-vml-background.html": ["background-image", "@media"],
      "modern-css-stress.html": ["<picture>", "@keyframes", "display:flex", "display:grid", "custom-properties"],
      "amp-interactive.html": ["amp4email", "<form>", "<select>"],
      "plain-text-minimal.html": ["doctype"],
    };
    for (const [file, properties] of Object.entries(expectedProperties)) {
      const actual = new Set(analyzeEmail(read(`synthetic/${file}`)).map(({ property }) => property));
      for (const property of properties) expect(actual, `${file} should report ${property}`).toContain(property);
    }
  });

  test("React Email and MJML examples compile and score for every client", async () => {
    const frameworkFixtures = await loadFrameworkFixtures();
    expect(frameworkFixtures).toHaveLength(14);
    for (const { html } of frameworkFixtures) {
      const scores = generateCompatibilityScore(analyzeEmail(html));
      for (const client of EMAIL_CLIENTS) {
        expect(scores[client.id].score).toBeGreaterThanOrEqual(0);
        expect(scores[client.id].score).toBeLessThanOrEqual(100);
      }
    }
  }, 30_000);
});
