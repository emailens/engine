import { describe, test, expect } from "bun:test";
import { checkOverflow, auditEmail, createSession } from "../index";

const rules = (html: string) => checkOverflow(html).issues.map((i) => i.rule);

describe("checkOverflow: fixed widths", () => {
  test("flags a fixed width wider than the email frame", () => {
    expect(rules(`<table width="700"><tr><td>x</td></tr></table>`)).toContain("fixed-width-overflow");
    expect(rules(`<div style="width: 720px">x</div>`)).toContain("fixed-width-overflow");
  });

  test("allows a width at or under the frame", () => {
    // Scoped to the rule under test. These fragments carry no @media block, so
    // they now also report `no-responsive-rules`, which is a different and
    // correct finding: a fixed 600px email with no breakpoint is not
    // responsive, whether or not it overflows.
    expect(rules(`<table width="600"><tr><td>x</td></tr></table>`))
      .not.toContain("fixed-width-overflow");
    expect(rules(`<div style="width: 480px">x</div>`))
      .not.toContain("fixed-width-overflow");
  });

  test("ignores a wide element that is fluid (width/max-width 100%)", () => {
    expect(rules(`<img width="800" style="max-width:100%">`)).toEqual([]);
    expect(rules(`<div style="width: 100%">x</div>`)).toEqual([]);
  });

  test("ignores percentage widths", () => {
    expect(rules(`<table width="100%"><tr><td>x</td></tr></table>`)).toEqual([]);
  });
});

describe("checkOverflow: fixed widths in <style> blocks", () => {
  test("flags an over-wide width declared in a <style> rule", () => {
    expect(rules(`<style>.w{width:900px}</style><div class="w">x</div>`)).toContain("fixed-width-overflow");
  });

  test("respects a fluid escape in the same rule", () => {
    expect(rules(`<style>.w{width:900px;max-width:100%}</style><div class="w">x</div>`)).toEqual([]);
  });
});

describe("checkOverflow: unbreakable strings", () => {
  test("flags a long unbroken string in visible text", () => {
    expect(rules(`<p>Visit https://example.com/very/long/tracking/aaaaaaaaaaaaaaaaaaaaaaaa now</p>`))
      .toContain("unbreakable-string");
  });

  test("allows normal wrapping text", () => {
    expect(rules(`<p>these are perfectly normal short words that wrap fine</p>`)).toEqual([]);
  });

  test("skips the check when the email already opts into wrapping", () => {
    const html = `<div style="overflow-wrap:anywhere"><p>https://example.com/very/long/aaaaaaaaaaaaaaaaaaaaaaaaaaaa</p></div>`;
    expect(rules(html)).toEqual([]);
  });

  test("does not flag long strings hidden in attributes (data URIs)", () => {
    const dataUri = "data:image/png;base64," + "A".repeat(200);
    expect(rules(`<img src="${dataUri}" width="100">`)).toEqual([]);
  });
});

describe("checkOverflow: integration", () => {
  test("blank input is clean", () => {
    const r = checkOverflow("");
    expect(r.hasOverflow).toBe(false);
    expect(r.issues).toEqual([]);
  });

  test("auditEmail includes the overflow report", () => {
    const report = auditEmail(`<table width="900"><tr><td>x</td></tr></table>`);
    expect(report.overflow.hasOverflow).toBe(true);
    expect(report.overflow.issues[0].rule).toBe("fixed-width-overflow");
  });

  test("audit skip:['overflow'] short-circuits", () => {
    const report = auditEmail(`<table width="900"><tr><td>x</td></tr></table>`, { skip: ["overflow"] });
    expect(report.overflow.hasOverflow).toBe(false);
  });

  test("session.checkOverflow shares the DOM", () => {
    const s = createSession(`<div style="width: 999px">x</div>`);
    expect(s.checkOverflow().hasOverflow).toBe(true);
  });
});

describe("checkOverflow: an email with no responsive rules at all", () => {
  const rule = (html: string) =>
    checkOverflow(html).issues.some((i) => i.rule === "no-responsive-rules");

  // Observed on one of our own templates: Outlook Android stretched a fixed
  // 600px table to fill the viewport while the hero image, correctly written
  // as width:100% with max-width:600px, held at 600 and left grey gutters.
  // The markup was textbook. The missing breakpoint was the fault, and every
  // other check passed the file clean.
  test("flags a fixed-width layout with no @media block", () => {
    expect(rule(`<table width="600"><tr><td>x</td></tr></table>`)).toBe(true);
    expect(rule(`<div style="width:600px">x</div>`)).toBe(true);
  });

  test("accepts a fluid container, which needs no breakpoint to survive", () => {
    expect(rule(`<table width="100%" style="max-width:600px"><tr><td>x</td></tr></table>`)).toBe(false);
    expect(rule(`<div style="width:100%; max-width:600px">x</div>`)).toBe(false);
  });

  test("accepts any email that has responsive rules", () => {
    expect(rule(`<style>@media (max-width:600px){.c{width:100%}}</style>
      <table width="600"><tr><td>x</td></tr></table>`)).toBe(false);
  });

  test("ignores fixed widths too small to be the layout", () => {
    // Spacer cells and narrow columns are fixed deliberately and say nothing
    // about whether the design copes with a phone.
    expect(rule(`<table><tr><td width="20">&nbsp;</td><td width="140">x</td></tr></table>`)).toBe(false);
  });

  test("names the widest offender, and points at it", () => {
    const issue = checkOverflow(
      `<table width="600"><tr><td width="380">x</td></tr></table>`,
      { positions: true },
    ).issues.find((i) => i.rule === "no-responsive-rules");
    expect(issue?.message).toContain("600px");
    expect(issue?.loc).toBeDefined();
  });

  test("says nothing about an email with no fixed widths at all", () => {
    expect(rule(`<div><p>plain text email</p></div>`)).toBe(false);
  });
});
