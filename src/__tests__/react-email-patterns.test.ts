import { describe, expect, test } from "bun:test";
import { analyzeEmail } from "../analyze";

// Markup exactly as @react-email/components renders it (2026-10).
const PREVIEW =
  '<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0" data-skip-in-text="true">Confirm your address</div>';
const BUTTON =
  '<a href="https://example.com" style="line-height:24px;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;background-color:#111;color:#fff;padding:12px 24px 12px 24px" target="_blank">' +
  '<span><!--[if mso]><i style="mso-font-width:400%;mso-text-raise:18" hidden>&#8202;&#8202;</i><![endif]--></span>' +
  '<span style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px">Verify</span>' +
  '<span><!--[if mso]><i style="mso-font-width:400%" hidden>&#8202;&#8202;&#8203;</i><![endif]--></span></a>';

const wrap = (body: string) =>
  `<!DOCTYPE html><html><head></head><body><table role="presentation" width="100%"><tr><td>${body}</td></tr></table></body></html>`;

const outlook = (html: string) =>
  analyzeEmail(wrap(html)).filter((w) => w.client === "outlook-windows-legacy" && w.severity !== "info");

describe("React Email building blocks in Outlook Classic", () => {
  test("a display:none preheader is not graded on the styles that hide it", () => {
    const props = outlook(PREVIEW).map((w) => w.property);
    for (const p of ["overflow", "opacity", "max-height", "max-width"]) expect(props).not.toContain(p);
  });

  test("the button's Outlook spacers are not graded as an unsupported hidden attribute", () => {
    expect(outlook(BUTTON).map((w) => w.property)).not.toContain("[hidden]");
  });

  test("the button's padding counts as covered by its Outlook spacers", () => {
    expect(outlook(BUTTON).map((w) => w.property)).not.toContain("padding");
  });

  test("padding on a plain link with no spacers is still flagged", () => {
    const plain = '<a href="https://example.com" style="display:inline-block;padding:12px 24px">Verify</a>';
    expect(outlook(plain).map((w) => w.property)).toContain("padding");
  });

  test("hidden on ordinary markup is still flagged", () => {
    expect(outlook("<p hidden>secret</p>").map((w) => w.property)).toContain("[hidden]");
  });
});

import { renderOutlookBranch, vmlPathToSvg } from "../vml-render";

describe("VML corner shapes", () => {
  test("quadrants become SVG arcs turning the right way", () => {
    // Top-left corner: up the left edge, curving right to the top edge.
    expect(vmlPathToSvg("m 0,10 qy 10,0 l 10,10 x e")?.fill).toBe("M0 10A10 10 0 0 1 10 0L10 10Z");
    // Bottom-right corner: down the right edge, curving left to the bottom.
    expect(vmlPathToSvg("m 10,0 qy 0,10 l 0,0 x e")?.fill).toBe("M10 0A10 10 0 0 1 0 10L0 0Z");
  });

  test("ns and nf split what is filled from what is stroked", () => {
    const p = vmlPathToSvg("m 0,10 qy 10,0 l 10,10 x ns e m 0,10 qy 10,0 nf e");
    expect(p?.fill).toBe("M0 10A10 10 0 0 1 10 0L10 10Z");
    expect(p?.stroke).toBe("M0 10A10 10 0 0 1 10 0");
  });

  test("an unknown command leaves the path alone", () => {
    expect(vmlPathToSvg("m 0,0 ar 1,2,3,4 e")).toBeNull();
  });

  test("Outlook's preview draws a corner shape instead of dropping it", () => {
    const html =
      '<table><tr><td><!--[if mso]><v:shape xmlns:v="urn:schemas-microsoft-com:vml" coordsize="10,10" path="m 0,10 qy 10,0 l 10,10 x e" fillcolor="#f3f0e8" stroked="f" style="width:10px;height:10px;"></v:shape><![endif]--></td></tr></table>';
    const out = renderOutlookBranch(html);
    expect(out).toContain('<svg data-vml="shape" width="10" height="10"');
    expect(out).toContain('fill="#f3f0e8"');
  });
});

describe("<wbr>", () => {
  test("a client ignoring a break opportunity is not a warning", () => {
    const html = wrap('<a href="https://example.com/verify?token=abc">https://example.com/<wbr>verify?<wbr>token=abc</a>');
    expect(analyzeEmail(html).filter((w) => w.property === "<wbr>" && w.severity !== "info")).toEqual([]);
  });
});

describe("VML button label", () => {
  test("keeps the colour set on its <center>", () => {
    const html =
      '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://x.dev" style="height:52px;width:200px;" arcsize="15%" stroke="f" fillcolor="#1a1a1a"><w:anchorlock/><center style="color:#ffffff;">Go</center></v:roundrect><![endif]-->';
    expect(renderOutlookBranch(html)).toContain('<span style="color:#ffffff;">Go</span>');
  });
});
