import { describe, expect, test } from "bun:test";
import { transformForClient } from "../index";

describe("Yahoo web ignores background-size", () => {
  // foodpanda's logos and coupon, real Yahoo web (2026-10-28).
  test("drops it alone and inside the shorthand, and never reads a URL path as a size", () => {
    const html =
      `<html><head><style>.a{background-size:cover;color:red}</style></head><body><table><tr>` +
      `<td id="a" style="background: url('https://cdn.x/img/600/400.jpg') no-repeat center center / cover; padding: 0;">x</td>` +
      `<td id="b" style="background:url(y.png) no-repeat 0% 0% / 100% 100%">y</td></tr></table></body></html>`;
    const out = transformForClient(html, "yahoo-mail").html;
    expect(out).toContain("url('https://cdn.x/img/600/400.jpg') no-repeat center center;");
    expect(out).toContain("url(y.png) no-repeat 0% 0%");
    expect(out).not.toContain("background-size");
    expect(transformForClient(html, "gmail-web").html).toContain("/ cover");
  });
});
