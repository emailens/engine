import { describe, expect, test } from "bun:test";
import { analyzeEmail, generateCompatibilityScore } from "../analyze";
import { EMAIL_CLIENTS } from "../clients";
import { GMAIL_STYLE_LIMIT } from "../constants";
import { CSS_SUPPORT, CSS_SUPPORT_NOTES } from "../rules/css-support";

const WORD = "outlook-windows-legacy";
const GMAIL = "gmail-web";

function scoreOf(html: string, client = WORD): number {
  return generateCompatibilityScore(analyzeEmail(html))[client].score;
}

function severityOf(html: string, property: string, client = WORD): string | undefined {
  return analyzeEmail(html).find((w) => w.client === client && w.property === property)?.severity;
}

function clientsNoting(property: string, needle: string): Set<string> {
  const notes = CSS_SUPPORT_NOTES[property] ?? {};
  const needleLc = needle.toLowerCase();
  return new Set(
    Object.entries(notes)
      .filter(([, lines]) => lines.some((line) => line.toLowerCase().includes(needleLc)))
      .map(([id]) => id),
  );
}

function page(body: string): string {
  return `<!DOCTYPE html><html><body>${body}</body></html>`;
}

const mso = (inner: string) => `<!--[if mso]>${inner}<![endif]-->`;
const notMso = (inner: string) => `<!--[if !mso]><!-->${inner}<!--<![endif]-->`;

const roundrect =
  `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="14%" stroke="f" fillcolor="#6d28d9">` +
  `<w:anchorlock/><center>Go</center></v:roundrect>`;

describe("intent score", () => {
  test("Word border-radius inside <!--[if !mso]> next to a v:roundrect is info", () => {
    const fixed = page(`${mso(roundrect)}${notMso(`<a href="https://example.com" style="border-radius:6px">Go</a>`)}`);
    const twin = page(`${mso(roundrect)}${notMso(`<a href="https://example.com">Go</a>`)}`);
    expect(severityOf(fixed, "border-radius")).toBe("info");
    expect(scoreOf(fixed)).toBe(scoreOf(twin));
    expect(severityOf(fixed, "border-radius", "outlook-windows")).toBe("warning");
  });

  test("border-radius counts on markup Word reads, and a button's roundrect does not clear a card", () => {
    const broken = page(`<a href="https://example.com" style="border-radius:6px">Go</a>`);
    const plain = page(`<a href="https://example.com">Go</a>`);
    expect(severityOf(broken, "border-radius")).toBe("warning");
    expect(scoreOf(broken)).toBe(scoreOf(plain) - 3);

    const card = page(
      `${mso(roundrect)}${notMso(`<a style="border-radius:6px">Go</a>`)}<div style="border-radius:8px">Card</div>`,
    );
    expect(severityOf(card, "border-radius")).toBe("warning");
    expect(scoreOf(card)).toBeLessThan(scoreOf(page(`${mso(roundrect)}${notMso(`<a style="border-radius:6px">Go</a>`)}`)));
  });

  test("background image, position, repeat and origin clear when a v:fill covers that container", () => {
    const decl = `background-image:url(hero.jpg);background-position:center;background-repeat:no-repeat;background-origin:padding-box`;
    const fill =
      `<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:200px;">` +
      `<v:fill type="frame" src="hero.jpg" color="#333333" />` +
      `<v:textbox inset="0,0,0,0">`;
    const fixed = page(
      `<table><tr><td style="${decl}">${mso(fill)}<p>Hi</p>${mso(`</v:textbox></v:rect>`)}</td></tr></table>`,
    );
    const twin = page(`<table><tr><td><p>Hi</p></td></tr></table>`);
    const broken = page(`<table><tr><td style="${decl}"><p>Hi</p></td></tr></table>`);
    for (const prop of ["background-image", "background-position", "background-repeat", "background-origin"]) {
      expect(severityOf(fixed, prop)).toBe("info");
      expect(severityOf(broken, prop)).toBe("warning");
    }
    expect(scoreOf(fixed)).toBe(scoreOf(twin));
    expect(scoreOf(broken)).toBeLessThan(scoreOf(twin));
  });

  test("linear-gradient clears when a v:fill covers that container", () => {
    const fill =
      `<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:200px;">` +
      `<v:fill type="frame" color="#333333" /><v:textbox inset="0,0,0,0">`;
    const fixed = page(
      `<table><tr><td style="background:linear-gradient(#111,#333)">${mso(fill)}<p>Hi</p>${mso(`</v:textbox></v:rect>`)}</td></tr></table>`,
    );
    const twin = page(`<table><tr><td><p>Hi</p></td></tr></table>`);
    const broken = page(`<table><tr><td style="background:linear-gradient(#111,#333)"><p>Hi</p></td></tr></table>`);
    expect(severityOf(fixed, "linear-gradient")).toBe("info");
    expect(severityOf(broken, "linear-gradient")).toBe("warning");
    expect(scoreOf(fixed)).toBe(scoreOf(twin));
    expect(scoreOf(broken)).toBe(scoreOf(twin) - 3);
  });

  test("max-width clears on a table and on an MSO width wrapper", () => {
    const onTable = page(`<table style="max-width:600px"><tr><td>Hi</td></tr></table>`);
    const wrapped = page(
      `${mso(`<table width="600"><tr><td>`)}<div style="max-width:600px">Hi</div>${mso(`</td></tr></table>`)}`,
    );
    const broken = page(`<div style="max-width:600px">Hi</div>`);
    const plain = page(`<div>Hi</div>`);
    expect(severityOf(onTable, "max-width")).toBe("info");
    expect(severityOf(wrapped, "max-width")).toBe("info");
    expect(scoreOf(onTable)).toBe(scoreOf(page(`<table><tr><td>Hi</td></tr></table>`)));
    expect(scoreOf(wrapped)).toBe(scoreOf(page(`${mso(`<table width="600"><tr><td>`)}<div>Hi</div>${mso(`</td></tr></table>`)}`)));
    expect(severityOf(broken, "max-width")).toBe("warning");
    expect(scoreOf(broken)).toBe(scoreOf(plain) - 3);
  });

  test("padding clears on a cell and on mso-padding-alt, and a row that disagrees counts", () => {
    const cell = page(`<table><tr><td style="padding:12px">Hi</td></tr></table>`);
    const alt = page(
      `<table><tr><td style="mso-padding-alt:12px 32px"><a href="https://example.com" style="padding:12px 32px">Go</a></td></tr></table>`,
    );
    const broken = page(`<a href="https://example.com" style="padding:12px 32px">Go</a>`);
    const plain = page(`<a href="https://example.com">Go</a>`);
    const agree = page(`<table><tr><td style="padding-top:8px">A</td><td style="padding-top:8px">B</td></tr></table>`);
    const disagree = page(`<table><tr><td style="padding-top:8px">A</td><td style="padding-top:16px">B</td></tr></table>`);
    expect(severityOf(cell, "padding")).toBe("info");
    expect(severityOf(alt, "padding")).toBe("info");
    expect(scoreOf(cell)).toBe(scoreOf(page(`<table><tr><td>Hi</td></tr></table>`)));
    expect(severityOf(broken, "padding")).toBe("warning");
    expect(scoreOf(broken)).toBe(scoreOf(plain) - 3);
    expect(severityOf(agree, "padding")).toBe("info");
    expect(severityOf(disagree, "padding")).toBe("warning");
    expect(scoreOf(disagree)).toBe(scoreOf(agree) - 3);
  });

  test("margin counts when it is negative, auto without a centre, or on span and body", () => {
    const positive = page(`<div style="margin:16px">Hi</div>`);
    const plain = page(`<div>Hi</div>`);
    expect(scoreOf(positive)).toBe(scoreOf(plain));

    const negative = page(`<div style="margin-top:-10px">Hi</div>`);
    expect(severityOf(negative, "margin")).toBe("warning");
    expect(scoreOf(negative)).toBe(scoreOf(plain) - 3);

    const auto = page(`<table style="margin:0 auto"><tr><td>Hi</td></tr></table>`);
    const centred = page(`<table align="center" style="margin:0 auto"><tr><td>Hi</td></tr></table>`);
    expect(severityOf(auto, "margin")).toBe("warning");
    expect(severityOf(centred, "margin")).toBe("info");
    expect(scoreOf(auto)).toBe(scoreOf(page(`<table align="center"><tr><td>Hi</td></tr></table>`)) - 3);
    expect(scoreOf(centred)).toBe(scoreOf(page(`<table align="center"><tr><td>Hi</td></tr></table>`)));

    const span = page(`<span style="margin:16px">Hi</span>`);
    const carried = page(`<table><tr><td style="padding:16px"><span style="margin:16px">Hi</span></td></tr></table>`);
    expect(severityOf(span, "margin")).toBe("warning");
    expect(scoreOf(span)).toBe(scoreOf(page(`<span>Hi</span>`)) - 3);
    expect(severityOf(carried, "margin")).toBe("info");
  });

  test("float clears when it is only on the branch Word does not read", () => {
    const fixed = page(
      `${mso(`<table align="left"><tr><td>`)}<img src="photo.jpg" width="200" alt="" />${mso(`</td></tr></table>`)}` +
      notMso(`<img src="photo.jpg" width="200" alt="" style="float:left" />`),
    );
    const twin = page(
      `${mso(`<table align="left"><tr><td>`)}<img src="photo.jpg" width="200" alt="" />${mso(`</td></tr></table>`)}` +
      notMso(`<img src="photo.jpg" width="200" alt="" />`),
    );
    const broken = page(`<img src="photo.jpg" width="200" alt="" style="float:left" />`);
    const plain = page(`<img src="photo.jpg" width="200" alt="" />`);
    expect(severityOf(fixed, "float")).toBe("info");
    expect(scoreOf(fixed)).toBe(scoreOf(twin));
    expect(severityOf(broken, "float")).toBe("warning");
    expect(scoreOf(broken)).toBe(scoreOf(plain) - 3);
  });

  test("flex and grid clear when only the non-MSO branch has the box", () => {
    for (const display of ["flex", "grid"]) {
      const fixed = page(`${mso(`<table><tr><td>Hi</td></tr></table>`)}${notMso(`<div style="display:${display}">Hi</div>`)}`);
      const twin = page(`${mso(`<table><tr><td>Hi</td></tr></table>`)}`);
      const broken = page(`<div style="display:${display}">Hi</div>`);
      const plain = page(`<div>Hi</div>`);
      expect(severityOf(fixed, `display:${display}`)).toBe("info");
      expect(scoreOf(fixed)).toBe(scoreOf(twin));
      expect(severityOf(broken, `display:${display}`)).toBe("warning");
      expect(scoreOf(broken)).toBe(scoreOf(plain) - 3);
    }
  });

  test("a body background counts until a full-width wrapper repeats it", () => {
    const broken = page(`<p style="color:#111">Hi</p>`).replace("<body>", `<body style="background-color:#f4f4f4">`);
    const plain = page(`<p style="color:#111">Hi</p>`);
    const fixed = page(`<table width="100%" style="background-color:#f4f4f4"><tr><td>Hi</td></tr></table>`)
      .replace("<body>", `<body style="background-color:#f4f4f4">`);
    const wrapper = page(`<table width="100%" style="background-color:#f4f4f4"><tr><td>Hi</td></tr></table>`);
    expect(severityOf(broken, "body-background", GMAIL)).toBe("warning");
    expect(analyzeEmail(broken).find((w) => w.property === "body-background")?.suggestion).toBeTruthy();
    expect(scoreOf(broken, GMAIL)).toBe(scoreOf(plain, GMAIL) - 3);
    expect(severityOf(fixed, "body-background", GMAIL)).toBeUndefined();
    expect(scoreOf(fixed, GMAIL)).toBe(scoreOf(wrapper, GMAIL));
  });

  test("box-shadow still counts, and Yahoo elliptical radius is a warning", () => {
    const shadow = page(`<div style="box-shadow:0 2px 8px #000;border:1px solid #ccc">Hi</div>`);
    const border = page(`<div style="border:1px solid #ccc">Hi</div>`);
    expect(scoreOf(shadow)).toBe(scoreOf(border) - 3);

    const ellipse = page(`<div style="border-radius:10px / 20px">Hi</div>`);
    expect(severityOf(ellipse, "border-radius", "yahoo-mail")).toBe("warning");
    expect(severityOf(ellipse, "border-radius", "aol")).toBe("warning");
  });

  test("style survival and the Gmail 16 KB ceiling each move the score once", () => {
    const comma = page(`<style>p { color: rgb(0, 0, 0); }</style><p>Hi</p>`);
    const spaces = page(`<style>p { color: rgb(0 0 0); }</style><p>Hi</p>`);
    expect(severityOf(spaces, "gmail-space-separated-color", GMAIL)).toBe("error");
    expect(analyzeEmail(spaces).find((w) => w.property === "gmail-space-separated-color")?.suggestion).toBeTruthy();
    expect(scoreOf(spaces, GMAIL)).toBe(scoreOf(comma, GMAIL) - 10);

    const braces = page(`<style>@media screen { p { color: #111; }}</style><p>Hi</p>`);
    const spaced = page(`<style>@media screen { p { color: #111; } }</style><p>Hi</p>`);
    expect(severityOf(braces, "outlook-double-brace", "outlook-web")).toBe("error");
    expect(scoreOf(braces, "outlook-web")).toBe(scoreOf(spaced, "outlook-web") - 10);

    const small = page(`<style>p{color:#111}</style><p>Hi</p>`);
    const huge = page(`<style>p{color:#111}${" ".repeat(GMAIL_STYLE_LIMIT)}</style><p>Hi</p>`);
    expect(severityOf(huge, "gmail-style-truncated", GMAIL)).toBe("error");
    expect(scoreOf(huge, GMAIL)).toBe(scoreOf(small, GMAIL) - 10);
  });

  test("a broken v:roundrect counts, and an arcsize clamp does not", () => {
    const broken = page(mso(`<v:roundrect style="width:100px;height:40px;">Click</v:roundrect>`));
    const sound = page(mso(`<v:roundrect style="width:100px;height:40px;"><center>Click</center></v:roundrect>`));
    const clamped = page(mso(`<v:roundrect style="width:100px;height:40px;" arcsize="120%"><center>Go</center></v:roundrect>`));
    expect(severityOf(broken, "vml-unrendered-text")).toBe("error");
    expect(scoreOf(broken)).toBe(scoreOf(sound) - 10);
    expect(severityOf(clamped, "vml-arcsize-range")).toBeUndefined();
    expect(scoreOf(clamped)).toBe(scoreOf(sound));
  });

  test("a negative margin is scored, with a fix, on every client that drops it", () => {
    const html = page(`<div style="margin-top:-10px">Hi</div>`);
    const warnings = analyzeEmail(html);
    const losers = clientsNoting("margin", "negative");
    for (const client of EMAIL_CLIENTS) {
      const found = warnings.find((w) => w.client === client.id && w.property === "margin" && w.severity === "warning");
      if (losers.has(client.id)) expect(found?.suggestion, client.id).toBeTruthy();
      else expect(found, client.id).toBeUndefined();
    }
  });

  test("New Outlook does not treat an MSO-only fallback as carrying the intent", () => {
    const wrapped = page(
      `${mso(`<table width="600"><tr><td>`)}<div style="max-width:600px">Hi</div>${mso(`</td></tr></table>`)}`,
    );
    const plain = page(`${mso(`<table width="600"><tr><td>`)}<div>Hi</div>${mso(`</td></tr></table>`)}`);
    expect(severityOf(wrapped, "max-width", "outlook-windows")).toBe("warning");
    expect(scoreOf(wrapped, "outlook-windows")).toBe(scoreOf(plain, "outlook-windows") - 3);
    expect(severityOf(wrapped, "max-width")).toBe("info");

    const alt = page(`<table><tr><td style="mso-padding-alt:12px"><a href="https://example.com" style="padding:12px">Go</a></td></tr></table>`);
    expect(severityOf(alt, "padding")).toBe("info");
    expect(severityOf(alt, "padding", "outlook-windows")).toBe("warning");
    expect(analyzeEmail(alt).find((w) => w.client === "outlook-windows" && w.property === "padding")?.suggestion).toBeTruthy();
  });

  test("an elliptical radius is scored on Yahoo and AOL, and a plain one is carried everywhere it is supported", () => {
    const ellipse = page(`<div style="border-radius:10px / 20px">Hi</div>`);
    const plain = page(`<div style="border-radius:10px">Hi</div>`);
    for (const client of ["yahoo-mail", "yahoo-mail-android", "yahoo-mail-ios", "aol"]) {
      const warning = analyzeEmail(ellipse).find((w) => w.client === client && w.property === "border-radius");
      expect(warning?.severity).toBe("warning");
      expect(warning?.suggestion).toBeTruthy();
      expect(scoreOf(ellipse, client)).toBe(scoreOf(plain, client) - 3);
    }
    expect(severityOf(plain, "border-radius", "apple-mail-ios")).toBeUndefined();
    expect(severityOf(plain, "border-radius", "samsung-mail")).toBeUndefined();
    expect(severityOf(plain, "border-radius", "thunderbird")).toBeUndefined();
    expect(severityOf(plain, "border-radius", "superhuman")).toBeUndefined();
  });

  test("logical float and inline-flex are scored only where that value is dropped", () => {
    const logical = page(`<div style="float:inline-start">Hi</div>`);
    const left = page(`<div style="float:left">Hi</div>`);
    expect(severityOf(logical, "float", "gmail-android")).toBe("warning");
    expect(severityOf(logical, "float", "aol")).toBe("warning");
    expect(severityOf(left, "float", "gmail-android")).not.toBe("warning");
    expect(analyzeEmail(logical).find((w) => w.client === "gmail-android" && w.property === "float")?.suggestion).toContain("left");

    const inline = page(`<div style="display:inline-flex">Hi</div>`);
    const flex = page(`<div style="display:flex">Hi</div>`);
    expect(severityOf(inline, "display:flex", "yahoo-mail")).toBe("warning");
    expect(scoreOf(inline, "yahoo-mail")).toBe(scoreOf(flex, "yahoo-mail") - 3);
    expect(severityOf(flex, "display:flex", "apple-mail-macos")).toBeUndefined();
  });

  test("a roundrect covers its own control, not the card it sits in", () => {
    const button = page(`<a style="border-radius:6px">${roundrect}</a>`);
    const card = page(`<div style="border-radius:8px">${roundrect}<p>Card</p></div>`);
    const both = page(`<a style="border-radius:6px">${roundrect}</a><div style="border-radius:8px">Card</div>`);
    expect(severityOf(button, "border-radius")).toBe("info");
    expect(severityOf(card, "border-radius")).toBe("warning");
    const found = analyzeEmail(both).filter((w) => w.client === WORD && w.property === "border-radius");
    expect(found.find((w) => w.selector === "a")?.severity).toBe("info");
    expect(found.find((w) => w.selector === "div")?.severity).toBe("warning");
    expect(scoreOf(both)).toBe(scoreOf(page(`<a>${roundrect}</a><div>Card</div>`)) - 3);
  });

  test("a bare v:rect does not clear a background, and a shorthand url counts", () => {
    const rect = `<v:rect xmlns:v="urn:schemas-microsoft-com:vml" style="width:600px;height:200px;"></v:rect>`;
    expect(severityOf(page(`<table><tr><td style="background-image:url(hero.jpg)">${rect}</td></tr></table>`), "background-image")).toBe("warning");
    expect(severityOf(page(`<div style="background:url(hero.jpg)">Hi</div>`), "background-image")).toBe("warning");
    const fill =
      `<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:200px;">` +
      `<v:fill type="frame" src="hero.jpg" color="#333333" /><v:textbox inset="0,0,0,0">`;
    const fixed = page(`<table><tr><td style="background:url(hero.jpg)">${mso(fill)}<p>Hi</p>${mso(`</v:textbox></v:rect>`)}</td></tr></table>`);
    expect(severityOf(fixed, "background-image")).toBe("info");

    const placed = page(`<div style="background:url(hero.jpg) center no-repeat padding-box">Hi</div>`);
    const urlOnly = page(`<div style="background:url(hero.jpg)">Hi</div>`);
    const plain = page(`<div>Hi</div>`);
    expect(severityOf(placed, "background-position")).toBe("warning");
    expect(severityOf(placed, "background-repeat")).toBe("warning");
    expect(severityOf(placed, "background-origin")).toBe("warning");
    expect(scoreOf(placed)).toBe(scoreOf(urlOnly) - 9);
    expect(severityOf(page(`<div style="background:url(top.png)">Hi</div>`), "background-position")).toBeUndefined();
    const placedFill = page(
      `<table><tr><td style="background:url(hero.jpg) center no-repeat padding-box">${mso(fill)}<p>Hi</p>${mso(`</v:textbox></v:rect>`)}</td></tr></table>`,
    );
    for (const prop of ["background-image", "background-position", "background-repeat", "background-origin"]) {
      expect(severityOf(placedFill, prop)).toBe("info");
    }
    expect(scoreOf(placedFill)).toBe(scoreOf(page(`<table><tr><td><p>Hi</p></td></tr></table>`)));
    expect(scoreOf(urlOnly)).toBe(scoreOf(plain) - 3);
  });

  test("max-width clears only a table of the same width", () => {
    expect(severityOf(page(`<table width="600"><tr><td><div style="max-width:280px">Hi</div></td></tr></table>`), "max-width")).toBe("warning");
    const px = page(`${mso(`<table width="600px"><tr><td>`)}<div style="max-width:600px">Hi</div>${mso(`</td></tr></table>`)}`);
    expect(severityOf(px, "max-width")).toBe("info");
    expect(severityOf(page(`<h1 style="padding:12px">Hi</h1>`), "padding")).toBe("warning");
    const same = page(`<table><tr><td style="padding:8px">A</td><td style="padding-top:8px;padding-bottom:8px">B</td></tr></table>`);
    expect(severityOf(same, "padding")).toBe("info");
  });

  test("a stylesheet span margin is carried by its cell, and a body class is not a body", () => {
    const carried = page(`<style>span { margin: 16px; }</style><table><tr><td style="padding:16px"><span>Hi</span></td></tr></table>`);
    expect(severityOf(carried, "margin")).toBe("info");
    expect(severityOf(page(`<style>.body-copy { margin: 16px; }</style><p class="body-copy">Hi</p>`), "margin")).not.toBe("warning");
  });

  test("one broken roundrect does not uncover a different control", () => {
    const covered = page(`<a style="border-radius:6px">${roundrect}</a>`);
    const also = page(`<a style="border-radius:6px">${roundrect}</a>${mso(`<v:roundrect style="width:100px;height:40px;">Click</v:roundrect>`)}`);
    expect(severityOf(covered, "border-radius")).toBe("info");
    expect(severityOf(also, "border-radius")).toBe("info");
    expect(severityOf(also, "vml-unrendered-text")).toBe("error");
    expect(scoreOf(also)).toBe(scoreOf(covered) - 10);
  });

  test("Word sheet killers follow the branch Word reads", () => {
    const css = `<style>.a{color:red}.b{color:blue}</style><div class="a b">Hi</div>`;
    expect(severityOf(page(notMso(css)), "outlook-first-class-only")).toBeUndefined();
    expect(severityOf(page(mso(css)), "outlook-first-class-only")).toBe("warning");
  });

  test("a lost body background is not charged twice", () => {
    const html = page(`<p>Hi</p>`).replace("<body>", `<body style="background-color:#f4f4f4">`);
    const warnings = analyzeEmail(html);
    for (const [id, level] of Object.entries(CSS_SUPPORT["<body>"] ?? {})) {
      if (level !== "unsupported") continue;
      const body = warnings.some((w) => w.client === id && w.property === "<body>" && w.severity !== "info");
      const background = warnings.some((w) => w.client === id && w.property === "body-background");
      if (body) expect(background, id).toBe(false);
    }
  });
});
