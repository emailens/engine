import { describe, test, expect } from "bun:test";
import { checkVisual, auditEmail, createSession } from "../index";

const rules = (html: string) => checkVisual(html).issues.map((i) => i.rule);
const first = (html: string, rule: string) =>
  checkVisual(html).issues.find((i) => i.rule === rule);

describe("checkVisual — background fallback", () => {
  test("flags a gradient with no background-color, fix uses the first stop", () => {
    const html = `<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">x</div>`;
    expect(rules(html)).toContain("missing-background-fallback");
    expect(first(html, "missing-background-fallback")?.fix).toBe("background-color: #667eea;");
  });

  test("flags a url() background image with no fallback", () => {
    expect(rules(`<div style="background-image: url(hero.png)">x</div>`)).toContain("missing-background-fallback");
  });

  test("flags gradients whose stops use rgb()/rgba()/hsl() (nested parens)", () => {
    expect(rules(`<div style="background: linear-gradient(90deg, rgb(255,0,0), blue)">x</div>`)).toContain("missing-background-fallback");
    expect(rules(`<div style="background: linear-gradient(90deg, rgba(255,0,0,.5), #000)">x</div>`)).toContain("missing-background-fallback");
    expect(rules(`<div style="background: radial-gradient(hsl(200,50%,50%), #012)">x</div>`)).toContain("missing-background-fallback");
  });

  test("still recognises a solid colour beside a gradient with nested parens", () => {
    expect(rules(`<div style="background: #123 linear-gradient(90deg, rgb(255,0,0), blue)">x</div>`)).toEqual([]);
  });

  test("allows a gradient/image that has a solid fallback", () => {
    expect(rules(`<div style="background-image: url(hero.png); background-color: #223">x</div>`)).toEqual([]);
    expect(rules(`<div style="background: #667eea linear-gradient(135deg,#667eea,#764ba2)">x</div>`)).toEqual([]);
  });

  test("does not flag a plain solid background", () => {
    expect(rules(`<div style="background-color: #223">x</div>`)).toEqual([]);
  });
});

describe("checkVisual — font fallback", () => {
  test("flags a custom font with no web-safe fallback and appends one", () => {
    const html = `<p style="font-family: Poppins">x</p>`;
    expect(rules(html)).toContain("missing-font-fallback");
    expect(first(html, "missing-font-fallback")?.fix).toBe("font-family: Poppins, Arial, sans-serif;");
  });

  test("flags a stack of only custom fonts", () => {
    expect(rules(`<p style="font-family: Poppins, Montserrat">x</p>`)).toContain("missing-font-fallback");
  });

  test("allows a stack ending in a generic or containing a web-safe font", () => {
    expect(rules(`<p style="font-family: Poppins, sans-serif">x</p>`)).toEqual([]);
    expect(rules(`<p style="font-family: Poppins, Arial">x</p>`)).toEqual([]);
    expect(rules(`<p style="font-family: Georgia">x</p>`)).toEqual([]);
  });

  test("ignores CSS-wide keywords", () => {
    expect(rules(`<p style="font-family: inherit">x</p>`)).toEqual([]);
  });
});

describe("checkVisual — <style> blocks", () => {
  test("flags a gradient / font declared in a <style> rule", () => {
    expect(rules(`<style>.h{background:linear-gradient(90deg,#f00,#00f)}</style><div class="h">x</div>`)).toContain("missing-background-fallback");
    expect(rules(`<style>.t{font-family:Poppins}</style><p class="t">x</p>`)).toContain("missing-font-fallback");
  });

  test("scans rules nested inside @media", () => {
    expect(rules(`<style>@media (max-width:600px){.h{background:linear-gradient(90deg,#f00,#00f)}}</style><div class="h">x</div>`))
      .toContain("missing-background-fallback");
  });

  test("respects a solid fallback declared in the same rule", () => {
    expect(rules(`<style>.h{background-color:#123;background-image:url(x.png)}</style><div class="h">x</div>`)).toEqual([]);
  });
});

describe("checkVisual — integration", () => {
  test("blank input is clean", () => {
    expect(checkVisual("").issues).toEqual([]);
  });

  test("auditEmail includes the visual report; skip short-circuits", () => {
    const html = `<div style="background: linear-gradient(135deg,#667eea,#764ba2)">x</div>`;
    expect(auditEmail(html).visual.issues.length).toBeGreaterThan(0);
    expect(auditEmail(html, { skip: ["visual"] }).visual.issues).toEqual([]);
  });

  test("session.checkVisual shares the DOM", () => {
    const s = createSession(`<p style="font-family: Poppins">x</p>`);
    expect(s.checkVisual().issues[0].rule).toBe("missing-font-fallback");
  });
});
