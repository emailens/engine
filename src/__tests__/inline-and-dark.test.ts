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
    expect(out).toMatch(/showOnMobile" style="display: none/);
  });

  test("sampled beige replaces the generic invert", () => {
    const html = `<html><body style="background-color:#EEEAE4">Hi</body></html>`;
    expect(simulateDarkMode(html, "outlook-web").html).toContain("#595651");
    expect(simulateDarkMode(html, "gmail-ios").html).toContain("#4a4438");
  });
});
