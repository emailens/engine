import { describe, expect, test } from "bun:test";
import { CSS_SUPPORT, CSS_SUPPORT_NOTES, transformForClient } from "../index";

/**
 * Each expectation is what a real client showed on 2026-10-14, when the
 * Emailens probe sheets (one feature per row) were screenshotted in 40+ real
 * clients. Where caniemail disagreed, the screenshot wins; see
 * scripts/observed-overrides.ts.
 */
const run = (clientId: string, body: string, head = "") =>
  transformForClient(`<html><head>${head}</head><body>${body}</body></html>`, clientId).html;
const tag = (html: string, marker: string) => new RegExp(`<[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? "";
const ANIMATION = `<style>@keyframes ok{from{background:red}to{background:green}} .anim{animation:ok .01s forwards}</style>`;

// The 2026-10-14 Gmail web rows were dropped on 2026-10-24: caniemail's own
// tests were stripped of this CSS by real Gmail web in Chrome and Firefox.
describe("Gmail webmail follows caniemail again", () => {
  test("box-shadow is stripped and animation dropped", () => {
    const out = run("gmail-web", `<div id="a" style="box-shadow:6px 6px 0 #d33"></div><div class="anim" id="t">x</div>`, ANIMATION);
    expect(tag(out, 'id="a"')).not.toContain("box-shadow");
    expect(out).not.toMatch(/animation\s*:/);
  });

  test("no Gmail web cell carries an observation", () => {
    for (const key of ["box-shadow", "text-shadow", "visibility", "align-items", "animation", "gap", "display:grid"]) {
      expect(CSS_SUPPORT_NOTES[key]?.["gmail-web"]?.[0] ?? "").not.toStartWith("Observed");
    }
    expect(CSS_SUPPORT["box-shadow"]["gmail-web"]).toBe("unsupported");
  });
});

describe("Yahoo Mail webmail draws box-shadow", () => {
  test("kept on yahoo-mail, still stripped on the apps", () => {
    const html = `<div id="t" style="box-shadow:6px 6px 0 #d33"></div>`;
    expect(tag(run("yahoo-mail", html), 'id="t"')).toContain("box-shadow");
    expect(tag(run("yahoo-mail-ios", html), 'id="t"')).not.toContain("box-shadow");
    expect(CSS_SUPPORT["box-shadow"]["yahoo-mail"]).toBe("supported");
  });
});

describe("Outlook.com, Microsoft 365 and Word do not run animations", () => {
  for (const clientId of ["outlook-web", "outlook-windows", "outlook-windows-legacy"]) {
    test(`${clientId} drops @keyframes and animation from <style>`, () => {
      const out = run(clientId, `<div class="anim" id="t">x</div>`, ANIMATION);
      expect(out).not.toMatch(/keyframes/);
      expect(out).not.toMatch(/animation\s*:/);
    });
  }

  test("Outlook.com draws text-shadow", () => {
    expect(CSS_SUPPORT["text-shadow"]["outlook-web"]).toBe("supported");
  });
});

describe("a text-decoration with a style or colour is ignored whole", () => {
  for (const clientId of ["apple-mail-macos", "apple-mail-ios", "outlook-macos", "outlook-windows-legacy"]) {
    test(`${clientId} drops "underline wavy #d33", inline and in <style>`, () => {
      const out = run(
        clientId,
        `<span id="i" style="text-decoration:underline wavy #d33;color:red">a</span><span class="w">b</span>`,
        `<style>.w{text-decoration:underline wavy #d33;color:blue}</style>`,
      );
      expect(tag(out, 'id="i"')).not.toContain("text-decoration");
      expect(tag(out, 'id="i"')).toMatch(/color:\s*red/);
      expect(out).not.toContain("wavy");
    });

    test(`${clientId} keeps a plain line value`, () => {
      const out = run(clientId, `<a id="t" href="#" style="text-decoration:underline">a</a>`);
      expect(tag(out, 'id="t"')).toMatch(/text-decoration:\s*underline/);
    });
  }

  test("Gmail webmail draws the wave and is left alone", () => {
    const out = run("gmail-web", `<span id="t" style="text-decoration:underline wavy #d33">a</span>`);
    expect(tag(out, 'id="t"')).toContain("wavy");
  });

  test("the WebKit clients read partial, with the observation", () => {
    for (const clientId of ["apple-mail-macos", "apple-mail-ios", "outlook-macos"]) {
      expect(CSS_SUPPORT["text-decoration"][clientId]).toBe("partial");
    }
  });
});

describe("Word keeps padding inside a border", () => {
  test("a bordered div keeps its padding; a bare one still loses it", () => {
    const out = run(
      "outlook-windows-legacy",
      `<div id="b" style="padding:20px;border:2px solid #8a7544">padded</div><div id="n" style="padding:20px">bare</div>`,
    );
    expect(tag(out, 'id="b"')).toMatch(/padding:\s*20px/);
    expect(tag(out, 'id="n"')).not.toContain("padding");
  });

  test("border:none does not count as a border", () => {
    const out = run("outlook-windows-legacy", `<div id="t" style="padding:20px;border:none">x</div>`);
    expect(tag(out, 'id="t"')).not.toContain("padding");
  });
});
