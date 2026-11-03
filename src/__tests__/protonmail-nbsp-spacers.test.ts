import { describe, expect, test } from "bun:test";
import { transformForClient } from "../transform";

// Real Proton Mail web draws a block whose only content is &nbsp; at no
// height: emailens real-device captures on proton_web, 2026-10-28..30.
// `<p>&nbsp;</p>` spacers (previews A4yJTiDrzpHK, run _YHEeChhj-3_, and
// UBLMOHR_9V1X, run Z2Hn_aEsftuG) and `<div><span>&nbsp;</span></div>` spacers
// (preview ckKDNoBCeSKz) all collapsed, 9 of 9, so paragraphs the email spaced
// apart touched; Yahoo and Gmail kept the gaps. A div with an explicit height
// kept its height (UBLM), so the content goes, not the element.
describe("protonmail collapses &nbsp;-only spacers", () => {
  const html = `<html><body>
    <p style="margin:0">Hi there,</p>
    <p style="margin:0">&nbsp;</p>
    <div style="font-size:14px;line-height:21px"><span>&nbsp;</span></div>
    <div style="height:20px;line-height:20px">&nbsp;</div>
    <p style="margin:0">Keep&nbsp;going, <b>&nbsp;</b> here.</p>
    <table><tr><td height="20">&nbsp;</td></tr></table>
  </body></html>`;
  const out = transformForClient(html, "protonmail").html;

  test("empties a <p> and a <span> that hold only &nbsp;", () => {
    expect(out).toContain('<p style="margin:0"></p>');
    expect(out).toContain("<span></span>");
  });

  test("keeps the element, so an explicit height still holds", () => {
    expect(out).toContain('<div style="height:20px;line-height:20px"></div>');
  });

  test("leaves &nbsp; inside text and spacer cells alone", () => {
    expect(out).toMatch(/Keep(&nbsp;| )going/);
    expect(out).toMatch(/<td height="20">(&nbsp;| )<\/td>/);
  });

  test("Yahoo keeps the spacers", () => {
    const yahoo = transformForClient(html, "yahoo-mail").html;
    expect(yahoo).toMatch(/<p style="margin:0">(&nbsp;| )<\/p>/);
  });
});
