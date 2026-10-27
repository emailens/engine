import { describe, expect, it } from "bun:test";
import { analyzeEmail, transformForClient } from "../index";

// Real Yahoo Mail web, 2026-10-27 (scripts/observed-overrides.ts): flex item
// sizing is dropped, display:flex and width are kept.
const html = `<div style="display:flex;"><div style="flex:0 0 34%;">Focus Mode</div><div style="flex-basis:66%;width:66%;">Body</div></div>`;

describe("Yahoo Mail web drops flex item sizing", () => {
  it("strips flex and flex-basis, keeps display:flex and width", () => {
    const out = transformForClient(html, "yahoo-mail").html;
    expect(out).not.toMatch(/flex:\s*0 0 34%/);
    expect(out).not.toMatch(/flex-basis/);
    expect(out).toMatch(/display:\s*flex/);
    expect(out).toMatch(/width:\s*66%/);
  });

  it("warns about it, and Apple Mail keeps it", () => {
    const flex = analyzeEmail(html).filter((w) => w.property === "flex");
    expect(flex.some((w) => w.client === "yahoo-mail")).toBe(true);
    expect(flex.some((w) => w.client === "apple-mail-macos")).toBe(false);
    expect(transformForClient(html, "apple-mail-macos").html).toMatch(
      /flex:\s*0 0 34%/,
    );
  });
});

// Real Gmail web, 2026-10-28: the same probe, the same result.
describe("Gmail web drops flex item sizing", () => {
  it("strips flex and flex-basis, keeps display:flex and width", () => {
    const out = transformForClient(html, "gmail-web").html;
    expect(out).not.toMatch(/flex:\s*0 0 34%/);
    expect(out).not.toMatch(/flex-basis/);
    expect(out).toMatch(/display:\s*flex/);
    expect(out).toMatch(/width:\s*66%/);
  });
});
