import { describe, expect, test } from "bun:test";
import { transformForClient } from "../index";

// Today's Outlook Classic (Preflight probe 2026-10-31) hid an inline or class
// display:none div, span and table, and real Make kept its bare
// `<div style="display:none">` preheader hidden, which the preview painted
// above the email. caniemail: display:none is not honoured on <img>.
describe("Outlook Classic honours display:none", () => {
  const body = (html: string, head = "") => {
    const out = transformForClient(`<html><head>${head}</head><body>${html}</body></html>`, "outlook-windows-legacy").html;
    return out.slice(out.indexOf("<body"));
  };

  test("a bare display:none preheader stays hidden", () => {
    expect(body(`<div style="display: none">preheader</div>`)).toMatch(/<div[^>]*display:\s*none[^>]*>preheader/);
  });

  test("a hidden table stays hidden", () => {
    expect(body(`<table style="display:none"><tr><td>x</td></tr></table>`)).toMatch(/<table[^>]*display:\s*none/);
  });

  test("other display values are still stripped", () => {
    expect(body(`<table style="display:block"><tr><td>x</td></tr></table>`)).not.toContain("display");
  });

  test("display:none on an image is not honoured, so it is stripped", () => {
    expect(body(`<img src="a.png" style="display:none">`)).not.toMatch(/<img[^>]*display/);
  });
});
