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

  test("a declaration in a colour notation Word cannot parse is dropped whole (05 c12-c14)", () => {
    for (const colour of ["rgba(0,170,0,1)", "#00AA00FF", "#0A0F", "hsl(120,100%,33%)"]) {
      const out = tag(word(`<table><tr><td id="t" style="color:red;background-color:${colour}">x</td></tr></table>`), 'id="t"');
      expect(out).not.toContain("background");
      expect(out).toContain("color");
    }
    // A real campaign's divider: no border at all in Outlook, not a solid one.
    expect(tag(word(`<table id="t" style="border-top: solid 1px #66666650; font-size: 0"><tr><td>x</td></tr></table>`), 'id="t"')).not.toContain("border");
    // In a stylesheet the rule keeps its selector and its other declarations.
    const sheet = word(`<p class="a">x</p>`, `<style>.a{color:red;background:hsl(0,0%,50%)}.b{color:#112233}</style>`);
    expect(sheet).toMatch(/\.a\{color:\s*red;?\}/);
    expect(sheet).toContain("#112233");
  });

  test("a family declared with @font-face falls to Times New Roman, not to the next in the stack", () => {
    const face = `<style>@font-face{font-family:'Roboto';src:url(x.ttf)}.h{font-family:Roboto,Arial}</style>`;
    const out = word(
      `<h1 id="a" style="font-family: 'Roboto', Arial, sans-serif">x</h1><p id="b" style="font-family:'Nunito',Arial,sans-serif">x</p><p id="c" class="h">x</p>`,
      face,
    );
    expect(tag(out, 'id="a"')).toContain("Times New Roman");
    expect(tag(out, 'id="b"')).toContain("Nunito");
    expect(tag(out, 'id="c"')).toContain("Times New Roman");
  });

  test("an image is sized by bare-number attributes and nothing else (06 c04-c09, c21)", () => {
    const img = (attrs: string) => tag(word(`<img id="t" ${attrs} src="x.png">`), 'id="t"');
    // The attribute wins over CSS, percentage or not.
    expect(img('width="138" style="width:100%;height:auto"')).toMatch(/width:\s*138px/);
    expect(img('width="200" style="width:100px"')).toMatch(/width:\s*200px/);
    // Both attributes: both apply, and height:auto does not undo the height.
    const both = img('width="200" height="100" style="height:auto"');
    expect(both).toMatch(/width:\s*200px/);
    expect(both).toMatch(/height:\s*100px/);
    // No usable attribute: natural size, whatever the CSS or the attribute said.
    for (const attrs of ['style="width:100px"', 'style="width:50%"', 'width="200px"', 'width="100%"']) {
      expect(img(attrs)).toContain("width: auto!important");
      expect(img(attrs)).not.toMatch(/100px|50%|200px|100%/);
    }
  });

  test("an image draws no padding, margin, border or spacing of its own (06 c16-c20)", () => {
    const out = tag(
      word(`<img id="t" width="100" height="50" hspace="20" vspace="10" border="10" style="padding:10px;margin:10px;border:10px solid #0a0" src="x.png">`),
      'id="t"',
    );
    expect(out).not.toMatch(/padding|margin|hspace|vspace|solid/);
    expect(out).toContain('border="0"');
  });

  test("SVG and WebP are left blank, and picture falls back to its img (06 c24, c25, c27)", () => {
    expect(tag(word(`<img id="t" width="10" height="10" src="a.svg">`), 'id="t"')).toContain("visibility: hidden");
    expect(tag(word(`<img id="t" width="10" height="10" src="a.webp?x=1">`), 'id="t"')).toContain("visibility: hidden");
    expect(tag(word(`<img id="t" width="10" height="10" src="a.png">`), 'id="t"')).not.toContain("visibility");
    expect(word(`<picture><source srcset="a.webp" type="image/webp"><img src="a.png"></picture>`)).not.toContain("<source");
  });

  test("a VML shape is translated whatever prefix the email binds to the namespace", () => {
    const out = word(
      `<!--[if mso]><a:roundrect xmlns:a="urn:schemas-microsoft-com:vml" href="https://example.com/" fillcolor="#171717" arcsize="21%" style="width:103.5pt;height:36pt" stroke="f"><center>Go</center></a:roundrect><![endif]-->`,
    );
    expect(out).toContain('data-vml="roundrect"');
    // Points, VML's own unit, convert at 4/3.
    expect(out).toContain("width:138px;height:48px");
    expect(out).toContain("#171717");
  });

  test("a div holding only a non-breaking space keeps its background (02 c27)", () => {
    expect(tag(word(`<div id="t" style="background-color:#FF8800">&nbsp;</div>`), 'id="t"')).toContain("background");
  });

  test("a line-height below the font's own height is raised to it, unless the rule is exactly (02 c27; 04 c08)", () => {
    expect(tag(word(`<div id="t" style="font-size:30px;line-height:30px">x</div>`), 'id="t"')).toMatch(/line-height:\s*35px/);
    expect(tag(word(`<div id="t" style="font-size:16px;line-height:24px">x</div>`), 'id="t"')).toMatch(/line-height:\s*24px/);
    expect(
      tag(word(`<div id="t" style="font-size:30px;line-height:30px;mso-line-height-rule:exactly">x</div>`), 'id="t"'),
    ).toMatch(/line-height:\s*30px/);
  });

  test("mso-line-height-alt replaces the line-height", () => {
    const out = tag(word(`<div id="t" style="font-size:16px;line-height:1.50;mso-line-height-alt:1.5em">x</div>`), 'id="t"');
    expect(out).toMatch(/line-height:\s*1.5em/);
  });

  test("text-align:centre on a div centres a table inside it (03 c17)", () => {
    expect(tag(word(`<div id="t" style="text-align:center">${TABLE}</div>`), 'id="t"')).toContain('align="center"');
  });

  test("a width attribute written with px is not read (02 c06)", () => {
    expect(tag(word(`<table id="t" width="300px"><tr><td>x</td></tr></table>`), 'id="t"')).not.toContain("width");
    expect(tag(word(`<table id="t" width="300"><tr><td>x</td></tr></table>`), 'id="t"')).toContain('width="300"');
  });

  test("a table floated with align keeps a gutter unless the email removes it (03 c02)", () => {
    expect(tag(word(`<table id="t" align="left"><tr><td>x</td></tr></table>`), 'id="t"')).toMatch(/margin-left:\s*3.5px/);
    expect(
      tag(word(`<table id="t" align="left" style="mso-table-lspace:0pt;mso-table-rspace:0pt"><tr><td>x</td></tr></table>`), 'id="t"'),
    ).not.toContain("margin");
  });

  test("rgb() and 3-digit hex are read; a negative margin does not move a table (09 c30, c32, c33)", () => {
    for (const colour of ["rgb(0,170,0)", "#0A0"]) {
      expect(tag(word(`<table><tr><td id="t" style="background-color:${colour}">x</td></tr></table>`), 'id="t"')).toContain("background");
    }
    expect(tag(word(`<table id="t" style="margin-left:-20px"><tr><td>x</td></tr></table>`), 'id="t"')).toMatch(/margin-left:\s*0/);
  });

  test("a right-to-left table sits on the right (03 c21)", () => {
    expect(tag(word(`<table id="t" dir="rtl"><tr><td>x</td></tr></table>`), 'id="t"')).toMatch(/margin-left:\s*auto/);
  });

  test("a var() declaration is dropped, so the inline colour it would override stays (07 c13)", () => {
    const out = word(
      `<table id="t" class="v" style="background-color:#FF8800"><tr><td>x</td></tr></table>`,
      `<style>.v{--k:#00AA00;background-color:var(--k) !important}</style>`,
    );
    expect(tag(out, 'id="t"')).toContain("#FF8800");
    expect(out).not.toContain("var(");
    expect(tag(out, 'id="t"')).not.toMatch(/#00AA00|rgb\(0,\s*170,\s*0\)/i);
  });

  test("display:none hides neither a div nor a table, inline or by class (07 c19; 09 c23-c25)", () => {
    const out = word(
      `<div id="a" class="h">text</div><div id="b" style="display:none">text</div><table id="c" style="display:none"><tr><td>x</td></tr></table>`,
      `<style>.h{display:none !important}</style>`,
    );
    expect(tag(out, 'id="a"')).toContain("display:block!important");
    expect(tag(out, 'id="b"')).not.toMatch(/display:\s*none/);
    expect(tag(out, 'id="c"')).not.toMatch(/display:\s*none/);
    // With mso-hide:all the block is hidden, as before.
    expect(tag(word(`<div id="d" style="display:none;mso-hide:all">text</div>`), 'id="d"')).toContain("display:none");
  });

  test("a hidden cell or row stays hidden, but a table inside it is drawn (09 c21, c22)", () => {
    const cell = word(`<table><tr><td id="c" style="display:none"><img id="i" src="x.png">${TABLE}</td></tr></table>`);
    expect(tag(cell, 'id="c"')).not.toMatch(/display:\s*none/);
    expect(tag(cell, 'id="i"')).toMatch(/display:\s*none/);
    // No table inside: the cell is simply hidden.
    expect(tag(word(`<table><tr><td id="c" style="display:none">text</td></tr></table>`), 'id="c"')).toMatch(/display:\s*none/);
    // A hidden span is hidden (09 c26).
    expect(tag(word(`<p>a<span id="s" style="display:none">b</span>c</p>`), 'id="s"')).toMatch(/display:\s*none/);
    const row = word(`<table><tr id="r" style="display:none"><td id="c">${TABLE}</td></tr></table>`);
    expect(tag(row, 'id="r"')).not.toMatch(/display:\s*none/);
  });

  test("a div of nothing but invisible characters becomes one blank line; one with text is left alone", () => {
    const run = "&zwnj;&nbsp;".repeat(60);
    const out = word(`<div id="t" style="display:none">${run}</div><div id="u">sssssssssssssssssssssssss</div>`);
    expect(out).not.toContain("&zwnj;");
    expect(out).toContain("sssssssssssssssssssssssss");
  });

  test("a list has no space above and one line below, whatever its margin (09 c16, c17, c20)", () => {
    const plain = tag(word(`<p>x</p><ul id="t" style="margin:0;padding:0"><li>a</li></ul>`), 'id="t"');
    expect(plain).toMatch(/margin-top:\s*0/);
    expect(plain).toMatch(/margin-bottom:\s*18px/);
    expect(plain).not.toContain("margin-left");
    const bare = tag(word(`<ul id="t"><li>a</li></ul>`), 'id="t"');
    expect(bare).toMatch(/margin-left:\s*24px/);
    expect(tag(word(`<div>x<br><ul id="t"><li>a</li></ul></div>`), 'id="t"')).toMatch(/margin-top:\s*1lh/);
  });

  test("no other client is touched", () => {
    const out = gmail(`<div id="t" style="padding:20px;width:200px;margin:0 auto">text</div>`);
    expect(tag(out, 'id="t"')).toContain("padding");
    expect(tag(out, 'id="t"')).toContain("width");
    expect(out).not.toContain("p,h2{margin:0}");
  });
});
