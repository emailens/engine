import { describe, expect, test } from "bun:test";
import { transformForClient } from "../index";

/**
 * Each expectation here is a measurement, not a belief. The source is the
 * Emailens probe sheets rendered on real Outlook 2007, 2010, 2013, 2016 and
 * 2019 on 2026-10-13; the case id in each test name points at the row.
 */
const word = (body: string, head = "") =>
  transformForClient(`<html><head>${head}</head><body>${body}</body></html>`, "outlook-windows-legacy").html;
const gmail = (body: string) =>
  transformForClient(`<html><head></head><body>${body}</body></html>`, "gmail-web").html;
/** The opening tag that carries `marker`. */
const tag = (html: string, marker: string) => new RegExp(`<[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? "";
const TABLE = "<table><tr><td>x</td></tr></table>";

describe("Word box model", () => {
  test("padding does nothing on div, p, span and a (01 c01-c08)", () => {
    for (const el of ["div", "p", "span", "a"]) {
      const out = word(`<${el} id="t" style="padding:20px;color:red">text</${el}>`);
      expect(tag(out, 'id="t"')).not.toContain("padding");
      expect(tag(out, 'id="t"')).toContain("color");
    }
  });

  test("padding on a table cell is kept (01 c09)", () => {
    expect(tag(word(`<table><tr><td id="t" style="padding:20px">x</td></tr></table>`), 'id="t"')).toContain(
      "padding",
    );
  });

  test("mso-padding-alt replaces the cell's padding (01 c11)", () => {
    const out = tag(word(`<table><tr><td id="t" style="padding:20px;mso-padding-alt:5px">x</td></tr></table>`), 'id="t"');
    expect(out).toMatch(/padding:\s*5px/);
    expect(out).not.toMatch(/padding:\s*20px/);
  });

  test("width and height do nothing on a div (01 c23, c24)", () => {
    const out = tag(word(`<div id="t" style="width:200px;height:60px;color:red">text</div>`), 'id="t"');
    expect(out).not.toMatch(/width|height/);
  });

  test("a table keeps its width", () => {
    expect(tag(word(`<table id="t" style="width:200px"><tr><td>x</td></tr></table>`), 'id="t"')).toContain("width");
  });

  test("margin auto does not centre a div, and a negative margin does not pull it up (01 c17, c19, c20)", () => {
    expect(tag(word(`<div id="t" style="margin:0 auto">text</div>`), 'id="t"')).toMatch(/margin:\s*0 0/);
    expect(tag(word(`<div id="t" style="margin-top:-10px">text</div>`), 'id="t"')).toMatch(/margin-top:\s*0/);
  });

  test("a margin given in lengths is kept on a div (01 c12)", () => {
    expect(tag(word(`<div id="t" style="margin:20px">text</div>`), 'id="t"')).toMatch(/margin:\s*20px/);
  });

  test("a div that only wraps other elements paints no background (01 c01)", () => {
    expect(tag(word(`<div id="t" style="background-color:#FF8800">${TABLE}</div>`), 'id="t"')).not.toContain(
      "background",
    );
  });

  test("a div or paragraph with text of its own keeps its background (01 c04)", () => {
    expect(tag(word(`<div id="t" style="background-color:#FF8800">words</div>`), 'id="t"')).toContain("background");
    expect(tag(word(`<p id="t" style="background-color:#FF8800">words</p>`), 'id="t"')).toContain("background");
  });

  test("a border wider than 8px is drawn at 8px (01 c21, c22)", () => {
    expect(tag(word(`<div id="t" style="border:10px solid #000">text</div>`), 'id="t"')).toMatch(/border:\s*8px/);
    expect(tag(word(`<div id="t" style="border:2px solid #000">text</div>`), 'id="t"')).toMatch(/border:\s*2px/);
  });

  test("a paragraph and an h2 get no default margin, and an authored one still wins (01 c14, c15)", () => {
    const out = word(`<p>a</p>`, `<style>p{margin:12px}</style>`);
    expect(out).toContain("p,h2{margin:0}");
    // The reset comes first, so the email's own rule overrides it.
    expect(out.indexOf("p,h2{margin:0}")).toBeLessThan(out.indexOf("p{margin:12px}"));
  });

  test("the same rules reach declarations delivered by a class", () => {
    const out = word(
      `<div id="pad" class="card">text</div><div id="wrap" class="bg">${TABLE}</div><table id="tb" class="bg"><tr><td>x</td></tr></table>`,
      `<style>.card{padding:24px}.bg{background-color:#FF8800}</style>`,
    );
    expect(tag(out, 'id="pad"')).toContain("padding:0!important");
    expect(tag(out, 'id="wrap"')).toContain("background:none!important");
    // A table does paint a class background (07 c02), so it is left alone.
    expect(tag(out, 'id="tb"')).not.toContain("background:none");
  });

  test("a rule inside @media is not carried over: Word never reads it (07 c20-c24)", () => {
    const out = word(`<div id="t" class="card">text</div>`, `<style>@media screen{.card{padding:24px}}</style>`);
    expect(tag(out, 'id="t"')).not.toContain("padding:0!important");
  });

  test("no other client is touched", () => {
    const out = gmail(`<div id="t" style="padding:20px;width:200px;margin:0 auto">text</div>`);
    expect(tag(out, 'id="t"')).toContain("padding");
    expect(tag(out, 'id="t"')).toContain("width");
    expect(out).not.toContain("p,h2{margin:0}");
  });
});
