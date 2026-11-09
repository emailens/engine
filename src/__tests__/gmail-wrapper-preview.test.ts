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
