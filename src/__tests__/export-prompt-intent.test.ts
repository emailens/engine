import { describe, test, expect } from "bun:test";
import { generateFixPrompt } from "../export-prompt";

const base = {
  originalHtml: `<html><body><p>hi</p></body></html>`,
  warnings: [],
  scores: { "gmail-web": { score: 100, errors: 0, warnings: 0, info: 0 } },
  scope: "all" as const,
};

describe("generateFixPrompt intent", () => {
  test("includes the intent section when intent is provided", () => {
    const prompt = generateFixPrompt({ ...base, intent: "keep the gradient header" });
    expect(prompt).toContain("## User Intent");
    expect(prompt).toContain("keep the gradient header");
    // Intent must land before the code so the model reads the goal first.
    expect(prompt.indexOf("## User Intent")).toBeLessThan(
      prompt.indexOf("## Original Email Code")
    );
  });

  test("omits the section when intent is absent or blank", () => {
    expect(generateFixPrompt(base)).not.toContain("## User Intent");
    expect(generateFixPrompt({ ...base, intent: "   " })).not.toContain("## User Intent");
  });
});
