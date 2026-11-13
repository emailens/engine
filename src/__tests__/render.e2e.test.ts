/**
 * Real-render validation (free ground truth): renders engine output in an
 * actual browser engine (Chromium/Blink, which is what Gmail web, Outlook.com,
 * the New Outlook and Superhuman actually use) and asserts the *rendered*
 * result, not our heuristics.
 *
 * OFF by default. Enable it either by:
 *   - Local browser:   bunx playwright install chromium && bun run test:render
 *   - Remote browser:  BROWSERLESS_WS='wss://host?token=…' bun run test:render
 *     (a self-hosted Browserless / any CDP endpoint, no local browser needed)
 *
 * Chromium covers ~most clients' engines for free; WebKit (Apple Mail, HEY,
 * Proton, Outlook for Mac) and Gecko (Thunderbird) are also free in Playwright
 * and can be added the same way. Only Outlook Classic (Word engine) has no free
 * proxy.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { transformForClient, checkOverflow, checkVisual } from "../index";
import { applyClientMutations } from "../design/shell";
import type { Browser } from "playwright";

const REMOTE_WS =
  process.env.BROWSERLESS_URL ||
  process.env.BROWSERLESS_WS ||
  process.env.PLAYWRIGHT_WS_ENDPOINT;
// Only on explicit opt-in (the `test:render` script), never merely because a
// BROWSERLESS_URL sits in an auto-loaded .env, otherwise `bun test` would try
// to reach a browser. The endpoint is just the target once enabled.
const ENABLED = process.env.RENDER_TESTS === "1";
const suite = ENABLED ? describe : describe.skip;

suite("real-render validation (Playwright / Chromium)", () => {
  let browser: Browser | null = null;

  beforeAll(async () => {
    const { chromium } = await import("playwright");
    if (REMOTE_WS) {
      // Connect to a remote Chromium. Browserless exposes both a CDP endpoint
      // and a Playwright-protocol endpoint: try CDP first, fall back to the
      // Playwright protocol, so either configured URL works.
      try {
        browser = await chromium.connectOverCDP(REMOTE_WS);
      } catch {
        browser = await chromium.connect(REMOTE_WS);
      }
      return;
    }
    // Bounded local launch so a browser-less machine fails fast with a clear
    // message instead of hanging.
    const launch = chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Chromium launch timed out, install a local browser (`bunx playwright install chromium`) or set BROWSERLESS_WS to a remote endpoint.")), 20000),
    );
    browser = await Promise.race([launch, timeout]);
  }, 45000); // remote CDP handshake can exceed the default 5s hook timeout

  afterAll(async () => {
    await browser?.close();
  }, 15000);

  test("a fixed width wider than the frame really overflows a mobile viewport", async () => {
    const html = `<table width="900"><tr><td>wide content</td></tr></table>`;
    // Engine prediction:
    expect(checkOverflow(html).issues.some((i) => i.rule === "fixed-width-overflow")).toBe(true);
    // Real render at a 375px mobile viewport:
    const page = await browser!.newPage({ viewport: { width: 375, height: 800 } });
    await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    await page.close();
    expect(scrollW).toBeGreaterThan(clientW); // real horizontal overflow confirmed
  }, 30000);

  test("Gmail transform drops the gradient, so the warned button really has no background", async () => {
    const html = `<a href="#" style="background: linear-gradient(135deg,#2d1b4e,#4c1d95); color:#f0ece4; padding:14px 36px">Open Dashboard</a>`;
    // Engine warns it lacks a fallback:
    expect(checkVisual(html).issues.some((i) => i.rule === "missing-background-fallback")).toBe(true);
    // The Gmail app transform strips gradient backgrounds (Gmail webmail keeps them); render the result in Blink:
    const stripped = transformForClient(html, "gmail-android").html;
    const page = await browser!.newPage();
    await page.setContent(`<!doctype html><html><body>${stripped}</body></html>`);
    const bg = await page.$eval("a", (el) => getComputedStyle(el).backgroundColor);
    await page.close();
    // No real background remains → the missing-background-fallback warning is a true positive.
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(bg);
  }, 30000);
  // Gmail Android's reflow, measured on the worker's Gmail app (2026-11-13,
  // 396 CSS px view): a table that fits keeps its fixed image cells, and an
  // overflowing 600px table is squeezed to the screen while its image keeps
  // its width and only the text cell narrows. Our munge once shrank such
  // images to 56px and 26px (customer preview scored 49 for a non-issue).
  async function mungedImageWidths(html: string) {
    const page = await browser!.newPage({ viewport: { width: 396, height: 900 } });
    await page.setContent(applyClientMutations(html, "gmail-android"), { waitUntil: "load" });
    const out = await page.evaluate(() => ({
      imgs: [...document.images].map((i) => Math.round(i.getBoundingClientRect().width)),
      scrollW: document.documentElement.scrollWidth,
    }));
    await page.close();
    return out;
  }
  const IMG = (w: number, h: number) =>
    `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" width="${w}" height="${h}" style="display:block;width:${w}px;height:${h}px;border:0;">`;
  const TEXT = "<p>Body copy long enough to wrap over several lines in the text column next to the fixed image, so the column wants all the room it can get.</p>";

  test("Gmail Android keeps fixed image cells in an email that fits", async () => {
    // A loaded image with a % max-width counts as 0px wide when an auto table
    // sizes itself, so the nested centred shell collapses around it.
    const html = `<table width="100%"><tr><td align="center" style="padding:32px 12px"><table width="600" style="width:100%;max-width:600px"><tr><td style="padding:40px 7% 8px">
<table width="100%"><tr><td width="132" style="width:132px">${IMG(132, 176)}</td></tr></table>
</td></tr></table></td></tr></table>
<table width="100%" style="max-width:600px"><tr><td width="132" style="width:132px">${IMG(132, 176)}</td><td width="22" style="width:22px"></td><td>${TEXT}</td></tr></table>
<table width="100%" style="max-width:500px"><tr><td width="100" style="width:100px">${IMG(96, 96)}</td><td width="10" style="width:10px;border-left:1px solid #222"></td><td>longaddress.sales.department@example-company-domain.com</td></tr></table>`;
    expect((await mungedImageWidths(html)).imgs).toEqual([132, 132, 96]);
  }, 30000);

  test("Gmail Android squeezes an overflowing table to the screen, image intact", async () => {
    const html = `<table width="600" style="width:600px"><tr><td width="180" style="width:180px;padding:20px">${IMG(180, 180)}</td><td width="380" style="width:380px">${TEXT}</td></tr></table>`;
    const { imgs, scrollW } = await mungedImageWidths(html);
    expect(imgs).toEqual([180]);
    expect(scrollW).toBeLessThanOrEqual(396);
  }, 30000);
});

