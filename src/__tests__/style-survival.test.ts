import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { checkStyleSurvival } from "../style-survival";
import { checkSize } from "../size-checker";
import { auditEmail } from "../audit";
import { EMAIL_CLIENTS } from "../clients";
import { GMAIL_STYLE_LIMIT } from "../constants";

// =============================================================================
// Will the client keep the CSS at all?
//
// Every rule here comes from a reproduction in hteumeuleu/email-bugs, and every
// one is paired with its near miss. The near miss is the important half: these
// fire on hand-written production CSS, so a rule that cannot tell `rgb(0 0 0)`
// from `rgb(0, 0, 0)` gets the whole checker switched off by its users, which
// is worse than never having shipped it.
// =============================================================================

const doc = (head: string, body = "") =>
  `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
const rules = (html: string) => checkStyleSurvival(html).issues.map((i) => i.rule).sort();
const issue = (html: string, rule: string) =>
  checkStyleSurvival(html).issues.find((i) => i.rule === rule);

describe("Gmail drops a style block using space-separated colours (email-bugs#160)", () => {
  it("fires on the modern syntax, in a <style> block and in an attribute", () => {
    expect(rules(doc(`<style>.a{background:rgb(255 0 0)}</style>`))).toEqual([
      "gmail-space-separated-color",
    ]);
    expect(rules(doc("", `<div style="color:rgb(0 0 0 / 50%)">x</div>`))).toEqual([
      "gmail-space-separated-color-inline",
    ]);
    expect(rules(doc(`<style>.a{color:hsl(120 50% 50%)}</style>`))).toEqual([
      "gmail-space-separated-color",
    ]);
  });

  it("stays silent on the comma syntax, which is the one that survives", () => {
    expect(rules(doc(`<style>.a{background:rgb(255, 0, 0)}</style>`))).toEqual([]);
    expect(rules(doc("", `<div style="color:rgba(0, 0, 0, .5)">x</div>`))).toEqual([]);
    expect(rules(doc(`<style>.a{color:hsla(120, 50%, 50%, .5)}</style>`))).toEqual([]);
    // A named or hex colour has no function call to misread.
    expect(rules(doc(`<style>.a{background:#ff0000;color:red}</style>`))).toEqual([]);
  });

  it("does not mistake a comma nested inside another function for the top level", () => {
    // `rgb(calc(1 + 2) 0 0)` has a comma-free argument list even though a comma
    // could appear inside a nested call, so the scan has to track depth.
    expect(rules(doc(`<style>.a{color:rgb(var(--r, 10) 0 0)}</style>`))).toEqual([
      "gmail-space-separated-color",
    ]);
  });

  it("says the whole declaration block goes, not just the colour", () => {
    const found = issue(doc("", `<div style="color:rgb(0 0 0)">x</div>`), "gmail-space-separated-color-inline");
    expect(found?.message).toMatch(/every declaration/i);
    expect(found?.severity).toBe("error");
  });
});

describe("Outlook.com and Outlook mobile drop everything after `}}` (email-bugs#92)", () => {
  it("fires on the minified form", () => {
    expect(rules(doc(`<style>@media screen{div{color:#fff}}.foo{background:green}</style>`)))
      .toEqual(["outlook-double-brace"]);
  });

  it("stays silent once a character separates the braces, which is the fix", () => {
    // The issue's own remedy is to insert any character between them, so a rule
    // matching "braces with optional whitespace" would report the fix as a bug.
    expect(rules(doc(`<style>@media screen{div{color:#fff} }.foo{background:green}</style>`)))
      .toEqual([]);
    expect(rules(doc(`<style>@media screen{div{color:#fff}\n}\n.foo{background:green}</style>`)))
      .toEqual([]);
  });
});

describe("Yahoo and AOL drop everything after an attribute selector holding a semicolon (email-bugs#74)", () => {
  it("fires on the semicolon, which is the whole trigger", () => {
    expect(rules(doc(`<style>div[style="margin: 16px;"]{display:none}.t{background:red}</style>`)))
      .toEqual(["yahoo-attribute-selector-semicolon"]);
  });

  it("stays silent on the same selector without one", () => {
    expect(rules(doc(`<style>div[style="margin: 16px"]{display:none}.t{background:red}</style>`)))
      .toEqual([]);
    // The rewrite the issue recommends must not trip it either.
    expect(rules(doc(`<style>div[style^="margin: 16px"][style$="80%"]{display:none}</style>`)))
      .toEqual([]);
  });

  it("names Yahoo and AOL, and nobody else", () => {
    const found = issue(
      doc(`<style>div[style="margin: 16px;"]{display:none}</style>`),
      "yahoo-attribute-selector-semicolon",
    );
    expect(found?.clients.sort()).toEqual(["aol", "yahoo-mail", "yahoo-mail-android", "yahoo-mail-ios"]);
  });
});

describe("Outlook.com namespaces only the first class in a compound (email-bugs#61)", () => {
  it("fires on a chained compound, which is what the issue is about", () => {
    // `.foo.bar` becomes `.x_foo.bar`, so the rule stops matching. The issue is
    // NOT about comma-separated lists.
    expect(rules(doc(`<style>.foo.bar{background:green}</style>`)))
      .toEqual(["outlook-web-chained-class"]);
    expect(rules(doc(`<style>.foo.bar.quo{background:green}</style>`)))
      .toEqual(["outlook-web-chained-class"]);
  });

  it("stays silent on a comma-separated list, which is unaffected", () => {
    // Reporting these would fire on nearly every stylesheet ever written.
    expect(rules(doc(`<style>h1, h2, h3{color:red}</style>`))).toEqual([]);
    expect(rules(doc(`<style>.foo, .bar{color:red}</style>`))).toEqual([]);
  });

  it("stays silent on a descendant selector using two classes", () => {
    // `.foo .bar` is two compounds, each with one class; only the first is
    // prefixed anyway, and that is correct behaviour here.
    expect(rules(doc(`<style>.foo .bar{color:red}</style>`))).toEqual([]);
  });
});

describe("The Word engine honours only the first class on an element (email-bugs#75)", () => {
  it("fires when two of an element's classes set the same property", () => {
    expect(rules(doc(`<style>.a{color:red}.b{color:blue}</style>`, `<div class="a b">x</div>`)))
      .toEqual(["outlook-first-class-only"]);
  });

  it("stays silent when the classes set different properties", () => {
    // Multiple classes are normal. Only a genuine conflict is lost, and
    // reporting every multi-class element would bury the report on any
    // utility-class template.
    expect(rules(doc(`<style>.a{color:red}.b{padding:4px}</style>`, `<div class="a b">x</div>`)))
      .toEqual([]);
  });

  it("stays silent when the element carries one class", () => {
    expect(rules(doc(`<style>.a{color:red}.b{color:blue}</style>`, `<div class="a">x</div>`)))
      .toEqual([]);
  });

  it("fires on the descendant case the issue documents second", () => {
    // `.text td` is ignored once the table also carries `.pad`.
    expect(
      rules(doc(
        `<style>.text{color:red}.text td{color:blue}.pad{padding:20px}</style>`,
        `<table class="text pad"><tr><td>x</td></tr></table>`,
      )),
    ).toEqual(["outlook-first-class-descendants"]);
  });

  it("stays silent on the same stylesheet when the element has one class", () => {
    expect(
      rules(doc(
        `<style>.text{color:red}.text td{color:blue}</style>`,
        `<table class="text"><tr><td>x</td></tr></table>`,
      )),
    ).toEqual([]);
  });

  it("names the Word engine only", () => {
    // Outlook 2007-2021 and the Office desktop builds. New Outlook renders on
    // the web engine and is a different client id.
    const found = issue(
      doc(`<style>.a{color:red}.b{color:blue}</style>`, `<div class="a b">x</div>`),
      "outlook-first-class-only",
    );
    expect(found?.clients).toEqual(["outlook-windows-legacy"]);
  });
});

describe("Gmail keeps only the first 16 kB of CSS (email-bugs#90)", () => {
  const sheet = (bytes: number) =>
    doc(`<style>${"p{color:#000000;}".repeat(Math.ceil(bytes / 17))}</style>`);

  it("counts style bytes cumulatively, not per block", () => {
    // Two blocks that are each comfortably under the limit and together are not.
    const half = "p{color:#000000;}".repeat(600); // ~10 kB each
    const report = checkSize(doc(`<style>${half}</style><style>${half}</style>`));
    expect(report.styleBytes).toBeGreaterThan(GMAIL_STYLE_LIMIT);
    expect(report.issues.map((i) => i.rule)).toContain("gmail-style-truncated");
  });

  it("bands warning then error, like the 90/102 kB pair beside it", () => {
    expect(checkSize(sheet(2_000)).issues.map((i) => i.rule)).toEqual([]);
    expect(checkSize(sheet(15_000)).issues.map((i) => i.rule)).toEqual(["gmail-style-warning"]);
    expect(checkSize(sheet(20_000)).issues.map((i) => i.rule)).toEqual(["gmail-style-truncated"]);
  });

  it("names the consequence rather than the number", () => {
    const found = checkSize(sheet(20_000)).issues.find((i) => i.rule === "gmail-style-truncated");
    expect(found?.message).toMatch(/drops the rest|no error anywhere/i);
  });

  it("reports zero style bytes for an email with no stylesheet", () => {
    expect(checkSize(doc("", "<p>x</p>")).styleBytes).toBe(0);
  });
});

describe("the checker earns its place in a report", () => {
  it("says nothing about any email this repo ships as a fixture", () => {
    // Six real templates, none of which should trip a single rule. This is the
    // guard against the checker becoming noise on ordinary markup.
    const dir = "src/__tests__/fixtures";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
      const found = checkStyleSurvival(readFileSync(`${dir}/${file}`, "utf-8")).issues;
      expect([file, found.map((i) => i.rule)]).toEqual([file, []]);
    }
  });

  it("every issue names clients that exist", () => {
    // The consuming app groups findings per client; an issue naming a client id
    // that is not in the roster silently fails to surface.
    const ids = new Set(EMAIL_CLIENTS.map((c) => c.id));
    const html = doc(
      `<style>.a{color:rgb(0 0 0)}.b{color:blue}.foo.bar{color:red}` +
        `div[style="m: 1px;"]{display:none}@media screen{p{color:red}}</style>`,
      `<div class="a b">x</div>`,
    );
    const found = checkStyleSurvival(html).issues;
    expect(found.length).toBeGreaterThan(3);
    for (const i of found) {
      expect([i.rule, i.clients.length > 0]).toEqual([i.rule, true]);
      for (const c of i.clients) expect([i.rule, c, ids.has(c)]).toEqual([i.rule, c, true]);
    }
  });

  it("is reachable through auditEmail and can be skipped", () => {
    const html = doc(`<style>.a{background:rgb(255 0 0)}</style>`);
    expect(auditEmail(html).styleSurvival.issues.length).toBeGreaterThan(0);
    expect(auditEmail(html, { skip: ["styleSurvival"] }).styleSurvival.issues).toEqual([]);
  });

  it("survives markup that is not a stylesheet at all", () => {
    for (const html of [
      doc(`<style></style>`),
      doc(`<style>@media{</style>`),
      doc(`<style>}}}}</style>`),
      doc("", `<div style="">x</div>`),
      doc(`<style>.a{color:rgb(}</style>`),
    ]) {
      expect(() => checkStyleSurvival(html)).not.toThrow();
    }
  });
});

describe("the parts of the detectors a reproduction does not reach", () => {
  it("reads a colour function's arguments, not merely the absence of a comma", () => {
    // `rgb()` and `rgb(0)` have no comma either. They are invalid rather than
    // modern, and naming this rule on them would be pointing at the wrong bug.
    expect(rules(doc(`<style>.a{color:rgb()}</style>`))).toEqual([]);
    expect(rules(doc(`<style>.a{color:rgb(0)}</style>`))).toEqual([]);
    // Unterminated: malformed CSS is a different problem from this one.
    expect(rules(doc(`<style>.a{color:rgb(0 0 0</style>`))).toEqual([]);
    expect(rules(doc(`<style>.a{color:RGB(0 0 0)}</style>`))).toEqual([
      "gmail-space-separated-color",
    ]);
  });

  it("counts an id in a compound, because Outlook.com prefixes those too", () => {
    expect(rules(doc(`<style>.a#b{color:red}</style>`))).toEqual(["outlook-web-chained-class"]);
    expect(rules(doc(`<style>#a{color:red}</style>`))).toEqual([]);
  });

  it("sees through a pseudo-class sitting between two classes", () => {
    // `.a:hover.b` is still one compound, so Outlook.com prefixes only `.a`.
    expect(rules(doc(`<style>.a:hover.b{color:red}</style>`))).toEqual([
      "outlook-web-chained-class",
    ]);
  });

  it("finds a conflict split across two <style> blocks", () => {
    expect(
      rules(doc(
        `<style>.a{color:red}</style><style>.b{color:blue}</style>`,
        `<div class="a b">x</div>`,
      )),
    ).toEqual(["outlook-first-class-only"]);
  });

  it("finds a conflict declared inside a media query", () => {
    const found = checkStyleSurvival(
      doc(`<style>@media screen{.a{color:red}.b{color:blue}} </style>`, `<div class="a b">x</div>`),
    ).issues.map((i) => i.rule);
    expect(found).toContain("outlook-first-class-only");
  });

  it("treats a child combinator as a descendant rule", () => {
    expect(
      rules(doc(
        `<style>.t{color:red}.t > td{color:blue}.p{padding:1px}</style>`,
        `<table class="t p"><tr><td>x</td></tr></table>`,
      )),
    ).toEqual(["outlook-first-class-descendants"]);
  });

  it("reports one issue per element, not one per conflicting pair", () => {
    // An element hitting both halves of email-bugs#75 is still one thing to
    // fix, and the message names the first conflict found.
    expect(
      rules(doc(
        `<style>.a{color:red}.b{color:blue}.a td{color:green}</style>`,
        `<table class="a b"><tr><td>x</td></tr></table>`,
      )),
    ).toEqual(["outlook-first-class-only"]);
  });
});

describe("positions", () => {
  const html = `<!DOCTYPE html>
<html><head>
<style>
.a { background: rgb(255 0 0); }
</style>
</head><body><div style="color:rgb(0 0 0)">x</div></body></html>`;

  it("carries none unless the caller asks for them", () => {
    // The rules used to be keyed off the location list, which made every one of
    // them silent in this, the default, configuration.
    const found = checkStyleSurvival(html).issues;
    expect(found.length).toBe(2);
    expect(found.every((i) => i.loc === undefined)).toBe(true);
  });

  it("points at the offending text when it does", () => {
    const found = checkStyleSurvival(html, { positions: true }).issues;
    const block = found.find((i) => i.rule === "gmail-space-separated-color");
    expect(html.slice(block!.loc!.offset)).toStartWith("rgb(255 0 0)");
    const inline = found.find((i) => i.rule === "gmail-space-separated-color-inline");
    expect(html.slice(inline!.loc!.offset)).toStartWith("<div style=");
  });

  it("caps the list and says it capped it", () => {
    const many = Array.from(
      { length: 30 },
      (_, i) => `<div style="color:rgb(0 0 ${i})">x</div>`,
    ).join("");
    const found = checkStyleSurvival(`<html><body>${many}</body></html>`, {
      positions: true,
    }).issues[0];
    expect(found.locs).toHaveLength(20);
    expect(found.locsTruncated).toBe(true);
  });
});

describe("hostile input", () => {
  it("stays linear when the stylesheet is nothing but colour-function openings", () => {
    // Each `rgb(` used to scan to the end of the stylesheet looking for its
    // closing paren, so a file of them was quadratic: 156 KB took 11.7s
    // against a 2 MB input cap. The scan is bounded now.
    const time = (n: number) => {
      const css = "rgb(".repeat(n);
      const html = `<html><head><style>${css}</style></head><body><p>x</p></body></html>`;
      const started = Date.now();
      checkStyleSurvival(html);
      return Date.now() - started;
    };
    // Generous, because CI machines vary; the failure this guards took minutes.
    expect(time(40_000)).toBeLessThan(3_000);
    expect(time(160_000)).toBeLessThan(6_000);
  });

  it("still finds a real colour after the bound was added", () => {
    expect(rules(doc(`<style>.a{color:rgb(0 0 0)}</style>`))).toEqual([
      "gmail-space-separated-color",
    ]);
    // A colour function longer than the bound is not one; nothing is reported
    // and nothing hangs.
    const long = `<style>.a{color:rgb(${"0 ".repeat(400)})}</style>`;
    expect(() => checkStyleSurvival(doc(long))).not.toThrow();
  });
});
