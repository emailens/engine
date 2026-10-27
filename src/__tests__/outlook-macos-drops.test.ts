import { describe, expect, test } from "bun:test";
import { transformForClient } from "../transform";

// The new Outlook for Mac, as measured with Emailens probe sheet 20-features on
// a real install (2026-10-27): what it drops, and what it keeps.
describe("outlook-macos drops what the real app drops", () => {
  const html = `<html><head><style>
    .a td:nth-child(2){color:red}
    .b td:last-child{color:blue}
    @supports (display:block){.c{color:green}}
    .d{background-image:linear-gradient(red,red);color:black}
  </style></head><body>
    <div style="width:0;width:calc(100% - 0px)">x</div>
    <div style="background-color:rgba(0,170,0,1)">y</div>
    <svg width="1" height="1"></svg>
  </body></html>`;
  const out = transformForClient(html, "outlook-macos").html;

  test("drops :nth-child rules and @supports, keeps :last-child", () => {
    expect(out).not.toContain("nth-child");
    expect(out).not.toContain("@supports");
    expect(out).toContain("last-child");
  });

  test("drops a gradient but keeps the rest of the rule", () => {
    expect(out).not.toContain("linear-gradient");
    expect(out).toMatch(/\.d\{color:black\}/);
  });

  test("an ignored calc() leaves the earlier width in place", () => {
    expect(out).toContain('style="width:0"');
    expect(out).toContain("rgba(0,170,0,1)");
  });

  test("type-only media queries go, conditional ones stay", () => {
    const res = transformForClient(
      '<html><head><style>@media screen{.a{color:red}} @media screen and (max-width:600px){.b{color:blue}}</style></head><body><p class="a b" data-x="1">x</p></body></html>',
      "outlook-macos",
    ).html;
    expect(res).not.toContain("color:red");
    expect(res).toContain("max-width:600px");
  });

  test("var() and transform in a <style> block are dropped before downlevel resolves them", () => {
    const res = transformForClient(
      '<html><head><style>.v{--c:green;background-color:var(--c)}.t{transform:scaleX(2);color:black}</style></head><body><div class="v t">x</div></body></html>',
      "outlook-macos",
    );
    expect(res.html).not.toContain("background-color:green");
    expect(res.html).not.toContain("transform");
    expect(res.warnings.map((w) => w.property)).toContain("var()");
  });

  test("minmax() is named as minmax()", () => {
    const res = transformForClient(
      '<html><body><div style="display:grid;grid-template-columns:minmax(0,1fr)">x</div></body></html>',
      "outlook-macos",
    );
    expect(res.warnings.map((w) => w.property)).toContain("minmax()");
  });

  test("inline SVG is removed", () => {
    expect(out).not.toContain("<svg");
  });
});
