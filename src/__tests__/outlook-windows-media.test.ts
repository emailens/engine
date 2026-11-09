import { describe, expect, test } from "bun:test";
import { mediaAtWidth, transformForClient } from "../transform";

// New Outlook for Windows evaluates an email's @media width conditions
// against its window, not the reading pane: on the worker's new Outlook
// (bench 2026-11-09, pane 620 CSS px) none of the 27 emails with a
// max-width query that fires at 620 drew its mobile layout, and the
// simulation, laid out at 620, drew all of them mobile (0 judged good).
describe("mediaAtWidth: a width query evaluated at one width", () => {
  test("max-width and min-width, in px", () => {
    expect(mediaAtWidth("only screen and (max-width: 650px)", 766)).toBe(false);
    expect(mediaAtWidth("screen and (max-width:800px)", 766)).toBe(true);
    expect(mediaAtWidth("(min-width: 700px)", 766)).toBe(true);
    expect(mediaAtWidth("all and (min-width: 480px) and (max-width: 700px)", 766)).toBe(false);
  });

  test("a list is true when any query is", () => {
    expect(mediaAtWidth("(max-width: 480px), (min-width: 760px)", 766)).toBe(true);
  });

  test("print never matches a screen", () => {
    expect(mediaAtWidth("print and (max-width: 900px)", 766)).toBe(false);
  });

  test("anything but width is not its call", () => {
    expect(mediaAtWidth("(prefers-color-scheme: dark)", 766)).toBe(null);
    expect(mediaAtWidth("screen and (max-width: 600px) and (orientation: portrait)", 766)).toBe(null);
    expect(mediaAtWidth("(max-width: 40em)", 766)).toBe(null);
  });
});

describe("outlook-windows (new) reads @media at its window", () => {
  const html = `<html><head><style>
    .c{width:600px;color:#111111}
    @media only screen and (max-width: 650px){.c{width:100%!important;color:#222222}}
    @media (min-width: 700px){.c{color:#333333}}
    @media (prefers-color-scheme: dark){.c{color:#444444}}
  </style></head><body><div class="c">x</div></body></html>`;
  const out = transformForClient(html, "outlook-windows").html;

  test("drops a mobile query that the window does not match", () => {
    expect(out).not.toContain("#222222");
  });

  test("keeps a query the window matches, unwrapped so the 620 px preview applies it", () => {
    expect(out).toContain("#333333");
    expect(out).not.toMatch(/@media\s*\(min-width:\s*700px\)/);
  });

  test("leaves other media features alone", () => {
    expect(out).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  });

  test("Gmail keeps the mobile query", () => {
    expect(transformForClient(html, "gmail-web").html).toContain("#222222");
  });
});
