import { describe, test, expect } from "bun:test";
import { checkOverflow, auditEmail, createSession } from "../index";

const rules = (html: string) => checkOverflow(html).issues.map((i) => i.rule);

describe("checkOverflow — fixed widths", () => {
  test("flags a fixed width wider than the email frame", () => {
    expect(rules(`<table width="700"><tr><td>x</td></tr></table>`)).toContain("fixed-width-overflow");
    expect(rules(`<div style="width: 720px">x</div>`)).toContain("fixed-width-overflow");
  });

  test("allows a width at or under the frame", () => {
    expect(rules(`<table width="600"><tr><td>x</td></tr></table>`)).toEqual([]);
    expect(rules(`<div style="width: 480px">x</div>`)).toEqual([]);
  });

  test("ignores a wide element that is fluid (width/max-width 100%)", () => {
    expect(rules(`<img width="800" style="max-width:100%">`)).toEqual([]);
    expect(rules(`<div style="width: 100%">x</div>`)).toEqual([]);
  });

  test("ignores percentage widths", () => {
    expect(rules(`<table width="100%"><tr><td>x</td></tr></table>`)).toEqual([]);
  });
});

describe("checkOverflow — fixed widths in <style> blocks", () => {
  test("flags an over-wide width declared in a <style> rule", () => {
    expect(rules(`<style>.w{width:900px}</style><div class="w">x</div>`)).toContain("fixed-width-overflow");
  });

  test("respects a fluid escape in the same rule", () => {
    expect(rules(`<style>.w{width:900px;max-width:100%}</style><div class="w">x</div>`)).toEqual([]);
  });
});

describe("checkOverflow — unbreakable strings", () => {
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

describe("checkOverflow — integration", () => {
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
