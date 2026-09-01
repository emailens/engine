import { describe, expect, it } from "bun:test";
import { transformForClient } from "../transform";

/**
 * The Word engine paints no background image by either route, which is the
 * whole reason the VML bulletproof pattern exists. The analyzer has always
 * said so ("Outlook Classic requires VML for background images"); only the
 * render disagreed, and a browser preview honours both `background-image` and
 * the legacy `background` attribute.
 *
 * That gap is the one that opened the Better Email thread: a hero that our
 * preview drew and the real client could not. Captured on a real Outlook 2019
 * on 27 Aug, where the hero band is empty.
 */
describe("Word engine background images", () => {
  const heroCss = `<table><tr><td background="https://x.com/h.png" style="background-image:url('https://x.com/h.png');"><p>hi</p></td></tr></table>`;

  it("strips background-image from styles", () => {
    const out = transformForClient(heroCss, "outlook-windows-legacy").html;
    expect(out).not.toContain("background-image");
    expect(out).not.toContain("h.png");
  });

  it("removes the legacy background attribute", () => {
    const out = transformForClient(heroCss, "outlook-windows-legacy").html;
    expect(out).not.toContain('background="');
  });

  it("leaves a solid background colour alone", () => {
    const out = transformForClient(
      `<table><tr><td style="background:#336699;">x</td></tr></table>`,
      "outlook-windows-legacy",
    ).html;
    expect(out).toContain("#336699");
  });

  // The regression that matters. vmlToCss runs AFTER the strip pass, so a hero
  // built the bulletproof way keeps the background this strip would take from
  // author CSS. If these ever swap order, every correct Outlook hero goes blank.
  it("still paints a correctly built bulletproof hero", () => {
    const good = `<html xmlns:v="urn:schemas-microsoft-com:vml"><body>
<td background="https://x.com/h.png" style="background-image:url('https://x.com/h.png');">
<!--[if gte mso 9]>
<v:rect fill="true" stroke="false" style="width:600px;height:300px;">
<v:fill type="frame" src="https://x.com/h.png" color="#000000" />
<v:textbox inset="0,0,0,0">
<![endif]-->
<h1>Hi</h1>
<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
</td></body></html>`;
    const out = transformForClient(good, "outlook-windows-legacy").html;
    expect(out).toContain('data-vml="rect"');
    expect(out).toContain("h.png");
    expect(out).not.toContain('background="');
  });

  // The author's fallback colour is the whole point of writing the shorthand
  // that way: it is what should show in a client that cannot paint the image.
  // Deleting the declaration renders white where Outlook renders the fallback,
  // which is a new wrong picture rather than a missing one.
  describe("degrades the shorthand to its fallback colour", () => {
    const td = (style: string) =>
      transformForClient(
        `<table><tr><td style="${style}">x</td></tr></table>`,
        "outlook-windows-legacy",
      ).html.match(/<td[^>]*>/)?.[0] ?? "";

    it("keeps a colour declared alongside an image", () => {
      expect(td("background:#336699 url('x.png') no-repeat;")).toContain("#336699");
      expect(td("background:#336699 url('x.png') no-repeat;")).not.toContain("x.png");
    });

    it("keeps a named colour", () => {
      expect(td("background:white url('x.png');")).toContain("white");
    });

    // Pre-dates the url() strip: the gradient valueStrips had the same flaw.
    it("keeps a colour declared alongside a gradient", () => {
      expect(td("background:#336699 linear-gradient(red,blue);")).toContain("#336699");
      expect(td("background:#336699 linear-gradient(red,blue);")).not.toContain("gradient");
    });

    it("drops the declaration when there is no colour to keep", () => {
      expect(td("background:url('x.png');")).not.toContain("x.png");
    });
  });

  it("does not touch any other client", () => {
    for (const id of ["outlook-windows", "gmail-web", "apple-mail-macos"]) {
      const out = transformForClient(heroCss, id).html;
      expect(out).toContain("h.png");
      expect(out).toContain('background="');
    }
  });
});
