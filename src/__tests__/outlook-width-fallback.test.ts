import { describe, expect, test } from "bun:test";
import { analyzeEmail } from "../index";

// Word (Outlook Classic) ignores max-width and min-width. Bulletproof templates
// give it the width another way: a numeric width attribute, or a ghost table
// or cell inside an MSO conditional. When that fallback is in the markup, a
// warning would ask the author for what the file already has.

const page = (body: string) => `<!DOCTYPE html><html><body>${body}</body></html>`;
const wordWarns = (html: string, prop = "max-width") =>
  analyzeEmail(html).some(
    (w) => w.client === "outlook-windows-legacy" && w.property === prop && w.severity !== "info",
  );

describe("Outlook Classic width fallbacks", () => {
  test("a bare max-width still warns", () => {
    expect(wordWarns(page(`<div style="max-width:600px;margin:0 auto">x</div>`))).toBe(true);
  });

  test("a ghost table opened inside the element covers it (Cerberus container)", () => {
    const html = page(`<div style="max-width:680px;margin:0 auto">
      <!--[if mso]><table role="presentation" width="680"><tr><td><![endif]-->
      <p>x</p>
      <!--[if mso]></td></tr></table><![endif]-->
    </div>`);
    expect(wordWarns(html)).toBe(false);
  });

  test("a ghost cell just before the element covers it (hybrid column)", () => {
    const html = page(`<!--[if mso]><table width="660"><tr><td valign="top" width="330"><![endif]-->
      <div style="display:inline-block;min-width:200px;max-width:330px">x</div>
      <!--[if mso]></td></tr></table><![endif]-->`);
    expect(wordWarns(html)).toBe(false);
    expect(wordWarns(html, "min-width")).toBe(false);
  });

  test("a width attribute covers it (fluid image)", () => {
    expect(wordWarns(page(`<img src="a.png" width="680" style="width:100%;max-width:680px">`))).toBe(false);
  });

  test("an MSO comment without a width does not count", () => {
    const html = page(`<!--[if mso]><table><tr><td><![endif]-->
      <div style="max-width:330px">x</div>`);
    expect(wordWarns(html)).toBe(true);
  });

  test("a closing ghost comment before the element does not count", () => {
    const html = page(`<!--[if mso]></td></tr></table><![endif]-->
      <div style="max-width:330px">x</div>`);
    expect(wordWarns(html)).toBe(true);
  });

  test("other clients are untouched", () => {
    const html = page(`<img src="a.png" width="680" style="width:100%;max-width:680px">`);
    const before = analyzeEmail(page(`<img src="a.png" style="width:100%;max-width:680px">`))
      .filter((w) => w.property === "max-width" && w.client !== "outlook-windows-legacy").length;
    const after = analyzeEmail(html)
      .filter((w) => w.property === "max-width" && w.client !== "outlook-windows-legacy").length;
    expect(after).toBe(before);
  });

  test("strict targeting still reports it", () => {
    const html = page(`<img src="a.png" width="680" style="max-width:680px">`);
    const strict = analyzeEmail(html, undefined, { targetingPolicy: "strict" }).some(
      (w) => w.client === "outlook-windows-legacy" && w.property === "max-width",
    );
    expect(strict).toBe(true);
  });
});
