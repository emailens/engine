import { describe, expect, test } from "bun:test";
import { checkDesignRetention, designFeatures } from "../index";

const doc = (head: string, body: string) =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const draft = doc(
  `<style>@media (max-width:600px){.c{width:100%!important}}
@media (prefers-color-scheme:dark){.bg{background:#000!important}}</style>`,
  `<table class="c bg" style="border-radius:12px;background:linear-gradient(#fff,#eee)"><tr><td>
<!--[if mso]><v:roundrect arcsize="10%"><![endif]--><a href="https://x.dev" style="border-radius:6px;box-shadow:0 1px 2px #000">Go</a>
<img src="https://x.dev/a.png" alt=""></td></tr></table>`,
);

describe("design retention", () => {
  test("counts what the design uses, resets excluded", () => {
    const f = designFeatures(draft);
    expect(f.rounded).toBe(2);
    expect(f.responsive).toBe(1);
    expect(f.darkMode).toBe(1);
    expect(f.gradient).toBe(1);
    expect(f.shadow).toBe(1);
    expect(f.outlookVml).toBe(1);
    expect(designFeatures(doc("", `<p style="border-radius:0;box-shadow:none">x</p>`))).toMatchObject({ rounded: 0, shadow: 0 });
  });

  test("an unchanged or richer revision reports nothing", () => {
    expect(checkDesignRetention(draft, draft)).toEqual([]);
    expect(checkDesignRetention(doc("", "<p>x</p>"), draft)).toEqual([]);
  });

  test("deleting @media, dark mode and corners to clear findings is reported", () => {
    const flattened = draft
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/border-radius:\d+px;?/g, "");
    const removed = checkDesignRetention(draft, flattened).map((r) => r.feature);
    expect(removed.sort()).toEqual(["darkMode", "responsive", "rounded"]);
    expect(checkDesignRetention(draft, flattened)[0].message).toContain("Restore");
  });

  test("deleting the Outlook VML is a removal too", () => {
    const noVml = draft.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/, "");
    expect(checkDesignRetention(draft, noVml).map((r) => r.feature)).toEqual(["outlookVml"]);
  });

  test("a small cut is editing, a cut to half or less is reported", () => {
    const imgs = (n: number) => doc("", '<img src="a.png" alt="">'.repeat(n));
    expect(checkDesignRetention(imgs(4), imgs(3))).toEqual([]);
    expect(checkDesignRetention(imgs(2), imgs(1))).toEqual([]);
    expect(checkDesignRetention(imgs(1), imgs(0))[0]).toMatchObject({ feature: "image", after: 0 });
    expect(checkDesignRetention(imgs(4), imgs(2))[0]).toMatchObject({ feature: "image", before: 4, after: 2 });
  });
});
