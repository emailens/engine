/**
 * Property/fuzz tests: feed a broad, deterministic spread of generated and
 * adversarial HTML through every analyzer and assert invariants that must hold
 * for ANY input: nothing throws, the report is complete, and every issue is
 * well-formed. Deterministic (seeded PRNG) so a failure is always reproducible.
 */
import { describe, test, expect } from "bun:test";
import {
  auditEmail,
  analyzeEmail,
  transformForAllClients,
  checkOverflow,
  checkVisual,
  EMAIL_CLIENTS,
} from "../index";

/** Small, fast, reproducible PRNG (mulberry32). */
function makeRng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAGS = ["div", "span", "p", "td", "table", "a", "img", "h1", "section", "button", "ul", "li"];
const PROPS = [
  "margin", "padding", "position", "overflow", "width", "height", "background",
  "background-image", "font-family", "color", "display", "box-shadow",
  "transform", "border-radius", "gap", "float", "max-width",
];
const VALUES = [
  "", "0", "-8px", "auto", "16px", "100%", "999px", "fixed", "sticky", "relative",
  "grid", "flex", "none", "linear-gradient(90deg,#f00,#00f)",
  "radial-gradient(circle, rgba(0,0,0,.5), transparent)", "url(x.png)", "rgb(1,2,3)",
  "hsl(0,0%,0%)", "inherit", "calc(100% - 8px)", "🎉 unicode", "expression(alert(1))",
  "'; DROP TABLE emails;--", "<script>", 'quote"inside',
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function generateEmail(rng: () => number): string {
  const n = 1 + Math.floor(rng() * 4);
  let inner = "";
  for (let i = 0; i < n; i++) {
    const tag = pick(rng, TAGS);
    const decls: string[] = [];
    const d = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < d; j++) decls.push(`${pick(rng, PROPS)}: ${pick(rng, VALUES)}`);
    inner += `<${tag} style="${decls.join("; ")}">text ${i}</${tag}>`;
  }
  return `<html><head><style>.c{${pick(rng, PROPS)}:${pick(rng, VALUES)}}</style></head><body>${inner}</body></html>`;
}

const ADVERSARIAL = [
  "",
  "   ",
  "<html></html>",
  "<div style=''></div>",
  "<div style='width:'></div>",
  "<div style='background:'></div>",
  "not html at all, just text",
  "<div".repeat(200) + "x" + "</div>".repeat(200), // deeply nested
  "<p style='font-family:'>x</p>",
  "<table width=''><tr><td width='abc'>x</td></tr></table>",
  "<div style='background: linear-gradient('>x</div>", // truncated gradient
  "<style>.x{{{ broken</style><p>x</p>",
  "<div style='margin:-;padding:;;;'>x</div>",
  "<a style='background:url()'>x</a>",
  "<div style='" + "a:b;".repeat(500) + "'>huge</div>",
  "<p>" + "word".repeat(50) + " " + "x".repeat(100) + "</p>", // long strings
  "<DIV STYLE='POSITION:FIXED'>uppercase</DIV>",
  "<div style='color:🎉;background:linear-gradient(💥)'>emoji</div>",
];

function assertInvariants(html: string) {
  // 1. Nothing throws.
  expect(() => analyzeEmail(html)).not.toThrow();
  expect(() => transformForAllClients(html)).not.toThrow();
  expect(() => checkOverflow(html)).not.toThrow();
  expect(() => checkVisual(html)).not.toThrow();

  let report: ReturnType<typeof auditEmail>;
  expect(() => { report = auditEmail(html); }).not.toThrow();
  report = auditEmail(html);

  // 2. The report is complete.
  for (const section of [
    "compatibility", "spam", "links", "accessibility", "images",
    "inboxPreview", "size", "templateVariables", "overflow", "visual",
  ] as const) {
    expect(report).toHaveProperty(section);
  }

  // 3. Every issue/warning is well-formed.
  const buckets: unknown[] = [
    report.compatibility.warnings,
    report.overflow.issues,
    report.visual.issues,
    report.size.issues,
    report.accessibility.issues,
    report.images.issues,
    report.templateVariables.issues,
  ];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const issue of bucket as Array<{ severity?: string; message?: string }>) {
      expect(["error", "warning", "info"]).toContain(issue.severity);
      expect(typeof issue.message).toBe("string");
      expect((issue.message ?? "").length).toBeGreaterThan(0);
    }
  }

  // 4. transformForAllClients covers every client and returns string HTML.
  const results = transformForAllClients(html);
  expect(results.length).toBe(EMAIL_CLIENTS.length);
  for (const r of results) expect(typeof r.html).toBe("string");
}

describe("fuzz / property invariants", () => {
  test("300 generated emails never break any analyzer", () => {
    const rng = makeRng(1337);
    for (let i = 0; i < 300; i++) assertInvariants(generateEmail(rng));
  }, 30000);

  test("adversarial and malformed inputs are handled gracefully", () => {
    for (const html of ADVERSARIAL) assertInvariants(html);
  }, 30000);
});
