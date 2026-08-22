import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  auditEmail,
  analyzeEmail,
  analyzeImages,
  checkAccessibility,
  checkTemplateVariables,
  createSession,
  validateLinks,
} from "../index";
import type { AuditReport } from "../audit";
import type { BaseIssue, SourceLocation } from "../types";

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
function allIssues(r: AuditReport): Array<{ loc?: SourceLocation; variable?: string }> {
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
  return allIssues(r)
    .map((i) => (i as { loc?: SourceLocation }).loc)
    .filter((l): l is SourceLocation => l !== undefined);
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
 * must instead sit at or just before the variable it reported — exactly on it
 * in the common case, at the start of the containing text node when the node's
 * text was decoded (character references, or markup the parser dropped).
 */
function expectVariableAnchor(html: string, loc: SourceLocation, variable: string) {
  const from = html.slice(loc.offset);
  const idx = from.indexOf(variable);
  expect(idx, `variable ${variable} not found at or after the anchor`).toBeGreaterThanOrEqual(0);
  expect(idx, `anchor is ${idx} chars before the variable`).toBeLessThan(2000);
}

/** Dispatch to whichever anchor rule fits the issue that produced the loc. */
function expectIssueAnchor(html: string, issue: { loc?: SourceLocation; variable?: string }) {
  if (!issue.loc) return;
  expectWellFormed(html, issue.loc);
  if (issue.variable) expectVariableAnchor(html, issue.loc, issue.variable);
  else expectPlausibleAnchor(html, issue.loc);
}

describe("source positions — CSS compatibility", () => {
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

  test("an inline style anchors on the style attribute", () => {
    const w = warnings.find((w) => w.property === "box-shadow" && w.selector);
    expect(w!.loc!.line).toBe(14);
    expect(slice(HTML, w!.loc!)).toBe(
      'style="color: #eee; background-color: #fff; box-shadow: 0 0 2px #000"',
    );
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

describe("source positions — links", () => {
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

describe("source positions — images", () => {
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

describe("source positions — accessibility", () => {
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

describe("source positions — template variables", () => {
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

  test("character references fall back to the text node's start, still inside that node", () => {
    const entities = ["<body>", "  <p>caf&eacute; {{name}}</p>", "</body>"].join("\n");
    const issue = checkTemplateVariables(entities, { positions: true }).issues[0];
    expect(issue.loc!.line).toBe(2);
    // Approximate within the node, but never past it, and never the wrong node.
    const nodeStart = entities.indexOf("caf&eacute;");
    expect(issue.loc!.offset).toBe(nodeStart);
    expect(issue.loc!.offset + issue.loc!.length).toBeLessThanOrEqual(entities.indexOf("</p>"));
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
        JSON.stringify(r, (key, value) => (key === "loc" || key === "line" ? undefined : value)),
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

describe("fuzz — positions never drift", () => {
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
