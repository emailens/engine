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

  test("a React Email button keeps its padding: its spacer runs draw it (Neon, 2026-10-31)", () => {
    const out = word(`<a id="t" style="padding:12px 18px;mso-padding-alt:0px"><span><!--[if mso]><i style="mso-font-width:450%" hidden>  </i><![endif]--></span>Go</a>`);
    expect(tag(out, 'id="t"')).toMatch(/padding:\s*12px 18px/);
  });

  test("max-width holds on a table and nowhere else (probe outlook-max-width, 2026-10-31)", () => {
    expect(tag(word(`<table id="t" width="100%" style="max-width:37.5em"><tr><td>x</td></tr></table>`), 'id="t"')).toContain("max-width");
    expect(tag(word(`<div id="t" style="max-width:400px">x</div>`), 'id="t"')).not.toContain("max-width");
  });

  test("margin auto does not centre a table (probe outlook-table-centre, 2026-10-31)", () => {
    const out = tag(word(`<table id="t" width="400" style="margin:0 auto"><tr><td>x</td></tr></table>`), 'id="t"');
    expect(out).not.toContain("auto");
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

  test("a margin from a <style> rule holds on the last paragraph", () => {
    const out = word(`<div class="body"><p>a</p><p id="last">b</p></div>`, `<style>.body p{margin:0 0 16px}</style>`);
    expect(tag(out, 'id="last"')).not.toContain("margin-bottom");
  });

  test("a bordered link's fill stays behind its text", () => {
    const out = word(`<a id="a" href="#" style="padding:12px;border:1px solid #fff;background-color:#000">x</a>`);
    expect(tag(out, 'id="a"')).not.toContain("background");
    expect(out).toContain('<span style="background-color:#000">x</span>');
  });

  test("paragraphs with the same border draw as one block", () => {
    const rule = "padding:8px 0;border-bottom:1px solid #d00";
    const out = word(`<p id="a" style="${rule}">a</p><p id="b" style="${rule}">b</p><p id="c" style="padding:8px 0;border-bottom:1px solid #00d">c</p>`);
    expect(tag(out, 'id="a"')).not.toContain("border");
    expect(tag(out, 'id="b"')).toContain("border-bottom");
    expect(tag(out, 'id="c"')).toContain("border-bottom");
  });

  test("divs with the same border stay separate", () => {
    const rule = "padding:8px 0;border-bottom:1px solid #d00";
    expect(tag(word(`<div id="a" style="${rule}">a</div><div style="${rule}">b</div>`), 'id="a"')).toContain("border-bottom");
  });

  test("padding sits only against a border", () => {
    expect(tag(word(`<p id="a" style="padding:8px 0;border-bottom:1px solid #d00">a</p>`), 'id="a"')).toMatch(/padding-top:\s*0/);
    expect(tag(word(`<div id="a" style="padding:20px;border:2px solid #000">a</div>`), 'id="a"')).toContain("padding:20px");
  });

  test("a bordered link keeps its padding, a plain one loses it", () => {
    const bordered = tag(word(`<a id="a" href="#" style="padding:14px 20px;border:2px solid #800;display:block">x</a>`), 'id="a"');
    expect(bordered).toContain("data-word-box");
    expect(bordered).toMatch(/padding:\s*14px 20px/);
    expect(bordered).toContain("inline-block");
    expect(tag(word(`<a id="a" href="#" style="padding:14px 20px">x</a>`), 'id="a"')).not.toContain("padding");
  });

  test("a paragraph loses its margin only at the edge of its container", () => {
    const out = word(`<div><p id="a">a</p><p id="b">b</p><p id="c">c</p></div>`);
    expect(tag(out, 'id="a"')).toMatch(/margin-top:\s*0/);
    expect(tag(out, 'id="b"')).not.toContain("margin");
    expect(tag(out, 'id="c"')).toMatch(/margin-bottom:\s*0/);
    expect(word(`<h2>a</h2>`, `<style>h2{margin:12px}</style>`)).toContain("h2{margin:0}");
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

  // Current Outlook (Microsoft 365) drew foodpanda's 'Roboto', Arial in Arial (2026-10-28).
  test("a family declared with @font-face falls to the next in the stack, or Times with none", () => {
    const face = `<style>@font-face{font-family:'Roboto';src:url(x.ttf)}.h{font-family:Roboto,Arial}</style>`;
    const out = word(
      `<h1 id="a" style="font-family: 'Roboto', Arial, sans-serif">x</h1><p id="b" style="font-family:'Nunito',Arial,sans-serif">x</p><p id="c" class="h">x</p>`,
      face,
    );
    expect(tag(out, 'id="a"')).toMatch(/font-family:\s*Arial, sans-serif/);
    expect(tag(out, 'id="b"')).toContain("Nunito");
    expect(tag(out, 'id="c"')).toMatch(/font-family:\s*Arial/);
    const alone = word(`<p id="d" style="font-family:'Roboto'">x</p>`, face);
    expect(tag(alone, 'id="d"')).toContain("Aptos");
  });

  test("a family Office downloads draws even when the email declares it with @font-face", () => {
    // Run WSG7EFj4uHsB declares Nunito Sans in @media screen; the real Outlook
    // Classic capture draws its body copy in Nunito Sans, not Arial (2026-11-04).
    const face = `<style>@media screen{@font-face{font-family:'Nunito Sans';src:url(x.woff2)}}</style>`;
    const out = word(`<div id="a" style="font-family: 'Nunito Sans', Arial, sans-serif">x</div>`, face);
    expect(tag(out, 'id="a"')).toContain("Nunito Sans");
  });

  test("a rule that wins the family keeps a @font-face `*` rule from drawing Times (AI Fix real-device round, 2026-10-22)", () => {
    // React Email's <Font>, then the Outlook-only element rule a fix adds.
    const head =
      `<style>@font-face{font-family:'Inter';src:url(x.woff2)} * { font-family: 'Inter', Arial, sans-serif; }</style>` +
      `<!--[if mso]><style>td, p, a { font-family: Arial, sans-serif !important; }</style><![endif]-->`;
    const out = word(`<p id="p">x</p><a id="a" href="#">x</a><span id="s">x</span>`, head);
    expect(tag(out, 'id="p"')).not.toContain("Aptos");
    expect(tag(out, 'id="a"')).not.toContain("Aptos");
    // Nothing else names a family for a span: the face rule still wins there.
    expect(tag(out, 'id="s"')).toContain("Aptos");
  });

  test("a face's mso-font-alt is what Word draws for it (AI Fix real-device round, 2026-10-23)", () => {
    // React Email's <Font>: studio-abandoned-cart on a real Outlook 2016.
    const face = `<style>@font-face{font-family:'Geist';mso-font-alt:'Arial';src:url(x.woff2)}</style>`;
    const out = word(`<p id="p" style="font-family:Geist,Inter,Arial,sans-serif">x</p>`, face);
    expect(tag(out, 'id="p"')).toContain("'Arial'");
    expect(tag(out, 'id="p"')).not.toContain("Aptos");
  });

  test("system-ui names no font: Word takes the next family (probe outlook-font-stack, 2026-10-31)", () => {
    const face = `<style>@font-face{font-family:'Inter';mso-font-alt:'Arial';src:url(x.woff2)}</style>`;
    const faced = word(`<h1 id="h" style="font-family:Inter,system-ui,Arial,sans-serif">x</h1>`, face);
    expect(tag(faced, 'id="h"')).toContain("Arial");
    const bare = word(`<p id="p" style="font-family:ui-sans-serif, system-ui, sans-serif">x</p>`);
    expect(tag(bare, 'id="p"')).toContain("font-family: sans-serif");
    expect(tag(bare, 'id="p"')).not.toContain("system-ui");
  });

  test("Word ignores `*`: text only it gives a family is in Times, whatever the face's alt", () => {
    const head = `<style>@font-face{font-family:'Inter';mso-font-alt:'Arial';src:url(x.woff2)} * { font-family: 'Inter', Arial, sans-serif; }</style>`;
    const out = word(`<p id="p">x</p><p id="q" style="font-family:Inter,Arial">x</p>`, head);
    expect(tag(out, 'id="p"')).toContain("Aptos");
    // Its own family wins over `*`: the face's alt.
    expect(tag(out, 'id="q"')).toContain("'Arial'");
    // Nothing in the head is touched.
    expect(out).not.toMatch(/<meta[^>]*font-family/);
  });

  test("padding and margin in rem are dropped; px stay (real Outlook 2016 and 2019, 2026-10-22)", () => {
    const out = word(
      `<table><tr><td id="a" style="padding-top:5rem;padding-left:32px">x</td></tr></table><table id="b" style="margin-top:4rem;margin-bottom:12px"><tr><td id="c">x</td></tr></table>`,
    );
    expect(tag(out, 'id="a"')).not.toContain("5rem");
    expect(tag(out, 'id="a"')).toMatch(/padding-left:\s*32px/);
    expect(tag(out, 'id="b"')).not.toContain("4rem");
    expect(tag(out, 'id="c"')).toMatch(/padding-bottom:\s*12px/);
  });

  test("a nested table's cell starts left: the outer cell's centring does not reach in (real Outlook 2016/2019)", () => {
    const out = word(
      `<table><tr><td align="center" style="text-align:center"><table><tr><td id="inner"><p>x</p></td></tr></table><p id="own" style="text-align:center">y</p></td></tr></table>`,
    );
    expect(tag(out, 'id="inner"')).toMatch(/text-align:\s*left/);
    // The outer cell keeps its own alignment; text in it is still centred.
    expect(tag(out, "align=\"center\"")).toMatch(/text-align:\s*center/);
    expect(tag(out, 'id="own"')).toMatch(/text-align:\s*center/);
  });

  test("a table styled text-align:center still centres its own cells (the testimonial card, real Outlook 2016)", () => {
    const out = word(`<table style="text-align:center"><tr><td id="c"><p>x</p></td></tr></table>`);
    expect(tag(out, 'id="c"')).not.toContain("text-align:left");
  });

  test("width:fit-content is not read: the width attribute sizes the table (real Outlook 2016)", () => {
    const out = word(`<table id="t" width="100%" style="width:fit-content;margin:0 auto"><tr><td>x</td></tr></table>`);
    expect(tag(out, 'id="t"')).not.toContain("fit-content");
    expect(tag(out, 'id="t"')).toContain('width="100%"');
  });

  test("a later rule of the same weight wins the family; an earlier one does not", () => {
    const face = `@font-face{font-family:'Inter';src:url(x.woff2)}`;
    const after = word(`<p id="p">x</p>`, `<style>${face} p { font-family: Inter, Arial; } p { font-family: Arial; }</style>`);
    const before = word(`<p id="p">x</p>`, `<style>${face} p { font-family: Arial; } p { font-family: Inter; }</style>`);
    expect(tag(after, 'id="p"')).not.toContain("Aptos");
    expect(tag(before, 'id="p"')).toContain("Aptos");
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
    expect(img('width="100%"')).toMatch(/width:\s*100%/);
    for (const attrs of ['style="width:100px"', 'style="width:50%"', 'width="200px"']) {
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
    expect(out).toMatch(/line-height:\s*24px/);
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

  test("display:none hides a div and a table, inline or by class (Preflight Outlook Classic probe 2026-10-31)", () => {
    // 07 c19 / 09 c23-c25 drew these on the old provider's Outlook 2007-2016;
    // today's Outlook Classic hid every one (fidelity/probes/outlook-display-none.ts).
    const out = word(
      `<div id="a" class="h">text</div><div id="b" style="display:none">text</div><table id="c" style="display:none"><tr><td>x</td></tr></table>`,
      `<style>.h{display:none !important}</style>`,
    );
    expect(tag(out, 'id="a"')).not.toContain("display:block!important");
    expect(tag(out, 'id="b"')).toMatch(/display:\s*none/);
    expect(tag(out, 'id="c"')).toMatch(/display:\s*none/);
    // With mso-hide:all the block is hidden, as before.
    expect(tag(word(`<div id="d" style="display:none;mso-hide:all">text</div>`), 'id="d"')).toContain("display:none");
  });

  test("a display:none label inside a VML textbox is drawn (Brevo button, real Outlook Classic 2026-11-02)", () => {
    // Brevo's bulletproof button: the label sits in a display:none div inside
    // v:textbox. Two real Outlook Classic captures (build 20527 and the
    // provider's) show the label; the sim drew an empty pill.
    const out = word(
      `<table><tr><td><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://x.test/" style="v-text-anchor:middle;height:47px;width:479px;" arcsize="50%" fillcolor="#ff5b2b" strokecolor="#ff5b2b"><v:textbox inset="0,0,0,0"><div id="l" style="display:none;"><center>Get a quote online</center></div></v:textbox></v:roundrect><![endif]--><!--[if !mso]><!-- --><a href="https://x.test/">Get a quote online</a><!--<![endif]--></td></tr></table>`,
    );
    expect(out).toContain("Get a quote online");
    expect(tag(out, 'id="l"')).not.toMatch(/display:\s*none|mso-hide/);
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
    const plain = tag(word(`<ul id="t" style="margin:0;padding:0"><li>a</li></ul>`), 'id="t"');
    expect(plain).toMatch(/margin-top:\s*0/);
    expect(plain).toMatch(/margin-bottom:\s*18px/);
    expect(tag(word(`<div>x<br><ul id="t"><li>a</li></ul></div>`), 'id="t"')).toMatch(/margin-top:\s*1lh/);
    // After a paragraph too, on today's build: MongoDB, OneSignal, Neon (2026-11-01).
    expect(tag(word(`<p>x</p><ul id="t"><li>a</li></ul>`), 'id="t"')).toMatch(/margin-top:\s*1lh/);
  });

  test("a list's margins are not read: one line each side, gone when its items set a margin (local Outlook 2026-11-02)", () => {
    for (const style of ["margin:0", "margin:0 0 40px", "margin:16px 0 0", ""]) {
      const list = tag(word(`<div>x</div><ol id="t" style="${style}"><li>a</li></ol>`), 'id="t"');
      expect(list).toMatch(/margin-top:\s*1lh\s*!important/);
      expect(list).toMatch(/margin-bottom:\s*18px\s*!important/);
    }
    for (const item of ["margin:0 0 6px", "margin-bottom:20px"]) {
      const list = tag(word(`<div>x</div><ol id="t"><li style="${item}">a</li></ol>`), 'id="t"');
      expect(list).toMatch(/margin-top:\s*0\s*!important/);
      expect(list).toMatch(/margin-bottom:\s*0\s*!important/);
    }
    const afterBreak = tag(word(`<div>x<br><ol id="t"><li style="margin:0">a</li></ol></div>`), 'id="t"');
    expect(afterBreak).toMatch(/margin-top:\s*1lh/);
  });

  test("list text sits 48px in whatever padding-left says, and margin-left adds to it (local Outlook 2026-11-02)", () => {
    for (const style of ["padding-left:0", "padding-left:22px", "padding:0", "margin:0;padding-left:60px", ""]) {
      const list = tag(word(`<ol id="t" style="${style}"><li>a</li></ol>`), 'id="t"');
      expect(list).toMatch(/padding-left:\s*48px\s*!important/);
      expect(list).not.toMatch(/margin-left/);
    }
    const margin = tag(word(`<ul id="t" style="margin:0 0 16px 22px;padding:0"><li>a</li></ul>`), 'id="t"');
    expect(margin).toMatch(/padding-left:\s*48px\s*!important/);
    expect(margin).toMatch(/margin:\s*0 0 16px 22px/);
  });

  test("no other client is touched", () => {
    const out = gmail(`<div id="t" style="padding:20px;width:200px;margin:0 auto">text</div>`);
    expect(tag(out, 'id="t"')).toContain("padding");
    expect(tag(out, 'id="t"')).toContain("width");
    expect(out).not.toContain("p,h2{margin:0}");
  });
});

describe("a nested table in Word", () => {
  // foodpanda's code pill started its cell padding left of the text above it (2026-10-28).
  test("hangs a painted first cell's left padding out to the left", () => {
    const out = word(
      `<table><tr><td style="padding:0 14px"><table id="pill"><tr><td bgcolor="#2E2A2B" style="padding:4px 12px">code</td></tr></table></td></tr></table>`,
    );
    expect(tag(out, 'id="pill"')).toMatch(/left:\s*-12px/);
    const plain = word(
      `<table><tr><td><table id="t"><tr><td style="padding:4px 12px">x</td></tr></table></td></tr></table>`,
    );
    expect(tag(plain, 'id="t"')).not.toContain("left:");
  });

  test("leaves a sized or centred table where its width puts it", () => {
    for (const attrs of ['width="560"', 'style="width:100%"', 'align="center"']) {
      const out = word(
        `<table><tr><td align="center"><table id="c" ${attrs}><tr><td style="padding:28px;background:#27231d">hero</td></tr></table></td></tr></table>`,
      );
      expect(tag(out, 'id="c"')).not.toMatch(/left:\s*-/);
    }
  });
});

describe("Word image width from a decimal attribute", () => {
  test("width=\"193.5\" draws at 194px, not the natural size (probe 2026-10-31, I1)", () => {
    const out = word(`<img id="i" src="https://x.test/badge.png" width="193.5" style="width:100%;height:auto">`);
    expect(tag(out, 'id="i"')).toMatch(/width:\s*194px!important/);
  });
});

describe("Word bgcolor spelling", () => {
  test("a three-digit bgcolor paints nothing; six digits paint (probe 2026-10-31)", () => {
    const out = word(`<table><tr><td id="a" bgcolor="#888">x</td><td id="b" bgcolor="#888888">y</td></tr></table>`);
    expect(tag(out, 'id="a"')).not.toContain("bgcolor");
    expect(tag(out, 'id="b"')).toContain('bgcolor="#888888"');
  });
  test("a centred table loses its vertical margins, a left one paints them in the row", () => {
    const centred = word(`<table id="t" align="center" style="margin-top:40px"><tr><td id="c">x</td></tr></table>`);
    expect(tag(centred, 'id="t"')).not.toMatch(/margin-top/);
    expect(tag(centred, 'id="c"')).not.toMatch(/padding-top/);
    const left = word(`<table id="t" style="margin-top:40px"><tr><td id="c">x</td></tr></table>`);
    expect(tag(left, 'id="c"')).toMatch(/padding-top:\s*40px/);
  });

  test("a quoted sans-serif mso-font-alt draws the default", () => {
    const html = `<style>@font-face{font-family:"Saans";mso-font-alt:"sans-serif";src:url(x.woff2)}</style><p id="t" style="font-family:'Saans',sans-serif">x</p>`;
    expect(tag(word(html), 'id="t"')).toContain("font-family: Aptos");
  });

  test("an hr is a grey rule with 4px more margin each side", () => {
    const out = tag(word(`<hr id="t" style="border:none;border-top:1px solid #eaeaea;margin:20px 0">`), 'id="t"');
    expect(out).toMatch(/margin:\s*24px 0 24px/);
    expect(out).toContain("#a0a0a0");
  });

  test("a link's text-decoration-line does not remove the underline", () => {
    expect(tag(word(`<a id="t" href="#" style="text-decoration-line:none;color:red">x</a>`), 'id="t"')).not.toContain("text-decoration-line");
  });

  test("a link around a div leaves an empty line each side", () => {
    expect(word(`<a href="#"><div>x</div></a>`)).toContain("height:21px");
    expect(word(`<a href="#">x</a>`)).not.toContain("height:21px");
    // A <p> does the same (local Outlook probe 2026-11-04: 35px drew 77px;
    // run vVjSBAtUBClR's tile labels sat 19px further from their buttons).
    expect(word(`<a href="#"><p>x</p></a>`)).toContain("height:21px");
  });

  test("a left table paints its vertical margin as row height", () => {
    const out = word(`<table id="t" style="margin:4px 0 18px"><tr><td id="c" style="padding:9px">x</td></tr></table>`);
    expect(tag(out, 'id="c"')).toMatch(/padding-bottom:\s*27px/);
    expect(tag(out, 'id="c"')).toMatch(/padding-top:\s*13px/);
    expect(tag(out, 'id="t"')).not.toMatch(/margin-(?:top|bottom)/);
  });

  test("an empty paragraph adds nothing, margins included", () => {
    // Local Outlook 2026-11-04: run gjAruZbzWbTa's `<p style="margin-bottom:38px"> </p>`
    // under its button left no gap; the sim drew 38px.
    const out = word(`<p id="e" style="margin-bottom:38px"> </p><p id="n" style="margin-bottom:20px">&nbsp;</p>`);
    expect(out).not.toContain('id="e"');
    expect(out).toContain('id="n"');
  });

  test("a 1px image outside any cell adds no line", () => {
    // Local Outlook 2026-11-03: a body-level 1x1 pixel added ~0 height. Run
    // qCRl2f88rRPV's tracking pixel sat the sim's email 16px lower than real.
    const out = word(`<img id="p" src="x.gif" width="1" height="1" style="display:none!important"><table><tr><td><img id="q" src="y.gif" width="1" height="1"></td></tr></table>`);
    expect(tag(out, 'id="p"')).toMatch(/display:\s*block/);
    expect(tag(out, 'id="q"')).not.toMatch(/display:\s*block/);
  });

  test("a table's vertical margin goes to each row of bare text, and no other", () => {
    // Local Outlook 2026-11-04: in a margin-bottom:30px table only the bare-text
    // row grew 30px; rows holding a <p>, a <div>, a table or &nbsp; did not, and
    // nothing went under the table. Three bare-text rows grew 48px each. Run
    // gjAruZbzWbTa's heading row took its table's 48px; its list rows did not.
    const rows = (cells: string[]) => cells.map((c, i) => `<tr><td id="r${i}">${c}</td></tr>`).join("");
    const out = word(`<table style="margin-top:28px;margin-bottom:30px">${rows(["text", "<p>p</p>", "<div>d</div>", "<table><tr><td>n</td></tr></table>", "&nbsp;", "more <b>text</b>"])}</table>`);
    for (const i of [0, 5]) {
      expect(tag(out, `id="r${i}"`)).toMatch(/padding-bottom:\s*30px/);
      expect(tag(out, `id="r${i}"`)).toMatch(/padding-top:\s*28px/);
    }
    for (const i of [1, 2, 3, 4]) expect(tag(out, `id="r${i}"`)).not.toMatch(/padding/);
  });

  test("a bare-text cell's own margin replaces its table's, and counts without one", () => {
    // Local Outlook 2026-11-04 (15px text in a margin:28px/30px table): class
    // margin 48/48 drew 111px, inline margin-top:48px 93, margin-top:0 45; with
    // no table margin the class drew 111 and a <p> inside it 15. Run
    // gjAruZbzWbTa's heading class (48/48) beat its table's 28px top.
    const head = `<style>.h{margin-top:48px;margin-bottom:48px}</style>`;
    const out = word(
      `<table style="margin-top:28px;margin-bottom:30px"><tr><td id="a" class="h">x</td></tr></table>` +
        `<table style="margin-top:28px;margin-bottom:30px"><tr><td id="b" style="margin-top:0">x</td></tr></table>` +
        `<table><tr><td id="c" class="h">x</td></tr></table>` +
        `<table><tr><td id="d" class="h"><p>x</p></td></tr></table>`,
      head,
    );
    expect(tag(out, 'id="a"')).toMatch(/padding-top:\s*48px/);
    expect(tag(out, 'id="a"')).toMatch(/padding-bottom:\s*48px/);
    expect(tag(out, 'id="b"')).not.toMatch(/padding-top/);
    expect(tag(out, 'id="b"')).toMatch(/padding-bottom:\s*30px/);
    expect(tag(out, 'id="c"')).toMatch(/padding-top:\s*48px/);
    expect(tag(out, 'id="d"')).not.toMatch(/padding/);
  });

  test("a row's cells share its largest top and bottom padding", () => {
    // Local Outlook 2026-11-04: next to an empty cell with padding-top 20 (40)
    // the other cell's text dropped 20 (40) even at vertical-align:top; with
    // 20 and 8, both texts started at 20. Run gjAruZbzWbTa's first bullet.
    const out = word(
      `<table><tr><td id="a" style="padding-top:20px"> </td><td id="b" style="padding-top:8px;padding-bottom:4px">x</td><td id="c">y</td></tr></table>` +
        `<table><tr><td id="d">x</td></tr></table>`,
    );
    for (const id of ["a", "b", "c"]) {
      expect(tag(out, `id="${id}"`)).toMatch(/padding-top:\s*20px/);
      expect(tag(out, `id="${id}"`)).toMatch(/padding-bottom:\s*4px/);
    }
    expect(tag(out, 'id="d"')).not.toMatch(/padding/);
  });

  test("a para-border-div table is a dotted, centred Word frame", () => {
    const out = tag(word(`<table id="t" width="100%" style="max-width:650px;mso-element:para-border-div;mso-element-frame-width:650px"><tr><td>x</td></tr></table>`), 'id="t"');
    expect(out).toContain("dotted");
    expect(out).toMatch(/width:\s*667px/);
    expect(out).not.toContain("max-width");
  });

  test("a zero-width solid table border is a hairline", () => {
    expect(tag(word(`<table id="t" style="border:0px solid #cccccc"><tr><td>x</td></tr></table>`), 'id="t"')).toMatch(/border:\s*1px solid/);
  });

  test("a hidden cell keeps its padding and loses its content", () => {
    const out = word(`<table><tr><td id="t" style="display:none;padding:20px 10px 10px"><div>gone</div></td></tr></table>`);
    expect(out).not.toContain("gone");
    expect(tag(out, 'id="t"')).toMatch(/padding:\s*20px 10px 10px/);
    expect(tag(out, 'id="t"')).toContain("table-cell");
  });
});
