import { describe, expect, it } from "bun:test";
import { analyzeEmail, transformForClient } from "../index";

// Real Yahoo Mail web, 2026-10-28 (run fTG7mRVMqloE): an inline font-family
// naming a quoted font fell back to Yahoo's font; unquoted and <style> held.
const quoted = `<div style="font-family:'Courier New',Courier,monospace;">--region</div>`;
const unquoted = `<div style="font-family:Courier New,Courier,monospace;">--region</div>`;
const inStyle = `<style>.m{font-family:'Courier New',monospace}</style><div class="m">--region</div>`;

const yahooFont = (html: string) =>
  analyzeEmail(html).filter((w) => w.client === "yahoo-mail" && w.property === "font-family");

describe("Yahoo Mail web drops inline font stacks with quoted names", () => {
  it("warns for Yahoo only, and strips it in the Yahoo preview", () => {
    expect(yahooFont(quoted)).toHaveLength(1);
    expect(
      analyzeEmail(quoted).some((w) => w.client === "gmail-web" && w.property === "font-family"),
    ).toBe(false);
    expect(transformForClient(quoted, "yahoo-mail").html).not.toMatch(/font-family/);
    expect(transformForClient(quoted, "gmail-web").html).toMatch(/Courier New/);
  });

  it("keeps unquoted names and <style> classes", () => {
    expect(yahooFont(unquoted)).toHaveLength(0);
    expect(yahooFont(inStyle)).toHaveLength(0);
    expect(transformForClient(unquoted, "yahoo-mail").html).toMatch(/font-family:\s*Courier New/);
  });
});
