import { describe, expect, test } from "bun:test";
import { transformForClient } from "../transform";

// Real Yahoo Mail web drew a radial-gradient button as its flat
// background-color: emailens real-device capture on yahoo_web of preview
// J9vFS4nm_LGl (2026-10-30), button measured #d234e2 = the declared
// rgba(210,51,225), where the simulation drew the purple-to-pink gradient. The
// gradient was set twice, inline (`background:radial-gradient(...)`) and in a
// <style> rule (`background-image:radial-gradient(...) !important`); neither
// painted. Real Gmail web drew the same gradient. caniemail css-radial-gradient
// also marks Yahoo unsupported.
describe("yahoo-mail drops radial-gradient", () => {
  const html = `<html><head><style>
    .cta{background-color:#d233e1 !important;background-image:radial-gradient(70% 800% at 100% 50%,#f024f6 0%,#8200fa 100%) !important;color:#fff}
  </style></head><body>
    <a class="cta" href="#" style="background-color:#d233e1;background:radial-gradient(70% 800% at 100% 50%,#f024f6 0%,#8200fa 100%);color:#fff">Go</a>
  </body></html>`;
  const out = transformForClient(html, "yahoo-mail").html;

  test("drops the gradient in the <style> rule and inline", () => {
    expect(out).not.toContain("radial-gradient");
  });

  test("keeps the background-color, which is what Yahoo paints", () => {
    expect(out).toMatch(/\.cta\{[^}]*background-color:#d233e1/);
    expect(out).toMatch(/style="[^"]*background-color:#d233e1/);
  });

  test("Gmail web keeps the <style> gradient", () => {
    expect(transformForClient(html, "gmail-web").html).toContain("radial-gradient");
  });
});
