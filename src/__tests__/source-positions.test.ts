import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CSSWarning } from "../types";
import {
  auditEmail,
  analyzeEmail,
  checkOverflow,
  checkVisual,
  generateCompatibilityScore,
  MAX_WARNING_LOCATIONS,
  analyzeImages,
  checkAccessibility,
  checkTemplateVariables,
  createSession,
  validateLinks,
} from "../index";
import type { AuditReport } from "../audit";
import type { SourceLocation, TemplateReport } from "../types";

// ── Fixture with hand-counted line numbers ───────────────────────────────────
// Kept as an array so a line's number is its index + 1, and an inserted line
// can't silently shift the expectations below.
const LINES = [
  /*  1 */ "<html>",
  /*  2 */ "<head>",
  /*  3 */ "  <style>",
  /*  4 */ "    .card { border-radius: 8px; }",
  /*  5 */ "    .hero { box-shadow: 0 2px 4px #000; }",
  /*  6 */ "  </style>",
  /*  7 */ "</head>",
  /*  8 */ "<body>",
  /*  9 */ '  <h1>Hello {{first_name}}</h1>',
  /* 10 */ '  <h3>Skipped a level</h3>',
  /* 11 */ '  <a href="http://example.com">read more</a>',
  /* 12 */ '  <a>no href here</a>',
  /* 13 */ '  <img src="logo.svg" width="10" height="10">',
  /* 14 */ '  <p style="color: #eee; background-color: #fff; box-shadow: 0 0 2px #000">low contrast</p>',
  /* 15 */ '  <img src="{{cdn}}/x.png" alt="x" width="1" height="2">',
  /* 16 */ "</body>",
  /* 17 */ "</html>",
];
const HTML = LINES.join("\n");

/** Independently derive line/column from an offset, to cross-check every loc. */
function lineColOf(html: string, offset: number): { line: number; column: number } {
  const prefix = html.slice(0, offset);
  const line = prefix.split("\n").length;
  const column = offset - (prefix.lastIndexOf("\n") + 1) + 1;
  return { line, column };
}

/** The source text a loc points at. */
function slice(html: string, loc: SourceLocation): string {
  return html.slice(loc.offset, loc.offset + loc.length);
}

/** Every issue in an audit report, across all ten analyzers. */
function allIssues(
  r: AuditReport,
): Array<{ rule?: string; loc?: SourceLocation; locs?: SourceLocation[]; variable?: string }> {
  return [
    ...r.compatibility.warnings,
    ...r.spam.issues,
    ...r.links.issues,
    ...r.accessibility.issues,
    ...r.images.issues,
    ...r.inboxPreview.issues,
    ...r.size.issues,
    ...r.templateVariables.issues,
    ...r.overflow.issues,
    ...r.visual.issues,
  ];
}

function locsOf(r: AuditReport): SourceLocation[] {
  return allIssues(r).flatMap((i) => {
    const issue = i as { loc?: SourceLocation; locs?: SourceLocation[] };
    return issue.locs ?? (issue.loc ? [issue.loc] : []);
  });
}

/**
 * The invariants every location must satisfy, whatever produced it:
 * inside the document, non-negative, and with line/column that agree with the
 * offset. Applied to real-world fixtures below as a sweep.
 */
function expectWellFormed(html: string, loc: SourceLocation) {
  expect(loc.offset).toBeGreaterThanOrEqual(0);
  expect(loc.length).toBeGreaterThanOrEqual(0);
  expect(loc.offset + loc.length).toBeLessThanOrEqual(html.length);
  expect(loc.line).toBeGreaterThanOrEqual(1);
  expect(loc.column).toBeGreaterThanOrEqual(1);
  expect(loc.endLine).toBeGreaterThanOrEqual(loc.line);
  if (loc.endLine === loc.line) expect(loc.endColumn).toBeGreaterThanOrEqual(loc.column);
  expect(lineColOf(html, loc.offset)).toEqual({ line: loc.line, column: loc.column });
}

/**
 * A location has to point at something that could plausibly have produced the
 * issue: an element, an attribute, a CSS declaration, or a template variable.
 * Off-by-one drift shows up here even when the numbers look internally
 * consistent.
 */
const ANCHOR_SHAPES = [
  /^<[a-zA-Z]/,              // an opening tag
  /^[a-zA-Z-]+\s*=/,         // an attribute
  /^[a-zA-Z-]+\s*:/,         // a CSS declaration
  /^@[a-zA-Z-]+/,            // an at-rule
  /^[{$%*<]/,                // a template variable
];

function expectPlausibleAnchor(html: string, loc: SourceLocation) {
  const text = slice(html, loc);
  if (text.length === 0) return; // deliberate zero-length anchor (see locInCssBlock)
  expect(
    ANCHOR_SHAPES.some((shape) => shape.test(text)),
    `location points at ${JSON.stringify(text.slice(0, 60))}`,
  ).toBe(true);
}

/**
 * Template variables live in text, which has no shape to match on. The anchor
 * must instead sit at or just before the variable it reported, exactly on it
 * in the common case, at the start of the containing text node when the node's
 * text was decoded (character references, or markup the parser dropped).
 */
function expectVariableAnchor(html: string, loc: SourceLocation, variable: string) {
  const from = html.slice(loc.offset);
  const idx = from.indexOf(variable);
  expect(idx, `variable ${variable} not found at or after the anchor`).toBeGreaterThanOrEqual(0);
  expect(idx, `anchor is ${idx} chars before the variable`).toBeLessThan(2000);
}

/**
 * An unbreakable-string finding anchors on the token itself, which by
 * definition is one long run of non-whitespace.
 */
function expectTokenAnchor(html: string, loc: SourceLocation) {
  expect(slice(html, loc)).toMatch(/^\S+$/);
}

/** Dispatch to whichever anchor rule fits the issue that produced the loc. */
function expectIssueAnchor(
  html: string,
  issue: { rule?: string; loc?: SourceLocation; locs?: SourceLocation[]; variable?: string },
) {
  if (!issue.loc) return;
  expectWellFormed(html, issue.loc);
  if (issue.variable) expectVariableAnchor(html, issue.loc, issue.variable);
  else if (issue.rule === "unbreakable-string") expectTokenAnchor(html, issue.loc);
  else expectPlausibleAnchor(html, issue.loc);

  if (!issue.locs) return;
  // Occurrences: first is `loc`, in document order, no repeats, each anchored
  // as strictly as the first. Applied to every fuzz document below.
  const anchorEach =
    issue.rule === "unbreakable-string" ? expectTokenAnchor : expectPlausibleAnchor;
  expect(issue.locs[0]).toEqual(issue.loc);
  const offsets = issue.locs.map((l) => l.offset);
  expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  expect(new Set(offsets).size).toBe(offsets.length);
  for (const loc of issue.locs) {
    expectWellFormed(html, loc);
    anchorEach(html, loc);
  }
}

describe("source positions: CSS compatibility", () => {
  const warnings = analyzeEmail(HTML, undefined, { positions: true });

  test("a declaration in a <style> block resolves to its document position", () => {
    const w = warnings.find((w) => w.property === "border-radius");
    expect(w?.loc).toBeDefined();
    expect(w!.loc!.line).toBe(4);
    expect(slice(HTML, w!.loc!)).toBe("border-radius: 8px");
  });

  test("a second declaration further down the same block stays correct", () => {
    const w = warnings.find((w) => w.property === "box-shadow" && !w.selector);
    expect(w!.loc!.line).toBe(5);
    expect(slice(HTML, w!.loc!)).toBe("box-shadow: 0 2px 4px #000");
  });

  test("an inline style anchors on the declaration, not the whole attribute", () => {
    // The attribute holds three declarations and the engine knows which one it
    // means. Underlining all of it says "something in here".
    const w = warnings.find((w) => w.property === "box-shadow" && w.selector);
    expect(w!.loc!.line).toBe(14);
    expect(slice(HTML, w!.loc!)).toBe("box-shadow: 0 0 2px #000");
  });

  test("an unsupported HTML feature anchors on the element that triggered it", () => {
    const w = warnings.find((w) => w.property === "<style>");
    expect(w!.loc!.line).toBe(3);
    expect(slice(HTML, w!.loc!)).toBe("<style>");
  });

  test("legacy `line` becomes document-absolute when positions are on", () => {
    const w = warnings.find((w) => w.property === "border-radius");
    expect(w!.line).toBe(4);
    expect(w!.line).toBe(w!.loc!.line);
  });

  test("legacy `line` keeps its block-relative meaning when positions are off", () => {
    const legacy = analyzeEmail(HTML).find((w) => w.property === "border-radius");
    expect(legacy!.loc).toBeUndefined();
    // Line 2 of the CSS text inside the block, which starts after `<style>`.
    expect(legacy!.line).toBe(2);
  });
});

describe("source positions: links", () => {
  const report = validateLinks(HTML, { positions: true });

  test("an insecure link points at the href attribute", () => {
    const issue = report.issues.find((i) => i.rule === "insecure-link");
    expect(issue!.loc!.line).toBe(11);
    expect(slice(HTML, issue!.loc!)).toBe('href="http://example.com"');
  });

  test("a link with no href points at the opening tag", () => {
    const issue = report.issues.find((i) => i.rule === "empty-href");
    expect(issue!.loc!.line).toBe(12);
    expect(slice(HTML, issue!.loc!)).toBe("<a>");
  });
});

describe("source positions: images", () => {
  const report = analyzeImages(HTML, { positions: true });

  test("a format finding points at the src attribute", () => {
    const issue = report.issues.find((i) => i.rule === "svg-format");
    expect(issue!.loc!.line).toBe(13);
    expect(slice(HTML, issue!.loc!)).toBe('src="logo.svg"');
  });

  test("a missing attribute points at the whole tag", () => {
    const issue = report.issues.find((i) => i.rule === "missing-alt");
    expect(issue!.loc!.line).toBe(13);
    expect(slice(HTML, issue!.loc!)).toBe('<img src="logo.svg" width="10" height="10">');
  });

  test("aggregate findings carry no position", () => {
    const many = `<body>${'<img src="a.png" alt="a" width="1" height="1" style="display:block">'.repeat(12)}</body>`;
    const r = analyzeImages(many, { positions: true });
    expect(r.issues.find((i) => i.rule === "high-image-count")?.loc).toBeUndefined();
  });
});

describe("source positions: accessibility", () => {
  const report = checkAccessibility(HTML, { positions: true });

  test("missing lang points at the <html> element", () => {
    const issue = report.issues.find((i) => i.rule === "missing-lang");
    expect(issue!.loc!.line).toBe(1);
    expect(slice(HTML, issue!.loc!)).toBe("<html>");
  });

  test("missing charset points at the <head>", () => {
    const issue = report.issues.find((i) => i.rule === "missing-charset");
    expect(issue!.loc!.line).toBe(2);
    expect(slice(HTML, issue!.loc!)).toBe("<head>");
  });

  test("a contrast finding points at the style attribute that caused it", () => {
    const issue = report.issues.find((i) => i.rule === "low-contrast");
    expect(issue!.loc!.line).toBe(14);
    expect(slice(HTML, issue!.loc!)).toBe(
      'style="color: #eee; background-color: #fff; box-shadow: 0 0 2px #000"',
    );
  });

  test("a skipped heading points at the heading that skipped", () => {
    const issue = report.issues.find((i) => i.rule === "heading-skip");
    expect(issue!.loc!.line).toBe(10);
    expect(slice(HTML, issue!.loc!)).toBe("<h3>");
  });
});

describe("source positions: template variables", () => {
  const report = checkTemplateVariables(HTML, { positions: true });

  test("a variable in text points at the variable itself, not the element", () => {
    const issue = report.issues.find((i) => i.variable === "{{first_name}}");
    expect(issue!.loc!.line).toBe(9);
    expect(slice(HTML, issue!.loc!)).toBe("{{first_name}}");
  });

  test("a variable in an attribute points at the attribute", () => {
    const issue = report.issues.find((i) => i.variable === "{{cdn}}");
    expect(issue!.loc!.line).toBe(15);
    expect(slice(HTML, issue!.loc!)).toBe('src="{{cdn}}/x.png"');
  });

  test("a variable on a later line of a multi-line text node keeps its column", () => {
    const multi = ["<body>", "  <p>hello", "  there {{name}} again", "  </p>", "</body>"].join("\n");
    const issue = checkTemplateVariables(multi, { positions: true }).issues[0];
    expect(issue.loc!.line).toBe(3);
    expect(slice(multi, issue.loc!)).toBe("{{name}}");
  });

  test("character references do not shift the anchor", () => {
    const entities = ["<body>", "  <p>caf&eacute; {{name}}</p>", "</body>"].join("\n");
    const issue = checkTemplateVariables(entities, { positions: true }).issues[0];
    expect(issue.loc!.line).toBe(2);
    expect(slice(entities, issue.loc!)).toBe("{{name}}");
  });

  test("a variable split across elements is still reported, without a position", () => {
    const split = "<body><p>{{ <b>name</b> }}</p></body>";
    const report = checkTemplateVariables(split, { positions: true });
    const issue = report.issues.find((i) => i.variable.includes("name"));
    expect(issue).toBeDefined();
    expect(issue!.loc).toBeUndefined();
  });
});

describe("positions are opt-in", () => {
  test("no analyzer emits a loc when positions are off", () => {
    const report = auditEmail(HTML);
    expect(locsOf(report)).toHaveLength(0);
  });

  test("the same audit with positions on emits locs", () => {
    const report = auditEmail(HTML, { positions: true });
    expect(locsOf(report).length).toBeGreaterThan(5);
  });

  test("turning positions on changes nothing but the positions", () => {
    const without = auditEmail(HTML);
    const with_ = auditEmail(HTML, { positions: true });

    const strip = (r: AuditReport) =>
      JSON.parse(
        JSON.stringify(r, (key, value) =>
          key === "loc" || key === "locs" || key === "line" ? undefined : value,
        ),
      );
    expect(strip(with_)).toEqual(strip(without));
  });

  test("createSession threads the option through every analyzer", () => {
    const on = createSession(HTML, { positions: true });
    const off = createSession(HTML);
    expect(locsOf(on.audit()).length).toBeGreaterThan(5);
    expect(locsOf(off.audit())).toHaveLength(0);
    expect(on.validateLinks().issues.some((i) => i.loc)).toBe(true);
    expect(off.validateLinks().issues.some((i) => i.loc)).toBe(false);
    expect(on.checkTemplateVariables().issues.some((i) => i.loc)).toBe(true);
    expect(off.checkTemplateVariables().issues.some((i) => i.loc)).toBe(false);
    expect(on.checkAccessibility().issues.some((i) => i.loc)).toBe(true);
    expect(off.checkAccessibility().issues.some((i) => i.loc)).toBe(false);
    expect(on.analyzeImages().issues.some((i) => i.loc)).toBe(true);
    expect(off.analyzeImages().issues.some((i) => i.loc)).toBe(false);
    expect(on.analyze().some((w) => w.loc)).toBe(true);
    expect(off.analyze().some((w) => w.loc)).toBe(false);
  });
});

describe("document-level findings have no position", () => {
  test("Gmail clipping is about the whole document", () => {
    const big = `<body><p>${"padding ".repeat(14_000)}</p></body>`;
    const report = auditEmail(big, { positions: true });
    const clip = report.size.issues.find((i) => i.rule === "gmail-clipped");
    expect(clip).toBeDefined();
    expect(clip!.loc).toBeUndefined();
  });
});

describe("robustness", () => {
  test("every loc in a hand-written fixture is well formed", () => {
    for (const loc of locsOf(auditEmail(HTML, { positions: true }))) {
      expectWellFormed(HTML, loc);
    }
  });

  test.each(["cerberus-newsletter.html", "leemunroe-responsive.html", "receipt-notification.html"])(
    "every loc in %s is well formed",
    (name) => {
      const html = readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
      const report = auditEmail(html, { positions: true });
      expect(locsOf(report).length).toBeGreaterThan(0);
      for (const issue of allIssues(report)) expectIssueAnchor(html, issue);
    },
  );

  test("CRLF line endings do not shift positions", () => {
    const crlf = LINES.join("\r\n");
    const w = analyzeEmail(crlf, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.loc!.line).toBe(4);
    expect(slice(crlf, w!.loc!)).toBe("border-radius: 8px");
  });

  test("unclosed and malformed markup still yields well-formed positions", () => {
    const broken = '<html><body><p style="border-radius:4px">oops<a href="http://x">x</body>';
    const report = auditEmail(broken, { positions: true });
    for (const loc of locsOf(report)) expectWellFormed(broken, loc);
    const link = report.links.issues.find((i) => i.rule === "insecure-link");
    expect(slice(broken, link!.loc!)).toBe('href="http://x"');
  });

  test("a <style> block on a single line with the content inline resolves correctly", () => {
    const oneLine = "<html><head><style>.a{border-radius:4px}</style></head><body>x</body></html>";
    const w = analyzeEmail(oneLine, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.loc!.line).toBe(1);
    expect(slice(oneLine, w!.loc!)).toBe("border-radius:4px");
  });

  test("multiple <style> blocks each anchor to their own block", () => {
    const two = [
      "<html><head>",
      "<style>.a { border-radius: 4px; }</style>",
      "<style>.b { box-shadow: 0 0 1px #000; }</style>",
      "</head><body>x</body></html>",
    ].join("\n");
    const warnings = analyzeEmail(two, undefined, { positions: true });
    expect(slice(two, warnings.find((w) => w.property === "border-radius")!.loc!)).toBe(
      "border-radius: 4px",
    );
    expect(slice(two, warnings.find((w) => w.property === "box-shadow")!.loc!)).toBe(
      "box-shadow: 0 0 1px #000",
    );
  });

  test("unparseable CSS in a block does not break positions elsewhere", () => {
    const bad = [
      "<html><head>",
      "<style>.a { { { border-radius </style>",
      "<style>.b { box-shadow: 0 0 1px #000; }</style>",
      "</head><body>x</body></html>",
    ].join("\n");
    const warnings = analyzeEmail(bad, undefined, { positions: true });
    const shadow = warnings.find((w) => w.property === "box-shadow");
    expect(slice(bad, shadow!.loc!)).toBe("box-shadow: 0 0 1px #000");
  });

  test("repeated occurrences report the first one", () => {
    const repeated = [
      "<body>",
      '  <p style="border-radius: 4px">first</p>',
      '  <p style="border-radius: 8px">second</p>',
      "</body>",
    ].join("\n");
    const w = analyzeEmail(repeated, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.loc!.line).toBe(2);
  });

  test("a deeply nested document does not blow the stack", () => {
    // Tables inside tables is how email markup is built. The text scan used to
    // clone the DOM and recurse once per level; it now walks iteratively.
    const depth = 20_000;
    const deep = `<body>${"<div>".repeat(depth)}{{deep}}${"</div>".repeat(depth)}</body>`;
    let report: TemplateReport | undefined;
    expect(() => {
      report = checkTemplateVariables(deep, { positions: true });
    }).not.toThrow();
    expect(report!.issues.some((i) => i.variable === "{{deep}}")).toBe(true);
  });

  test("text nodes are visited in document order", () => {
    const ordered = ["<body>", "  <p>{{a}}</p>", "  <p>{{b}}</p>", "  <p>{{c}}</p>", "</body>"].join("\n");
    const issues = checkTemplateVariables(ordered, { positions: true }).issues;
    expect(issues.map((i) => i.variable)).toEqual(["{{a}}", "{{b}}", "{{c}}"]);
    expect(issues.map((i) => i.loc!.line)).toEqual([2, 3, 4]);
  });

  test("empty and whitespace-only input is handled", () => {
    expect(auditEmail("", { positions: true }).compatibility.warnings).toHaveLength(0);
    expect(auditEmail("   ", { positions: true }).compatibility.warnings).toHaveLength(0);
    expect(createSession("", { positions: true }).audit().links.issues).toHaveLength(0);
  });

  test("a document with no issues produces no positions", () => {
    const clean = '<html lang="en"><head><meta charset="utf-8"><title>Hi</title></head><body><p>Hi</p></body></html>';
    const report = auditEmail(clean, { positions: true });
    for (const loc of locsOf(report)) expectWellFormed(clean, loc);
  });
});

// ── Fuzz ─────────────────────────────────────────────────────────────────────
// Deterministic (seeded) generation, so a failure is always reproducible.

/** Small, fast, reproducible PRNG (mulberry32). */
function makeRng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

const FUZZ_TAGS = ["div", "p", "td", "a", "img", "h1", "h4", "span", "table"];
const FUZZ_PROPS = ["border-radius", "box-shadow", "position", "display", "gap", "margin", "color", "float"];
const FUZZ_VALUES = ["8px", "flex", "grid", "fixed", "-4px", "#eee", "0 0 2px #000", "left", "auto"];
// Text that exercises the decoding paths: plain, entities, emoji, merge tags.
const FUZZ_TEXT = ["hello", "caf&eacute;", "{{first_name}}", "a &amp; b", "🎉 party", "*|FNAME|*", "${x}"];
const FUZZ_EOL = ["\n", "\r\n"];

function generateEmail(rng: () => number): string {
  const eol = pick(rng, FUZZ_EOL);
  const rows: string[] = ["<html>", "<head>", "<style>"];
  const blockLines = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < blockLines; i++) {
    rows.push(`  .c${i} { ${pick(rng, FUZZ_PROPS)}: ${pick(rng, FUZZ_VALUES)}; }`);
  }
  rows.push("</style>", "</head>", "<body>");
  const n = 1 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const tag = pick(rng, FUZZ_TAGS);
    const style = `${pick(rng, FUZZ_PROPS)}: ${pick(rng, FUZZ_VALUES)}`;
    const attrs = tag === "img"
      ? ` src="${pick(rng, ["a.png", "b.svg", "{{cdn}}/c.webp"])}"`
      : tag === "a"
        ? ` href="${pick(rng, ["http://x.com", "#", "", "https://ok.com", "{{link}}"])}"`
        : "";
    rows.push(`  <${tag}${attrs} style="${style}">${pick(rng, FUZZ_TEXT)}</${tag}>`);
  }
  rows.push("</body>", "</html>");
  return rows.join(eol);
}

describe("fuzz: positions never drift", () => {
  test("300 generated emails produce only well-formed, plausible locations", () => {
    const rng = makeRng(20260822);
    for (let i = 0; i < 300; i++) {
      const html = generateEmail(rng);
      let report: AuditReport | undefined;
      expect(() => {
        report = auditEmail(html, { positions: true });
      }).not.toThrow();
      for (const issue of allIssues(report!)) expectIssueAnchor(html, issue);
    }
  });

  test("adversarial input produces no malformed locations", () => {
    const adversarial = [
      "",
      "   ",
      "<html></html>",
      "not html at all, just text {{var}}",
      "<div".repeat(200) + "x" + "</div>".repeat(200),
      "<style>.x{{{ broken</style><p style='border-radius:4px'>x</p>",
      "<div style=''></div>",
      "<div style='width:'></div>",
      "<a href>no value</a>",
      "<img src style='box-shadow:0 0 1px #000'>",
      "<p>&amp;&amp;&amp; {{v}}</p>",
      "<style>\r\n.a { border-radius: 4px; }\r\n</style>",
      "<style>\r\n.a { border-radius: 4px; }\n.b { gap: 2px; }\r\n</style>",
      "<p>" + "x".repeat(5000) + " {{late}}</p>",
      "<DIV STYLE='POSITION:FIXED'>uppercase</DIV>",
      "<div style='color:🎉;box-shadow:💥'>emoji {{e}}</div>",
    ];
    for (const html of adversarial) {
      let report: AuditReport | undefined;
      expect(() => {
        report = auditEmail(html, { positions: true });
      }).not.toThrow();
      for (const issue of allIssues(report!)) expectIssueAnchor(html, issue);
    }
  });
});

describe("character references and mixed line endings resolve exactly", () => {
  // These decode to something shorter than their source, so an index into the
  // text the analyzer sees is not an index into the file. Each case asserts the
  // position lands on the variable itself, not on the text before it.
  test.each([
    ["a named reference", "<p>Tom &amp; Jerry, {{name}}</p>"],
    ["several references", "<p>&nbsp;&mdash;&amp;&lt;&gt; {{name}} &copy;</p>"],
    ["a numeric reference", "<p>&#8212;&#x2014; {{name}}</p>"],
    ["an emoji", "<p>🎉🎉 {{name}}</p>"],
    ["a reference in the variable's own line", "<p>caf&eacute; and {{name}}</p>"],
  ])("%s", (_label, body) => {
    const html = `<body>\n  ${body}\n</body>`;
    const issue = checkTemplateVariables(html, { positions: true }).issues[0];
    expect(slice(html, issue.loc!)).toBe("{{name}}");
    expectWellFormed(html, issue.loc!);
  });

  test("references and CRLF together", () => {
    const html = "<body>\r\n  <p>caf&eacute;\r\n  and {{name}}</p>\r\n</body>";
    const issue = checkTemplateVariables(html, { positions: true }).issues[0];
    expect(slice(html, issue.loc!)).toBe("{{name}}");
    expect(issue.loc!.line).toBe(3);
  });

  test("the same variable twice resolves each occurrence to its own place", () => {
    const html = "<body>\n  <p>&amp; {{a}} then &amp; {{a}}</p>\n</body>";
    const issue = checkTemplateVariables(html, { positions: true }).issues[0];
    // Deduplicated to one issue, anchored on the first occurrence.
    expect(slice(html, issue.loc!)).toBe("{{a}}");
    expect(issue.loc!.offset).toBe(html.indexOf("{{a}}"));
  });

  test("a style block mixing CRLF and LF still resolves the declaration", () => {
    // A build that concatenates CSS with \n into a CRLF template produces this.
    const html =
      "<html><head>\r\n<style>\r\n.a { color: red; }\n.b { border-radius: 4px; }\r\n</style>\r\n</head><body>x</body></html>";
    const w = analyzeEmail(html, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(slice(html, w!.loc!)).toBe("border-radius: 4px");
    expectWellFormed(html, w!.loc!);
  });

  test("a variable that is itself encoded falls back rather than mislocating", () => {
    const html = "<body>\n  <p>{{a&amp;b}}</p>\n</body>";
    const issues = checkTemplateVariables(html, { positions: true }).issues;
    for (const issue of issues) {
      if (!issue.loc) continue;
      expectWellFormed(html, issue.loc);
      // Whatever it points at, it must be inside the paragraph that contains it.
      expect(issue.loc.offset).toBeGreaterThanOrEqual(html.indexOf("<p>"));
      expect(issue.loc.offset + issue.loc.length).toBeLessThanOrEqual(html.indexOf("</p>"));
    }
  });
});

describe("an inline style anchors on the declaration", () => {
  // engine#16. `locOfAttr` gives the whole attribute, which is a fair place to
  // act but a poor place to look: six declarations underlined end to end says
  // "something in here", when the engine knows which one it means.
  const at = (html: string, pick: (w: CSSWarning) => boolean) => {
    const w = analyzeEmail(html, undefined, { positions: true }).find(pick);
    return w?.loc ? slice(html, w.loc) : undefined;
  };

  test("picks its own declaration out of a crowded attribute", () => {
    const html = `<body><div style="margin:0;padding:0;font-size:1rem;color:#333">x</div></body>`;
    expect(at(html, (w) => w.property === "font-size")).toBe("font-size:1rem");
    expect(at(html, (w) => w.property === "padding")).toBe("padding:0");
  });

  test("keeps the declaration's own spacing, not the space around it", () => {
    const html = `<body><div style="color: red ;  box-shadow: 0 0 2px #000  ">x</div></body>`;
    expect(at(html, (w) => w.property === "box-shadow")).toBe("box-shadow: 0 0 2px #000");
  });

  test("a property name inside a value is not a declaration", () => {
    // `background: url(font-size.png)` must not read as a `font-size`, and the
    // background finding must anchor on the whole declaration.
    const html = `<body><p style="background: url(font-size.png) no-repeat">x</p></body>`;
    expect(at(html, (w) => w.property === "font-size")).toBeUndefined();
    expect(at(html, (w) => w.property === "background")).toBe(
      "background: url(font-size.png) no-repeat",
    );
  });

  test("a semicolon inside a value does not split the declaration", () => {
    const html = `<body><p style="background:url(a;b.png);color:red">x</p></body>`;
    expect(at(html, (w) => w.property === "background")).toBe("background:url(a;b.png)");
  });

  test("a property declared twice is two places, and each client gets the right one", () => {
    // Gmail drops `flex` and renders `block`; Outlook supports only `none`, so
    // both declarations are its problem. Neither should be pointed at a
    // declaration that is fine for it.
    const html = `<body><img style="display:block;display:flex" src="x.png" alt="x"></body>`;
    const warnings = analyzeEmail(html, undefined, { positions: true });
    const places = (client: string) =>
      warnings
        .filter((w) => w.property === "display" && w.client === client)
        .flatMap((w) => w.locs ?? [])
        .map((l) => slice(html, l));

    expect(places("gmail-android")).toEqual(["display:flex"]);
    expect(places("outlook-windows")).toEqual(["display:block", "display:flex"]);
  });

  test("uppercase and odd spacing still resolve", () => {
    const html = `<body><div style="FONT-SIZE : 1REM">x</div></body>`;
    expect(at(html, (w) => w.property === "font-size")).toBe("FONT-SIZE : 1REM");
  });

  test("single quotes are handled like double", () => {
    const html = `<body><div style='margin:0;font-size:1rem'>x</div></body>`;
    expect(at(html, (w) => w.property === "font-size")).toBe("font-size:1rem");
  });

  test("falls back to the whole attribute rather than guessing", () => {
    // parse5 hands us the decoded attribute, so the DOM sees `font-size` where
    // the source says `font&#45;size`. There is no exact place to point, so it
    // points at the attribute, still reported, still actionable, just less
    // precise. Inventing an offset that looked right would be worse.
    const html = `<body><div style="font&#45;size:1rem">x</div></body>`;
    expect(at(html, (w) => w.property === "font-size")).toBe('style="font&#45;size:1rem"');
  });

  test("dark-mode coverage points at the background it is about", () => {
    // It names one colour, "keeps its hardcoded light background (#faf8f5)",
    // so it should underline the declaration that set it, not the five others
    // sharing the attribute.
    const html = [
      "<html><head><style>",
      "@media (prefers-color-scheme: dark) { .x { color: #fff } }",
      "</style></head><body>",
      '<div class="y" style="margin:0;background-color:#faf8f5;padding:8px">x</div>',
      "</body></html>",
    ].join("\n");
    expect(at(html, (w) => w.property === "dark-mode-coverage")).toBe(
      "background-color:#faf8f5",
    );
  });
});

describe("every occurrence is reported, not just the first", () => {
  const twelve = ["<body>", ...Array.from({ length: 12 }, () => '  <div style="border-radius:4px">x</div>'), "</body>"].join("\n");

  test("one warning still covers the property, but carries all twelve places", () => {
    const w = analyzeEmail(twelve, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.locs).toHaveLength(12);
    expect(w!.locs!.map((l) => l.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (const loc of w!.locs!) expect(slice(twelve, loc)).toBe("border-radius:4px");
  });

  test("`loc` is the first of `locs`", () => {
    const w = analyzeEmail(twelve, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.loc).toEqual(w!.locs![0]);
  });

  test("occurrence count does not change warning count or scores", () => {
    const one = '<body>\n  <div style="border-radius:4px">x</div>\n</body>';
    const warningsOne = analyzeEmail(one, undefined, { positions: true });
    const warningsTwelve = analyzeEmail(twelve, undefined, { positions: true });

    expect(warningsTwelve.length).toBe(warningsOne.length);
    expect(generateCompatibilityScore(warningsTwelve)).toEqual(
      generateCompatibilityScore(warningsOne),
    );
  });

  test("a property used by several rules in a <style> block records each rule", () => {
    const css = [
      "<html><head><style>",
      "  .a { border-radius: 4px; }",
      "  .b { border-radius: 8px; }",
      "</style></head><body>x</body></html>",
    ].join("\n");
    const w = analyzeEmail(css, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.locs!.map((l) => l.line)).toEqual([2, 3]);
  });

  test("repeated elements are capped so a generated email can't flood the report", () => {
    const many = `<body>${'<div style="border-radius:4px">x</div>'.repeat(250)}</body>`;
    const w = analyzeEmail(many, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.locs).toHaveLength(MAX_WARNING_LOCATIONS);
  });

  test("no occurrences are recorded when positions are off", () => {
    const w = analyzeEmail(twelve).find((w) => w.property === "border-radius");
    expect(w!.locs).toBeUndefined();
    expect(w!.loc).toBeUndefined();
  });
});

describe("source positions: layout and visual findings", () => {
  // These carry a concrete `fix`, so they are the findings an editor is most
  // likely to offer to apply, and the ones that had no position at all until
  // they were wired up.
  const LAYOUT = [
    /* 1 */ "<body>",
    /* 2 */ '  <table width="900"><tr><td>wide</td></tr></table>',
    /* 3 */ '  <div style="width:800px">also wide</div>',
    /* 4 */ '  <div style="background:linear-gradient(#fff,#000)">no fallback</div>',
    /* 5 */ '  <div style="font-family:Comic">no fallback</div>',
    /* 6 */ "</body>",
  ].join("\n");

  test("a fixed width points at whichever of attribute or style declared it", () => {
    const issues = checkOverflow(LAYOUT, { positions: true }).issues;
    const attr = issues.find((i) => i.message.includes("900"));
    const style = issues.find((i) => i.message.includes("800"));
    expect(slice(LAYOUT, attr!.loc!)).toBe('width="900"');
    expect(slice(LAYOUT, style!.loc!)).toBe('style="width:800px"');
  });

  test("visual findings point at the declaration that caused them", () => {
    const issues = checkVisual(LAYOUT, { positions: true }).issues;
    const bg = issues.find((i) => i.rule === "missing-background-fallback");
    const font = issues.find((i) => i.rule === "missing-font-fallback");
    expect(bg!.loc!.line).toBe(4);
    expect(font!.loc!.line).toBe(5);
  });

  test("inside a <style> block each check points at its own declaration", () => {
    const css = [
      "<html><head><style>",
      "  .hero { background: linear-gradient(#fff,#000); }",
      "  .body { font-family: Comic; }",
      "</style></head><body>x</body></html>",
    ].join("\n");
    const issues = checkVisual(css, { positions: true }).issues;
    expect(slice(css, issues.find((i) => i.rule === "missing-background-fallback")!.loc!)).toBe(
      "background: linear-gradient(#fff,#000)",
    );
    expect(slice(css, issues.find((i) => i.rule === "missing-font-fallback")!.loc!)).toBe(
      "font-family: Comic",
    );
  });

  test("an unbreakable string points at the string itself", () => {
    const html = `<body>\n  <p>see https://example.com/${"x".repeat(90)}</p>\n</body>`;
    const issue = checkOverflow(html, { positions: true }).issues[0];
    expect(slice(html, issue.loc!)).toMatch(/^https:\/\/example\.com\/x+$/);
    expect(issue.loc!.line).toBe(2);
  });

  test("a run split across inline elements is one string, anchored where it starts", () => {
    // `<b>aaa</b>bbb` renders as one unbroken run, scanning node by node would
    // report two shorter strings and understate the overflow.
    const html = `<body><p>see <b>https://example.com/${"a".repeat(40)}</b>${"b".repeat(40)}</p></body>`;
    const issues = checkOverflow(html, { positions: true }).issues.filter(
      (i) => i.rule === "unbreakable-string",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("100-character");
    expect(html.slice(issues[0].loc!.offset)).toStartWith("https://example.com/");
  });

  test("repeated offenders are collected onto one issue", () => {
    const repeated = ["<body>", ...Array.from({ length: 4 }, () => '  <div style="width:800px">x</div>'), "</body>"].join("\n");
    const issue = checkOverflow(repeated, { positions: true }).issues[0];
    expect(issue.locs!.map((l) => l.line)).toEqual([2, 3, 4, 5]);
  });

  test("at-rules point at the rule that triggered them", () => {
    const css = [
      "<html><head><style>",
      "@media (max-width: 600px) { .a { color: red } }",
      "</style></head><body>x</body></html>",
    ].join("\n");
    const w = analyzeEmail(css, undefined, { positions: true }).find((w) => w.property === "@media");
    expect(w!.loc!.line).toBe(2);
    expect(slice(css, w!.loc!)).toBe("@media (max-width: 600px) { .a { color: red } }");
  });

  test("a light background the dark block misses points at the attribute keeping it light", () => {
    const html = [
      "<html><head><style>",
      "@media (prefers-color-scheme: dark) { .a { background: #000 !important } }",
      "</style></head>",
      "<body>",
      '  <table><tr><td bgcolor="#ffffff">x</td></tr></table>',
      "</body></html>",
    ].join("\n");
    const w = analyzeEmail(html, undefined, { positions: true }).find(
      (w) => w.property === "dark-mode-coverage",
    );
    expect(slice(html, w!.loc!)).toBe('bgcolor="#ffffff"');
  });

  test("nothing in a full audit is left unplaceable except document-level findings", () => {
    const report = auditEmail(LAYOUT, { positions: true });
    const unplaced = allIssues(report).filter((i) => !i.loc);
    // Whatever remains must be about the document as a whole, not an element.
    for (const issue of unplaced) {
      expect(["no-links", "missing-subject", "preheader-too-short", "gmail-clipped", "image-only",
        "missing-unsubscribe", "missing-physical-address", "text-to-image-ratio", "no-preheader",
        "missing-charset", "missing-lang", "missing-title", "high-image-count", "tracking-pixel",
        "total-data-uri-size", "duplicate-links", "small-text-multiple", "heading-skip",
      ]).toContain((issue as { rule?: string }).rule);
    }
  });
});

// ── Accuracy ─────────────────────────────────────────────────────────────────
// The tests above assert positions look right. These assert they ARE right, by
// three independent means: ground truth known by construction, an ordering
// invariant, and an edit round-trip that fails if any offset is off by one.

describe("accuracy: ground truth by construction", () => {
  /**
   * Build a document with `count` offenders at offsets we know, separated by
   * filler chosen to break naive offset arithmetic: character references, CRLF,
   * multi-byte characters.
   */
  function withOffenders(count: number, filler: string, eol: string) {
    const offender = '<div style="border-radius:4px">x</div>';
    const lines = ["<body>"];
    for (let i = 0; i < count; i++) lines.push(`  <p>${filler}</p>`, `  ${offender}`);
    lines.push("</body>");
    const html = lines.join(eol);

    // Ground truth: every position of the declaration inside the attribute,
    // found by string search on the source itself, no engine involved.
    const expected: number[] = [];
    for (let at = html.indexOf("border-radius:4px"); at !== -1;
         at = html.indexOf("border-radius:4px", at + 1)) {
      expected.push(at);
    }
    expect(expected).toHaveLength(count);
    return { html, expected };
  }

  const FILLERS: Array<[string, string]> = [
    ["plain text", "hello"],
    ["character references", "Tom &amp; Jerry &nbsp;&mdash;"],
    ["numeric references", "&#8212;&#x2014;"],
    ["emoji", "🎉 party 🎉"],
  ];
  const EOLS: Array<[string, string]> = [["LF", "\n"], ["CRLF", "\r\n"]];

  for (const [fillerName, filler] of FILLERS) {
    for (const [eolName, eol] of EOLS) {
      test(`${fillerName}, ${eolName}: every offender is found, at exactly its offset`, () => {
        const { html, expected } = withOffenders(7, filler, eol);
        const w = analyzeEmail(html, undefined, { positions: true }).find(
          (w) => w.property === "border-radius",
        );
        expect(w!.locs!.map((l) => l.offset)).toEqual(expected);
        for (const loc of w!.locs!) {
          expect(slice(html, loc)).toBe("border-radius:4px");
          expectWellFormed(html, loc);
        }
      });
    }
  }

  test("the count is exact: no occurrence missed, none invented", () => {
    for (const count of [1, 2, 5, 37, 99, 100]) {
      const { html, expected } = withOffenders(count, "Tom &amp; Jerry", "\n");
      const w = analyzeEmail(html, undefined, { positions: true }).find(
        (w) => w.property === "border-radius",
      );
      expect(w!.locs!.map((l) => l.offset)).toEqual(expected);
      expect(w!.locsTruncated).toBeUndefined();
    }
  });

  test("past the cap the list is marked partial, and keeps the first N in order", () => {
    const { html, expected } = withOffenders(140, "hi", "\n");
    const w = analyzeEmail(html, undefined, { positions: true }).find(
      (w) => w.property === "border-radius",
    );
    expect(w!.locs).toHaveLength(MAX_WARNING_LOCATIONS);
    expect(w!.locsTruncated).toBe(true);
    expect(w!.locs!.map((l) => l.offset)).toEqual(expected.slice(0, MAX_WARNING_LOCATIONS));
  });
});

describe("accuracy: ordering invariant", () => {
  test.each(["cerberus-newsletter.html", "leemunroe-responsive.html", "receipt-notification.html"])(
    "%s: every warning's occurrences are in document order, without duplicates",
    (name) => {
      const html = readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
      const warnings = analyzeEmail(html, undefined, { positions: true });
      let checked = 0;

      for (const w of warnings) {
        if (!w.locs) continue;
        checked++;
        const offsets = w.locs.map((l) => l.offset);
        expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
        expect(new Set(offsets).size).toBe(offsets.length);
        expect(w.loc).toEqual(w.locs[0]);
        for (const loc of w.locs) expectWellFormed(html, loc);
      }

      expect(checked).toBeGreaterThan(0);
    },
  );
});

describe("accuracy: the positions are actionable", () => {
  /**
   * The end-to-end property an editor depends on: use `locs` to edit the
   * source, and the finding goes away. An offset that is off by one corrupts
   * the document instead, and the warning survives, so this fails loudly for
   * exactly the defect that is hardest to see by eye.
   */
  test("removing every occurrence by its position clears the warning", () => {
    const html = [
      "<body>",
      "  <p>Tom &amp; Jerry</p>",
      '  <div style="border-radius:4px">a</div>',
      "  <p>caf&eacute; &mdash; 🎉</p>",
      '  <div style="border-radius:4px">b</div>',
      '  <span style="border-radius:4px">c</span>',
      "</body>",
    ].join("\r\n");

    const before = analyzeEmail(html, undefined, { positions: true });
    // Warnings are grouped per selector description, so `div` and `span` are
    // separate warnings for the same property; an editor wanting every place
    // it breaks unions their occurrences, which is what this does.
    const occurrences = before
      .filter((w) => w.property === "border-radius" && w.client === "outlook-windows")
      .flatMap((w) => w.locs ?? []);
    expect(occurrences.length).toBe(3);

    // Apply back to front so earlier offsets stay valid.
    let edited = html;
    for (const loc of [...occurrences].sort((a, b) => b.offset - a.offset)) {
      edited = edited.slice(0, loc.offset) + edited.slice(loc.offset + loc.length);
    }

    expect(edited).not.toContain("border-radius");
    // Only the declarations went: the attribute that held them stays, which is
    // what makes this a surgical edit rather than a blunt one.
    expect(edited).toContain("Tom &amp; Jerry");
    expect(edited).toContain("caf&eacute; &mdash; 🎉");
    expect(edited).toContain('<div style="">a</div>');

    const after = analyzeEmail(edited, undefined, { positions: true });
    expect(after.some((w) => w.property === "border-radius")).toBe(false);
  });

  test("the same round-trip holds on a real newsletter", () => {
    const html = readFileSync(join(import.meta.dir, "fixtures", "cerberus-newsletter.html"), "utf8");
    const warnings = analyzeEmail(html, undefined, { positions: true });

    // Every inline-style occurrence the engine reported, edited out at once.
    //
    // Except dark-mode coverage, which reports at most three elements so a
    // large email cannot flood the report. Removing those three promotes the
    // next three, so the round-trip never terminates for it: a property of
    // the cap, not of the positions. It became visible here only once cuts got
    // precise: excising a whole `style="…"` attribute used to take its
    // neighbouring declarations with it, and now it does not.
    const inline = warnings.filter(
      (w) => w.selector && w.locs && w.property !== "dark-mode-coverage",
    );
    const cuts = [...new Set(inline.flatMap((w) => w.locs!).map((l) => `${l.offset}:${l.length}`))]
      .map((k) => k.split(":").map(Number))
      .sort((a, b) => b[0] - a[0]);
    expect(cuts.length).toBeGreaterThan(5);

    let edited = html;
    for (const [offset, length] of cuts) {
      // Each cut must land exactly on one declaration: `property: value`,
      // starting at the property name, not a character either side of it.
      expect(edited.slice(offset, offset + length)).toMatch(/^[-a-z]+\s*:\s*\S/i);
      edited = edited.slice(0, offset) + edited.slice(offset + length);
    }

    const after = analyzeEmail(edited, undefined, { positions: true });
    expect(after.filter((w) => w.selector && w.property !== "dark-mode-coverage").length).toBe(0);
  });
});
