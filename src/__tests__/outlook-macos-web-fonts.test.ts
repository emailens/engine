import { describe, expect, test } from "bun:test";
import { transformForClient } from "../transform";

// Real Outlook for Mac draws no web font, however the email asks for it:
// emailens real-device runs on outlook_mac_light, 2026-10-28 and 2026-10-30.
// A Google Fonts <link> (run 6UOu1JWi1l9C), an @import (run Z2Hn_aEsftuG)
// and an @font-face with a remote src (run _YHEeChhj-3_) all fell back to the
// next font in the stack (Helvetica/Arial), so headlines set wider and wrapped
// earlier than the simulation, which loaded the font. Apple Mail on the same
// Mac drew all three. caniemail marks @font-face and @import unsupported here.
describe("outlook-macos loads no web fonts", () => {
  const html = `<html><head>
    <link href="https://fonts.googleapis.com/css?family=Rubik:400,700" rel="stylesheet">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Figtree');
      @font-face{font-family:'Work Sans';src:url('https://example.com/ws.woff2') format('woff2')}
      .h{font-family:'Rubik',Arial,sans-serif;color:#009c9c}
    </style>
  </head><body><h1 class="h">Headline</h1></body></html>`;
  const out = transformForClient(html, "outlook-macos").html;

  test("drops the font stylesheet link, @import and @font-face", () => {
    expect(out).not.toContain("fonts.googleapis.com/css?family=Rubik");
    expect(out).not.toContain("@import");
    expect(out).not.toContain("@font-face");
  });

  test("keeps the rule that names the font, so the stack falls through", () => {
    expect(out).toContain("color:#009c9c");
    expect(out).toMatch(/font-family:\s*["']Rubik["']/);
  });

  test("Apple Mail on the same Mac keeps all three", () => {
    const apple = transformForClient(html, "apple-mail-macos").html;
    expect(apple).toContain("fonts.googleapis.com/css?family=Rubik");
    expect(apple).toContain("@import");
    expect(apple).toContain("@font-face");
  });
});
