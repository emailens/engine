/**
 * Gmail web's own stylesheet has `.ii a[href]{color:#15c}`. It outranks an
 * email's tag and class rules for links, not an inline colour or !important.
 * Measured 2026-11-09 by the emailens fidelity bench: 324 of 458 links with no
 * inline colour came out #15c in real Gmail web. Inlining the email's <style>
 * had put its rule above Gmail's.
 */
import { describe, expect, test } from "bun:test";
import { transformForClient } from "../transform";

const LINKS =
  '<html><head><style>a{color:#f00}.imp{color:#0f0!important}</style></head><body><a href="https://x.co">styled</a><a href="https://x.co" style="color:#00f">inline</a><a href="https://x.co" class="imp">imp</a><a>no href</a></body></html>';
const colors = (client: string) =>
  [...transformForClient(LINKS, client).html.matchAll(/<a\b[^>]*>/g)].map(
    ([tag]) => /color:\s*([^;"]+)/.exec(tag)?.[1]?.trim(),
  );

describe("Gmail web link colour", () => {
  test("a link coloured only by the email's <style> takes Gmail's #15c", () => {
    expect(colors("gmail-web")).toEqual(["#15c", "#00f", "#0f0!important", "#f00"]);
  });
  test("a placeholder link (#, bare mailto:) keeps the email's colour", () => {
    // Gmail drops a target it cannot use, so its a[href] rule misses: in
    // colorlib-07 and derekpunsalan-simple such links kept the email's colour.
    const html = transformForClient(
      '<html><head><style>a{color:#f00}</style></head><body><a href="#">x</a><a href="mailto:">y</a><a href="mailto:a@b.co">z</a></body></html>',
      "gmail-web",
    ).html;
    expect([...html.matchAll(/color:\s*([^;"]+)/g)].map((m) => m[1].trim())).toEqual(["#f00", "#f00", "#15c"]);
  });
  test("other clients keep the email's colour", () => {
    expect(colors("apple-mail-macos")[0]).toBeUndefined();
    expect(transformForClient(LINKS, "apple-mail-macos").html).toContain("a{color:#f00}");
  });
});
