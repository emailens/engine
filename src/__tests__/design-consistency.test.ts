import { describe, test, expect } from "bun:test";
import { checkDesignConsistency, colorDistance, parseColor, auditEmail } from "../index";

const doc = (body: string, head = "") =>
  `<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;

const rules = (html: string) => checkDesignConsistency(html).issues.map((i) => i.rule);
const drift = (html: string) =>
  checkDesignConsistency(html).issues.filter((i) => i.rule === "colour-drift");

// ============================================================================
// Colour drift , the flagship rule
// ============================================================================

describe("design consistency , colour drift", () => {
  test("two near-identical greys are reported as one colour spelled twice", () => {
    const html = doc(
      `<div style="color:#333333">A</div><div style="color:#343434">B</div>`,
    );
    const issues = drift(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].values).toHaveLength(2);
  });

  test("the same colour spelled different ways is NOT drift", () => {
    // #fff, #FFFFFF and white are one colour, not three.
    const html = doc(
      `<div style="color:#fff">A</div><div style="color:#FFFFFF">B</div><div style="color:white">C</div>`,
    );
    expect(drift(html)).toHaveLength(0);
  });

  test("genuinely different colours are left alone", () => {
    const html = doc(
      `<div style="color:#111111">A</div><div style="color:#c49a6c">B</div><div style="color:#2b6cb0">C</div>`,
    );
    expect(drift(html)).toHaveLength(0);
  });

  test("drift is found across inline styles and <style> rules together", () => {
    const html = doc(
      `<div style="color:#1a1714">A</div><div class="b">B</div>`,
      `<style>.b{color:#141519}</style>`,
    );
    expect(drift(html)).toHaveLength(1);
  });

  test("text and background colours drift against each other", () => {
    const html = doc(
      `<div style="color:#f0ece4">A</div><div style="background-color:#f4f2ed">B</div>`,
    );
    expect(drift(html)).toHaveLength(1);
  });

  test("more than two near-identical colours collapse into one cluster", () => {
    const html = doc(
      `<div style="color:#f0ece4">A</div><div style="color:#eae6de">B</div><div style="color:#f4f2ed">C</div>`,
    );
    const issues = drift(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].values).toHaveLength(3);
  });

  test("transparent and keyword values are not colours", () => {
    const html = doc(
      `<div style="color:inherit">A</div><div style="background:transparent">B</div><div style="color:currentColor">C</div>`,
    );
    expect(drift(html)).toHaveLength(0);
  });
});

// ============================================================================
// Cardinality , when a property stops being a system
// ============================================================================

describe("design consistency , runaway cardinality", () => {
  test("a tight type scale is silent", () => {
    const sizes = [12, 14, 16, 20, 24].map((s) => `<p style="font-size:${s}px">x</p>`).join("");
    expect(rules(doc(sizes))).not.toContain("too-many-values");
  });

  test("nine font sizes is reported", () => {
    const sizes = [10, 11, 12, 13, 14, 15, 16, 26, 32]
      .map((s) => `<p style="font-size:${s}px">x</p>`)
      .join("");
    expect(rules(doc(sizes))).toContain("too-many-values");
  });

  test("a border-radius shorthand is a shape, not several radii", () => {
    // One 12px system used on a card top and its footer.
    const html = doc(
      `<div style="border-radius:12px 12px 0 0">A</div>
       <div style="border-radius:0 0 12px 12px">B</div>
       <div style="border-radius:12px">C</div>`,
    );
    expect(checkDesignConsistency(html).palette.radii).toEqual(["12px"]);
    expect(rules(html)).not.toContain("too-many-values");
  });

  test("a circular avatar is a shape, not a corner size", () => {
    const html = doc(
      `<img style="border-radius:50%"><div style="border-radius:8px">A</div>
       <div style="border-radius:9999px">pill</div>`,
    );
    expect(checkDesignConsistency(html).palette.radii).toEqual(["8px"]);
  });

  test("four genuinely different corner sizes are reported", () => {
    const html = doc(
      `<div style="border-radius:6px">A</div><div style="border-radius:8px">B</div>
       <div style="border-radius:16px">C</div><div style="border-radius:20px">D</div>`,
    );
    expect(rules(html)).toContain("too-many-values");
  });

  test("a stack and its bare first family are one typeface", () => {
    const html = doc(
      `<p style="font-family:'Inter', -apple-system, sans-serif">A</p>
       <p style="font-family:&quot;Inter&quot;">B</p>`,
    );
    expect(checkDesignConsistency(html).palette.fontFamilies).toHaveLength(1);
  });

  test("serif plus sans plus mono is three typefaces", () => {
    const html = doc(
      `<p style="font-family:Georgia, serif">A</p>
       <p style="font-family:'Inter', sans-serif">B</p>
       <p style="font-family:'SF Mono', monospace">C</p>`,
    );
    expect(rules(html)).toContain("too-many-values");
  });
});

// ============================================================================
// Wiring and the perceptual metric underneath
// ============================================================================

describe("design consistency , plumbing", () => {
  test("the palette reports what the email actually uses", () => {
    const report = checkDesignConsistency(
      doc(`<p style="color:#111111;font-size:14px;font-family:Arial,sans-serif">x</p>`),
    );
    expect(report.palette.colors).toHaveLength(1);
    expect(report.palette.fontSizes).toEqual(["14px"]);
    expect(report.palette.fontFamilies).toEqual(["Arial,sans-serif"]);
  });

  test("blank input is safe", () => {
    expect(checkDesignConsistency("").issues).toEqual([]);
  });

  test("an unparseable <style> block does not crash the check", () => {
    expect(() => checkDesignConsistency(doc(`<p>x</p>`, `<style>@@@ {{{</style>`))).not.toThrow();
  });

  test("auditEmail surfaces design, and `skip` turns it off", () => {
    const html = doc(`<div style="color:#333333">A</div><div style="color:#343434">B</div>`);
    expect(auditEmail(html).design.issues).toHaveLength(1);
    expect(auditEmail(html, { skip: ["design"] }).design.issues).toHaveLength(0);
  });

  test("OKLab distance separates identical-looking from clearly different", () => {
    const near = colorDistance(parseColor("#333333")!, parseColor("#343434")!);
    const far = colorDistance(parseColor("#333333")!, parseColor("#c49a6c")!);
    expect(near).toBeLessThan(0.02);
    expect(far).toBeGreaterThan(0.1);
  });
});
