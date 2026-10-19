import { describe, expect, test } from "bun:test";
import { analyzeEmail, auditEmail, getSuggestion, transformForClient } from "../index";

const doc = (head: string, body: string) =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const find = (html: string, client: string, property: string) =>
  analyzeEmail(html).filter((w) => w.client === client && w.property === property);

describe("a reset is not a finding", () => {
  test("outline:none on an image says nothing to Outlook Classic", () => {
    const html = doc("", `<img src="a.png" width="10" style="outline:none;border:0">`);
    expect(find(html, "outlook-windows-legacy", "outline")).toEqual([]);
  });

  test("a real outline still warns", () => {
    const html = doc("", `<a href="#" style="outline:2px solid red">x</a>`);
    expect(find(html, "outlook-windows-legacy", "outline")[0]?.severity).toBe("warning");
  });

  test("!important does not hide a reset", () => {
    const html = doc("", `<p style="word-spacing:normal !important">x</p>`);
    expect(find(html, "aol", "word-spacing")).toEqual([]);
  });

  test("a stylesheet of resets is quiet, a mixed one points at the real value", () => {
    const quiet = doc("<style>img{outline:none} a{outline:0}</style>", "<p>x</p>");
    expect(find(quiet, "outlook-windows-legacy", "outline")).toEqual([]);
    const mixed = doc("<style>img{outline:none} a{outline:2px solid red}</style>", "<p>x</p>");
    expect(find(mixed, "outlook-windows-legacy", "outline").length).toBe(1);
  });
});

describe("progressive enhancement is info", () => {
  const responsive = doc(
    `<meta name="color-scheme" content="light dark"><style>:root{color-scheme:light dark}
@media (max-width:600px){.col{width:100%!important}}
@media (prefers-color-scheme:dark){.bg{background:#000!important}}</style>`,
    `<table class="col bg"><tr><td style="padding:16px">x</td></tr></table>`,
  );

  test.each([
    ["thunderbird", "@media"],
    ["outlook-windows-legacy", "@media"],
    ["gmail-web", "@media prefers-color-scheme"],
    ["gmail-web", "color-scheme"],
    ["gmail-web", "<style>"],
    ["protonmail", "<style>"],
  ])("%s %s", (client, property) => {
    const hits = find(responsive, client, property);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((w) => w.severity === "info")).toBe(true);
  });
});

test("a longhand its shorthand overrides later is not graded (React Email's <Link>)", () => {
  const overridden = doc("", `<a href="#" style="text-decoration-line:none;text-decoration:underline">x</a>`);
  expect(find(overridden, "outlook-windows-legacy", "text-decoration-line")).toEqual([]);
  const alone = doc("", `<a href="#" style="text-decoration-line:none">x</a>`);
  expect(find(alone, "outlook-windows-legacy", "text-decoration-line").length).toBe(1);
});

describe("ESP system links", () => {
  test("an unsubscribe or preferences placeholder in an href is info", () => {
    const html = doc(
      "",
      `<a href="{{unsubscribe_url}}">Unsubscribe</a> <a href="*|UPDATE_PROFILE|*">Preferences</a>`,
    );
    const report = auditEmail(html).templateVariables;
    expect(report.issues.map((i) => i.severity)).toEqual(["info", "info"]);
    expect(report.unresolvedCount).toBe(0);
  });

  test("any other variable is still an error", () => {
    const report = auditEmail(doc("", `<p>Hi {{first_name}}</p><a href="{{reset_link}}">Reset</a>`)).templateVariables;
    expect(report.issues.every((i) => i.severity === "error")).toBe(true);
    expect(report.unresolvedCount).toBe(2);
  });
});

test("a feature-wide tip does not name Outlook to another client", () => {
  for (const prop of ["border-radius", "word-break", "overflow-wrap", "white-space", "min-height"]) {
    expect(getSuggestion(prop, "yahoo-mail").text).not.toMatch(/Outlook/);
  }
  expect(getSuggestion("border-radius", "outlook-windows-legacy").text).toMatch(/VML/);
});

test("the Gmail preview drops @font-face, Apple Mail keeps it", () => {
  const html = doc(
    `<style>@font-face{font-family:X;src:url(x.woff2)} p{font-family:X,Arial}</style>`,
    "<p>x</p>",
  );
  expect(transformForClient(html, "gmail-web").html).not.toContain("@font-face");
  expect(transformForClient(html, "apple-mail-macos").html).toContain("@font-face");
});

test("the fix prompt tells an agent to leave info findings alone", async () => {
  const { generateFixPrompt, generateCompatibilityScore } = await import("../index");
  const html = doc("<style>@media (max-width:600px){.c{width:100%!important}}</style>", `<table class="c"><tr><td>x</td></tr></table>`);
  const warnings = analyzeEmail(html);
  const prompt = generateFixPrompt({ originalHtml: html, warnings, scores: generateCompatibilityScore(warnings) });
  expect(prompt).toContain("### Info");
  expect(prompt).toContain("keep responsive (@media) and dark-mode CSS");
});
