/**
 * Gmail web's own stylesheet colours links #15c. Measured 2026-11-09 by the
 * emailens fidelity bench on 103 real Gmail web captures: 324 of 458 links
 * with no inline colour came out #15c. Its weight sits between the email's
 * rules: `a{color}` (0,0,1) lost to it (colorlib-01), `.logo a{color}` (0,1,1)
 * beat it (colorlib-07). A bare `mailto:` loses its target and the rule
 * misses (derekpunsalan-simple); `#` keeps it (colorlib-01).
 */
import { describe, expect, test } from "bun:test";
import { transformForClient } from "../transform";

const colors = (html: string, client = "gmail-web") =>
  [...transformForClient(html, client).html.matchAll(/<a\b[^>]*>/g)].map(
    ([tag]) => /color:\s*([^;"]+)/.exec(tag)?.[1]?.trim(),
  );

describe("Gmail web link colour", () => {
  test("Gmail's colour beats a tag rule, not inline, !important or a class rule", () => {
    const html =
      '<html><head><style>a{color:#f00}.imp{color:#0f0!important}.logo a{color:#fff}</style></head><body><a href="https://x.co">tag</a><a href="#" style="color:#00f">inline</a><a href="#" class="imp">imp</a><div class="logo"><a href="#">class</a></div><a>no href</a></body></html>';
    expect(colors(html)).toEqual(["#15c", "#00f", "#0f0!important", "#fff", "#f00"]);
  });
  test("a link with no colour at all takes Gmail's", () => {
    expect(colors('<html><body><a href="#">x</a></body></html>')).toEqual(["#15c"]);
  });
  test("a bare mailto: loses its target, so the rule misses", () => {
    expect(
      colors('<html><head><style>a{color:#f00}</style></head><body><a href="mailto:">x</a><a href="mailto:a@b.co">y</a></body></html>'),
    ).toEqual(["#f00", "#15c"]);
  });
  test("other clients keep the email's colour", () => {
    const html = '<html><head><style>a{color:#f00}</style></head><body><a href="#">x</a></body></html>';
    expect(colors(html, "apple-mail-macos")).toEqual([undefined]);
    expect(transformForClient(html, "apple-mail-macos").html).toContain("a{color:#f00}");
  });
});
