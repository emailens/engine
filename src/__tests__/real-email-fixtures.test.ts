import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeEmail, generateCompatibilityScore } from "../analyze";
import { EMAIL_CLIENTS } from "../clients";

const FIXTURES = join(import.meta.dir, "fixtures");

const NAMES = [
  "client-campaign.html",
  "abandoned-cart-warm.html",
  "shipping-luxe.html",
  "mjml-newsletter.html",
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
});
