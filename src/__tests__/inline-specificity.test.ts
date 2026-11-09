/**
 * Inlining an email's <style> must follow the cascade: the more specific
 * selector wins, and source order only breaks a tie. Found 2026-11-09 by the
 * emailens fidelity bench on a real Calendly email: `.footer a.unsub` (0,2,1)
 * lost to a later `.footer a` (0,1,1), both !important, and the preview drew
 * the footer address in the wrong colour where Gmail web drew the right one.
 */
import { describe, expect, test } from "bun:test";
import { transformForClient } from "../transform";

const color = (html: string, id: string) =>
  new RegExp(`id="${id}"[^>]*style="[^"]*color:\\s*([^;"]+)`).exec(
    transformForClient(html, "gmail-web").html,
  )?.[1]?.trim();

describe("inlined rules cascade by specificity", () => {
  test("a more specific rule beats a later, less specific one", () => {
    const html =
      '<html><head><style>.f a.u{color:#111 !important}.f a{color:#222 !important}p.x{color:#333}.x{color:#444}</style></head><body><div class="f"><a id="a" class="u" href="#">a</a></div><p id="p" class="x">p</p></body></html>';
    expect(color(html, "a")).toBe("#111!important");
    expect(color(html, "p")).toBe("#333");
  });
  test("one selector of a list counts with its own weight", () => {
    const html =
      '<html><head><style>#n, .y{color:#555}.y{color:#666}</style></head><body><p id="q" class="y">q</p></body></html>';
    // `.y` from the list (0,1,0) ties the later `.y`: the later one wins.
    expect(color(html, "q")).toBe("#666");
  });
  test("each rank outweighs any count of the rank below", () => {
    const html =
      '<html><head><style>#s{color:#101}.s{color:#202}.t{color:#303}div p{color:#404}p[title]{color:#505}p{color:#606}p{color:#707}*{color:#808}</style></head><body><p id="s" class="s">s</p><div><p id="t" class="t">t</p><p id="u" title="x">u</p></div><p id="v">v</p></body></html>';
    // An id beats a later class.
    expect(color(html, "s")).toBe("#101");
    // One class beats two later types.
    expect(color(html, "t")).toBe("#303");
    // An attribute weighs as a class: beats a later `p`.
    expect(color(html, "u")).toBe("#505");
    // `*` weighs nothing: the later `*` loses to `p`; between the two `p`, the later.
    expect(color(html, "v")).toBe("#707");
  });
  test("equal weight: the later rule wins", () => {
    const html =
      '<html><head><style>.a{color:#777}.b{color:#888}</style></head><body><p id="r" class="b a">r</p></body></html>';
    expect(color(html, "r")).toBe("#888");
  });
});
