import { describe, expect, test } from "bun:test";
import { analyzeEmail, createSession, generateCompatibilityScore } from "../index";
import { unwrapJsxRawHtml } from "../parse-html";

const jsx = (head: string, body = "<Text>Hi</Text>") =>
  `import { Html, Head, Body, Text } from "@react-email/components";
export default function E() { return (<Html><Head>${head}</Head><Body>${body}</Body></Html>); }`;

const msoStyle = `<div dangerouslySetInnerHTML={{ __html: '<!--[if mso]><style>table{border-collapse:collapse;}</style><![endif]-->' }} />`;

describe("React Email raw strings are analysed as React Email renders them", () => {
  test("CSS in an Outlook-only raw string costs no other client", () => {
    const before = generateCompatibilityScore(createSession(jsx(""), { framework: "jsx" }).analyze());
    const after = generateCompatibilityScore(createSession(jsx(msoStyle), { framework: "jsx" }).analyze());
    for (const id of ["gmail-web", "gmail-android", "gmail-ios", "protonmail"]) {
      expect(after[id]?.score).toBe(before[id]?.score);
    }
  });

  test("analyzeEmail agrees with the session", () => {
    const warnings = analyzeEmail(jsx(msoStyle), "jsx");
    expect(warnings.some((w) => w.client === "gmail-web" && w.property === "<style>")).toBe(false);
  });

  test("a raw <style> outside a conditional is still a <style> for Gmail", () => {
    const raw = `<div dangerouslySetInnerHTML={{ __html: "<style>p{color:red}</style>" }} />`;
    const warnings = createSession(jsx(raw), { framework: "jsx" }).analyze();
    expect(warnings.some((w) => w.client === "gmail-web" && w.property === "<style>")).toBe(true);
  });

  test("plain HTML is not touched", () => {
    const html = `<div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />`;
    expect(createSession(html).html).toBe(html);
  });
});

describe("unwrapJsxRawHtml", () => {
  test("self-closing and open/close elements become content", () => {
    expect(unwrapJsxRawHtml(`<div className="a" dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />`)).toBe(
      `<div className="a"><b>x</b></div>`,
    );
    expect(unwrapJsxRawHtml(`<td dangerouslySetInnerHTML={{ __html: "<i>y</i>" }}></td>`)).toBe(`<td><i>y</i></td>`);
  });

  test("escapes in a quoted literal are decoded", () => {
    expect(unwrapJsxRawHtml(String.raw`<div dangerouslySetInnerHTML={{ __html: '<p class=\"c\">it\'s</p>\n' }} />`)).toBe(
      `<div><p class="c">it's</p>\n</div>`,
    );
  });

  test("an interpolated template or an expression is left alone", () => {
    const interpolated = "<div dangerouslySetInnerHTML={{ __html: `<b>${x}</b>` }} />";
    const expression = `<div dangerouslySetInnerHTML={{ __html: html }} />`;
    expect(unwrapJsxRawHtml(interpolated)).toBe(interpolated);
    expect(unwrapJsxRawHtml(expression)).toBe(expression);
  });
});
