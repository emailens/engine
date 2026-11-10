import { describe, expect, test } from "bun:test";
import { transformForClient } from "../index";

describe("Yahoo web ignores a size inside the background shorthand", () => {
  // foodpanda's logos and coupon, real Yahoo web (2026-10-28): both wrote the
  // size after the slash. caniemail lists the same.
  const html =
      `<html><head><style>.a{background-size:cover;color:red}</style></head><body><table><tr>` +
      `<td id="a" style="background: url('https://cdn.x/img/600/400.jpg') no-repeat center center / cover; padding: 0;">x</td>` +
      `<td id="b" style="background:url(y.png) no-repeat 0% 0% / 100% 100%">y</td></tr></table></body></html>`;
  test("drops the shorthand's size, and never reads a URL path as a size", () => {
    const out = transformForClient(html, "yahoo-mail").html;
    expect(out).toContain("url('https://cdn.x/img/600/400.jpg') no-repeat center center;");
    expect(out).toContain("url(y.png) no-repeat 0% 0%");
    expect(out).not.toContain("/ cover");
    expect(out).not.toContain("/ 100% 100%");
    expect(transformForClient(html, "gmail-web").html).toContain("/ cover");
  });
  // AliExpress, real Yahoo web (emailens fidelity bench, 2026-11-09): 29
  // product photos with an inline `background-size: 100% 100%` or `cover`
  // drew fitted to their cells, as designed. The preview had drawn them at
  // their own size, zoomed and cropped.
  test("keeps background-size written on its own, inline and in <style>", () => {
    const out = transformForClient(html, "yahoo-mail").html;
    expect(out).toContain(".a{background-size:cover;color:red}");
    const inline = transformForClient(
      `<html><body><table><tr><td style="background-image:url(p.png);background-size:100% 100%">p</td></tr></table></body></html>`,
      "yahoo-mail",
    ).html;
    expect(inline).toContain("background-size:100% 100%");
  });
});

describe("Yahoo web drops a <style> with a comma-separated media query list", () => {
  // Real Yahoo web probe, run IY_C34Eh_aJ5 (2026-10-29), one block per row.
  const block = (media: string) =>
    `<html><head><style>@media ${media}{.z{color:blue}} .t{color:green}</style></head><body><p class="t">x</p></body></html>`;
  test("a comma list goes whole, whatever its conditions", () => {
    for (const media of [
      "screen and (max-device-width:600px), screen and (max-width:600px)",
      "screen and (max-width:600px), screen and (max-width:601px)",
    ]) {
      const t = transformForClient(block(media), "yahoo-mail");
      expect(t.html).not.toContain(".t{color:green}");
      expect(t.warnings.some((w) => w.property === "@media")).toBe(true);
    }
  });
  test("one condition stays, max-device-width included; other clients keep the list", () => {
    expect(transformForClient(block("screen and (max-device-width:600px)"), "yahoo-mail").html).toContain(".t{color:green}");
    expect(transformForClient(block("only screen and (max-width: 600px)"), "yahoo-mail").html).toContain(".t{color:green}");
    const gmail = transformForClient(block("screen and (max-width:600px), print"), "gmail-web");
    expect(gmail.warnings.some((w) => w.message.includes("comma-separated"))).toBe(false);
  });
});
