import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { checkDesign, checkDesignAcross, openBrowser } from "../design/check";

// The design check draws the email twice in a real browser: as the client's
// live preview and as its author designed it. These run a local Chromium
// (playwright-core's), the path the CLI and the MCP take without
// BROWSERLESS_URL.

const page = (body: string, style = "") =>
  `<!doctype html><html><head><style>${style}</style></head><body style="margin:0;font-family:Arial,sans-serif">${body}</body></html>`;

// Two columns laid out by flexbox. Classic Outlook (Word) has no flexbox, so
// the columns stack: the design is broken there.
const FLEX = page(
  `<div class="row" style="display:flex;width:600px">
     <div style="width:300px;background:#1d4ed8;color:#fff;padding:20px;font-size:16px">Left column copy</div>
     <div style="width:300px;background:#f59e0b;padding:20px;font-size:16px;color:#111111">Right column copy</div>
   </div>`,
);

// A plain table email Apple Mail draws as written. (Gmail is not the
// control: it gives every cell a 24px line height, a real change.)
const TABLE = page(
  `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px">
     <tr><td style="padding:24px;font-size:16px;color:#111111">Hello, your order has shipped.</td></tr>
   </table>`,
);

let browser: Awaited<ReturnType<typeof openBrowser>>;
beforeAll(async () => {
  browser = await openBrowser();
});
afterAll(async () => {
  await browser?.close();
});

describe("checkDesign", () => {
  test("columns that stack in Classic Outlook break the design", async () => {
    const r = await checkDesign(browser, FLEX, "outlook-windows-legacy");
    expect(r?.verdict).toBe("broken");
    expect(r?.reasons.join(" ")).toContain("Columns");
  }, 60_000);

  test("a plain table email is ready in Apple Mail", async () => {
    const r = await checkDesign(browser, TABLE, "apple-mail-macos");
    expect(r?.verdict).toBe("kept");
    expect(r?.label).toBe("Ready");
  }, 60_000);

  test("Gmail's line height on a cell is a change, not a break", async () => {
    const r = await checkDesign(browser, TABLE, "gmail-web");
    expect(r?.verdict).toBe("changed");
    expect(r?.reasons[0]).toContain("line height");
  }, 60_000);

  test("an uncompiled source has no design to compare", async () => {
    expect(await checkDesign(browser, "<mjml><mj-body></mj-body></mjml>", "gmail-web")).toBeNull();
  });
});


describe("checkDesignAcross", () => {
  test("answers per client, in the order asked", async () => {
    const r = await checkDesignAcross(FLEX, ["apple-mail-macos", "outlook-windows-legacy"]);
    expect(r.map((x) => [x.clientId, x.verdict])).toEqual([
      ["apple-mail-macos", "kept"],
      ["outlook-windows-legacy", "broken"],
    ]);
  }, 60_000);
});
