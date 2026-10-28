import { describe, expect, it } from "bun:test";
import { analyzeEmail, analyzeSpam } from "../index";

// Breaks reported in public framework threads, graded on 2026-10-28
// (emailens.dev docs/fidelity/real-failing-emails-2026-10-28.md).
const find = (html: string, client: string, property: string) =>
  analyzeEmail(html).filter((w) => w.client === client && w.property === property);

describe("a plain display:none preheader is not hidden-text spam", () => {
  const body =
    "<p>Hello, this is a normal newsletter with enough words to look like one.</p>" +
    '<a href="https://example.com/unsubscribe">Unsubscribe</a>';

  it("passes when the hidden text opens the email", () => {
    const html = `<html><body><div style="display:none">Your October issue is here</div>${body}</body></html>`;
    const rules = analyzeSpam(html).issues.map((i) => i.rule);
    expect(rules).not.toContain("hidden-text");
  });

  it("still flags hidden text further down the email", () => {
    const html = `<html><body>${body}<div style="display:none">cheap pills casino win</div></body></html>`;
    const rules = analyzeSpam(html).issues.map((i) => i.rule);
    expect(rules).toContain("hidden-text");
  });
});

describe("rem units (react-email #2043: wrong text sizes in Outlook Classic)", () => {
  it("warns for Outlook Classic, inline and in <style>", () => {
    expect(find('<p style="font-size:1.5rem">x</p>', "outlook-windows-legacy", "unit-rem")).toHaveLength(1);
    expect(
      find("<style>p{font-size:1.5rem}</style><p>x</p>", "outlook-windows-legacy", "unit-rem"),
    ).toHaveLength(1);
  });

  it("says nothing for px, or for a word that merely ends in rem", () => {
    expect(find('<p style="font-size:16px">x</p>', "outlook-windows-legacy", "unit-rem")).toHaveLength(0);
    expect(
      find("<style>p{font-family:Lorem}</style><p>x</p>", "outlook-windows-legacy", "unit-rem"),
    ).toHaveLength(0);
  });
});

describe("CSS nesting (Tailwind v4 nests @media inside its classes)", () => {
  it("warns when a rule or @media sits inside a rule", () => {
    const html =
      '<style>.a{color:red; @media (max-width:600px){color:blue}}</style><p class="a">x</p>';
    expect(find(html, "gmail-web", "nesting")).toHaveLength(1);
  });

  it("says nothing for a top-level @media", () => {
    const html =
      '<style>@media (max-width:600px){.a{color:blue}}</style><p class="a">x</p>';
    expect(find(html, "gmail-web", "nesting")).toHaveLength(0);
  });
});

describe("Gmail on iPhone inverts dark backgrounds (mjml #2513: dark green turned mint)", () => {
  it("warns once, with every dark background, even without dark CSS", () => {
    const html =
      '<table><tr><td style="background-color:#1F4D3A;color:#F6F1E7">a</td>' +
      '<td bgcolor="#0B0F19">b</td></tr></table>';
    const w = find(html, "gmail-ios", "dark-mode-inversion");
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("#1F4D3A");
  });

  it("says nothing for light backgrounds, or for other clients", () => {
    const light = '<table><tr><td style="background-color:#ffffff">a</td></tr></table>';
    expect(find(light, "gmail-ios", "dark-mode-inversion")).toHaveLength(0);
    const dark = '<table><tr><td style="background-color:#111111">a</td></tr></table>';
    expect(find(dark, "apple-mail-ios", "dark-mode-inversion")).toHaveLength(0);
  });
});

describe("one warning per finding, not per element (react-email #2043: 42 Outlook lines)", () => {
  const html =
    '<table style="font-size:1rem"><tr><td><p style="font-size:1.25rem">a</p>' +
    '<h1 style="font-size:2rem">b</h1></td></tr></table>';

  it("merges the same finding on three elements into one, keeping every place", () => {
    const rem = analyzeEmail(html, undefined, { positions: true }).filter(
      (w) => w.client === "outlook-windows-legacy" && w.property === "unit-rem",
    );
    expect(rem).toHaveLength(1);
    expect(rem[0].selectors).toEqual(["table", "p", "h1"]);
    expect(rem[0].locs).toHaveLength(3);
    expect(rem[0].loc).toEqual(rem[0].locs?.[0]);
  });

  it("keeps a sentence that names its element apart", () => {
    const html2 =
      '<style>@media (prefers-color-scheme: dark){.x{background:#000!important}}</style>' +
      '<table><tr><td style="background-color:#ffffff">a</td></tr></table><div style="background-color:#f4f4f4">b</div>';
    const cover = analyzeEmail(html2).filter(
      (w) => w.client === "apple-mail-ios" && w.property === "dark-mode-coverage",
    );
    expect(cover.length).toBe(2);
  });
});
