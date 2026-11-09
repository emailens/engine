/**
 * Gmail turns the email's <body> into `<u></u><div class="..." id="...">`,
 * so `u + .body` rules apply there, with their own weight. The preview keeps
 * such a rule as a rule and builds the wrapper. Gmail's own link colour must
 * then lose to it where it outweighs Gmail's: found 2026-11-09 by the
 * emailens fidelity bench, where a real Claude email's `u+.body a{color:
 * inherit}` (0,1,2) kept its links the text colour in Gmail web and the
 * preview drew them #15c.
 */
import { describe, expect, test } from "bun:test";
import * as cheerio from "cheerio";
import { transformForClient } from "../transform";

const linkStyle = (css: string, client = "gmail-web") => {
  const $ = cheerio.load(
    transformForClient(
      `<html><head><style>${css}</style></head><body class="body"><p><a href="https://x.co">x</a></p></body></html>`,
      client,
    ).html,
  );
  return ($("a").attr("style") ?? "").replace(/\s+/g, "");
};

describe("Gmail's link colour against the email's Gmail-targeting rules", () => {
  test("a heavier `u + .body a` rule wins: no #15c on the link", () => {
    expect(linkStyle("u + .body a{color:inherit}")).not.toContain("#15c");
  });
  test("a rule that sets another property leaves Gmail's colour", () => {
    expect(linkStyle("u + .body a{text-decoration:none}")).toContain("color:#15c");
  });
  test("without the wrapper rule, Gmail's colour applies", () => {
    expect(linkStyle("p{margin:0}")).toContain("color:#15c");
  });
});

// calendly-help, 2026-11-09: the email's CSS reaches the wrapper check
// minified, `...}u+.body-fix h1{...}`, so the wrapper was never built and its
// 24px Gmail heading drew at the 36px inline size.
describe("the wrapper is built from minified CSS", () => {
  test.each([
    ["after another rule's brace", ".a{color:red}u+.body-fix h1{font-size:24px}"],
    ["first in a media block", "@media screen{u+.body-fix h1{font-size:24px}}"],
    ["in a selector list", ".a,u+.body-fix h1{font-size:24px}"],
  ])("a `u +` rule %s", (_where, css) => {
    const html = `<html><head><style>${css}</style></head><body class="x body-fix" id="body"><h1 style="font-size:36px">Hi</h1></body></html>`;
    const out = transformForClient(html, "gmail-web").html;
    expect(out).toMatch(/<u><\/u><div id="body" class="x body-fix">/);
  });
});
