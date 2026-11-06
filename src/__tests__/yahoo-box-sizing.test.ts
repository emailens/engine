import { describe, expect, it } from "bun:test";
import { transformForClient } from "../index";

// Real Yahoo Mail web, preview J9vFS4nm_LGl (run 8TpFj2Txs0To, 2026-10-30): a
// CTA with width:100%; padding:14px 16px; box-sizing:border-box came out 566
// CSS px wide in a 534px column (534 + 2 x 16), past the card. Yahoo ignores
// box-sizing, as caniemail lists. The apps are unobserved.
const html = `<div style="width:534px"><a href="#" style="display:block;width:100%;padding:14px 16px;box-sizing:border-box">Start</a></div>`;

describe("Yahoo Mail web ignores box-sizing", () => {
  it("strips box-sizing and keeps width and padding", () => {
    const out = transformForClient(html, "yahoo-mail").html;
    expect(out).not.toMatch(/box-sizing/);
    expect(out).toMatch(/width:\s*100%/);
    expect(out).toMatch(/padding:\s*14px 16px/);
  });

  it("leaves Yahoo's apps alone until they are measured", () => {
    expect(transformForClient(html, "yahoo-mail-android").html).toMatch(/box-sizing/);
  });
});
