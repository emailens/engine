import { describe, test, expect } from "bun:test";
import * as cheerio from "cheerio";
import { analyzeEmail, auditEmail, createSession, generateCompatibilityScore } from "../index";
import { checkDarkModeFromDom } from "../dark-mode-checker";

/** Dark-mode warnings only, by property. */
const darkProps = (html: string) =>
  analyzeEmail(html)
    .filter((w) => w.property.startsWith("dark-mode"))
    .map((w) => w.property);

const has = (html: string, prop: string) => darkProps(html).includes(prop);

const DARK_BLOCK = `<style>@media (prefers-color-scheme: dark){.bg-body{background-color:#0E1013 !important}}</style>`;
const OPT_IN = `<meta name="color-scheme" content="light dark">`;

/** A `<td>` outside a `<table>` is dropped by the HTML parser: always wrap. */
const email = (head: string, cells: string) =>
  `<html><head>${head}</head><body><table><tr>${cells}</tr></table></body></html>`;

describe("dark mode: opt-in meta", () => {
  test("fires when dark CSS is present but the opt-in meta is not", () => {
    expect(has(email(DARK_BLOCK, `<td>x</td>`), "dark-mode-opt-in")).toBe(true);
  });

  test("attributes the warning to the prefers-color-scheme clients", () => {
    const clients = analyzeEmail(email(DARK_BLOCK, `<td>x</td>`))
      .filter((w) => w.property === "dark-mode-opt-in")
      .map((w) => w.client);
    expect(clients).toContain("apple-mail-macos");
    expect(clients).toContain("apple-mail-ios");
    expect(clients).not.toContain("gmail-web");
  });

  test("is silent with <meta name=color-scheme>", () => {
    expect(has(email(OPT_IN + DARK_BLOCK, `<td>x</td>`), "dark-mode-opt-in")).toBe(false);
  });

  test("is silent with <meta name=supported-color-schemes>", () => {
    const meta = `<meta name="supported-color-schemes" content="light dark">`;
    expect(has(email(meta + DARK_BLOCK, `<td>x</td>`), "dark-mode-opt-in")).toBe(false);
  });

  test("tolerates whitespace and casing in the media query", () => {
    const block = `<style>@media (PREFERS-COLOR-SCHEME : dark ){.a{background:#000 !important}}</style>`;
    expect(has(email(block, `<td>x</td>`), "dark-mode-opt-in")).toBe(true);
  });
});

describe("dark mode: partial coverage", () => {
  test("flags an inline light background the dark block does not override", () => {
    expect(has(email(OPT_IN + DARK_BLOCK, `<td bgcolor="#ffffff">card</td>`), "dark-mode-coverage")).toBe(true);
  });

  test("flags an inline background:#ffffff covered only by a non-!important dark rule", () => {
    const block = `<style>@media (prefers-color-scheme: dark){.card{background-color:#0E1013}}</style>`;
    const html = email(OPT_IN + block, `<td class="card" style="background:#ffffff">card</td>`);
    expect(has(html, "dark-mode-coverage")).toBe(true);
  });

  test("is silent when the dark block overrides the element with !important", () => {
    const html = email(OPT_IN + DARK_BLOCK, `<td class="bg-body" style="background-color:#ffffff">card</td>`);
    expect(has(html, "dark-mode-coverage")).toBe(false);
  });

  test("is silent for a bgcolor attribute covered by a non-!important dark rule (CSS beats the attribute)", () => {
    const block = `<style>@media (prefers-color-scheme: dark){.card{background-color:#0E1013}}</style>`;
    const html = email(OPT_IN + block, `<td class="card" bgcolor="#ffffff">card</td>`);
    expect(has(html, "dark-mode-coverage")).toBe(false);
  });

  test("ignores dark and mid-tone backgrounds", () => {
    const cells = `<td bgcolor="#0E1013">a</td><td style="background:#777777">b</td>`;
    expect(has(email(OPT_IN + DARK_BLOCK, cells), "dark-mode-coverage")).toBe(false);
  });

  test("ignores unparseable / transparent backgrounds", () => {
    const cells =
      `<td style="background:transparent">a</td>` +
      `<td style="background:var(--card)">b</td>` +
      `<td style="background:url(hero.png) no-repeat">c</td>`;
    expect(has(email(OPT_IN + DARK_BLOCK, cells), "dark-mode-coverage")).toBe(false);
  });

  test("caps the number of flagged elements", () => {
    const cells = Array.from({ length: 30 }, (_, i) => `<td id="c${i}" bgcolor="#ffffff">x</td>`).join("");
    const selectors = new Set(
      analyzeEmail(email(OPT_IN + DARK_BLOCK, cells))
        .filter((w) => w.property === "dark-mode-coverage")
        .map((w) => w.selector),
    );
    expect(selectors.size).toBeLessThanOrEqual(3);
    expect(selectors.size).toBeGreaterThan(0);
  });
});

describe("dark mode: real-world CSS shapes", () => {
  test("recognises a combined media query (@media screen and (prefers-color-scheme: dark))", () => {
    const head = `${OPT_IN}<style>@media screen and (prefers-color-scheme: dark){.c{background-color:#000 !important}}</style>`;
    const cells = `<td class="c" style="background:#fff">covered</td><td style="background:#fff">bare</td>`;
    const selectors = analyzeEmail(email(head, cells))
      .filter((w) => w.property === "dark-mode-coverage")
      .map((w) => w.selector);
    expect(selectors).toContain("td");
    expect(selectors).not.toContain("td.c");
  });

  test("a dark rule using the background shorthand counts as coverage", () => {
    const head = `${OPT_IN}<style>@media (prefers-color-scheme: dark){.c{background:#000 !important}}</style>`;
    expect(has(email(head, `<td class="c" style="background-color:#fff">a</td>`), "dark-mode-coverage")).toBe(false);
  });

  test("finds the dark block in any <style> tag, not just the first", () => {
    const head = `${OPT_IN}<style>.x{color:red}</style><style>@media (prefers-color-scheme: dark){.c{background:#000 !important}}</style>`;
    expect(has(email(head, `<td class="c" style="background:#fff">a</td>`), "dark-mode-coverage")).toBe(false);
    expect(has(email(head, `<td style="background:#fff">a</td>`), "dark-mode-coverage")).toBe(true);
  });

  test("flags a named light colour (bgcolor=white)", () => {
    expect(has(email(OPT_IN + DARK_BLOCK, `<td bgcolor="white">a</td>`), "dark-mode-coverage")).toBe(true);
  });

  test("ignores a mostly-transparent light background", () => {
    const cells = `<td style="background:rgba(255,255,255,0.3)">a</td>`;
    expect(has(email(OPT_IN + DARK_BLOCK, cells), "dark-mode-coverage")).toBe(false);
  });

  test("a :hover-only dark rule does not count as coverage (resting state stays light)", () => {
    const head = `${OPT_IN}<style>@media (prefers-color-scheme: dark){.c:hover{background:#000 !important}}</style>`;
    expect(has(email(head, `<td class="c" style="background:#fff">a</td>`), "dark-mode-coverage")).toBe(true);
  });

  test("an empty or truncated dark block warns on the opt-in but claims no coverage gap", () => {
    // Nothing is repainted, so nothing can be half-inverted against it.
    for (const head of [
      `<style>@media (prefers-color-scheme: dark){</style>`,
      `<style>@media (prefers-color-scheme: dark){}</style>`,
    ]) {
      const props = darkProps(email(head, `<td bgcolor="#ffffff">a</td>`));
      expect(props).toContain("dark-mode-opt-in");
      expect(props).not.toContain("dark-mode-coverage");
    }
  });

  test("a dark block that only recolours text still flags uncovered light backgrounds", () => {
    // The canonical half-inverted bug: text inverts, the card behind it does not.
    const head = `${OPT_IN}<style>@media (prefers-color-scheme: dark){.ink{color:#F2F3F5 !important}}</style>`;
    const cells = `<td bgcolor="#ffffff"><span class="ink">hi</span></td>`;
    expect(has(email(head, cells), "dark-mode-coverage")).toBe(true);
  });
});

describe("dark mode: integration", () => {
  test("surfaces through auditEmail() and createSession()", () => {
    const html = email(DARK_BLOCK, `<td bgcolor="#ffffff">x</td>`);
    const audited = auditEmail(html).compatibility.warnings.map((w) => w.property);
    expect(audited).toContain("dark-mode-opt-in");
    expect(audited).toContain("dark-mode-coverage");

    const session = createSession(html);
    expect(session.audit().compatibility.warnings.map((w) => w.property)).toContain("dark-mode-coverage");
  });

  test("costs a dark-mode email compatibility score on the affected clients only", () => {
    const clean = generateCompatibilityScore(analyzeEmail(email(OPT_IN + DARK_BLOCK, `<td>x</td>`)));
    const broken = generateCompatibilityScore(analyzeEmail(email(DARK_BLOCK, `<td bgcolor="#ffffff">x</td>`)));
    expect(broken["apple-mail-ios"].score).toBeLessThan(clean["apple-mail-ios"].score);
    expect(broken["gmail-web"].score).toBe(clean["gmail-web"].score);
  });
});

describe("dark mode: no false positives without dark styling", () => {
  test("an email with no prefers-color-scheme at all is completely clean", () => {
    const html = `<html><head><style>.a{color:#111}</style></head><body bgcolor="#ffffff">
      <table bgcolor="#ffffff"><tr><td style="background:#ffffff;color:#111">hi</td></tr></table>
    </body></html>`;
    expect(darkProps(html)).toEqual([]);
  });

  test("a light-only media query does not count as a dark block", () => {
    const head = `<style>@media (prefers-color-scheme: light){.a{color:#111}}</style>`;
    expect(darkProps(email(head, `<td bgcolor="#ffffff">x</td>`))).toEqual([]);
  });

  test("blank input is clean", () => {
    expect(analyzeEmail("")).toEqual([]);
  });
});

describe("dark mode: warning shape", () => {
  test("warnings carry a suggestion and a fixType", () => {
    const warnings = analyzeEmail(email(DARK_BLOCK, `<td bgcolor="#ffffff">x</td>`))
      .filter((w) => w.property.startsWith("dark-mode"));
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.suggestion).toBeTruthy();
      expect(["css", "structural"]).toContain(w.fixType);
      expect(w.message.length).toBeGreaterThan(10);
    }
  });

  test("checkDarkModeFromDom is exported and usable on a parsed DOM", () => {
    const $ = cheerio.load(email(DARK_BLOCK, `<td>x</td>`));
    expect(checkDarkModeFromDom($).some((w) => w.property === "dark-mode-opt-in")).toBe(true);
  });
});
