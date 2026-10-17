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
