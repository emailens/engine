import { describe, test, expect } from "bun:test";
import { simulateDarkMode, transformForClient } from "../index";

describe("inliner leaves media queries and authored margins alone", () => {
  test("gmail keeps one hero and the card margin", () => {
    const html = `<!doctype html><html><head><style>
*{margin:0}
@media screen and (min-width:601px){.showOnDesktop{display:block!important}}
@media screen and (max-width:600px){.showOnMobile{display:block!important}}
</style></head><body>
<table class="showOnDesktop" style="display:none;margin:10px"></table>
<table class="showOnMobile" style="display:none"></table>
</body></html>`;
    const out = transformForClient(html, "gmail-web").html;
    expect(out).toContain("@media");
    expect(out).toContain("margin: 10px");
    expect(out).toMatch(/showOnMobile" style="[^"]*display: none/);
    // The author's margin beats the inlined `*{margin:0}`.
    expect(out).toContain('class="showOnDesktop" style="display: none; margin: 10px"');
  });

  test("a property written twice uses the last value, inline and across rules", () => {
    // Measured on real Gmail: font-size:16px;font-size:10px rendered at 10px.
    const inline = transformForClient(
      `<html><head><style>p{color:red}</style></head><body><p id="a" style="font-size:16px;font-size:10px">x</p></body></html>`,
      "gmail-web",
    ).html;
    expect(inline).toMatch(/id="a" style="[^"]*font-size: 10px/);
    expect(inline).not.toContain("font-size: 16px");

    const rules = transformForClient(
      `<html><head><style>.a{color:red}.b{color:green}.c{color:blue!important}.d{color:black}</style></head><body><p id="b" class="a b">x</p><p id="c" class="a c d" style="color:orange">x</p><p id="d" class="a" style="color:orange">x</p></body></html>`,
      "gmail-web",
    ).html;
    // The later rule wins over the earlier one.
    expect(rules).toMatch(/id="b"[^>]*style="color: green"/);
    // An !important rule beats the attribute and a later plain rule.
    expect(rules).toMatch(/id="c"[^>]*style="color: blue\s*!important"/);
    // Otherwise the attribute beats the rule.
    expect(rules).toMatch(/id="d"[^>]*style="color: orange"/);
  });

  test("sampled beige replaces the generic invert", () => {
    const html = `<html><body style="background-color:#EEEAE4">Hi</body></html>`;
    expect(simulateDarkMode(html, "outlook-web").html).toContain("#595651");
    expect(simulateDarkMode(html, "gmail-ios").html).toContain("#4a4438");
  });
});
