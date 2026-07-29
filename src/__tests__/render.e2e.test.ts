/**
 * Real-render validation (free ground truth) — renders engine output in an
 * actual browser engine (Chromium/Blink, which is what Gmail web, Outlook.com,
 * the New Outlook and Superhuman actually use) and asserts the *rendered*
 * result, not our heuristics.
 *
 * OFF by default. Enable it either by:
 *   - Local browser:   bunx playwright install chromium && bun run test:render
 *   - Remote browser:  BROWSERLESS_WS='wss://host?token=…' bun run test:render
 *     (a self-hosted Browserless / any CDP endpoint — no local browser needed)
 *
 * Chromium covers ~most clients' engines for free; WebKit (Apple Mail, HEY,
 * Proton, Outlook for Mac) and Gecko (Thunderbird) are also free in Playwright
 * and can be added the same way. Only Outlook Classic (Word engine) has no free
 * proxy.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { transformForClient, checkOverflow, checkVisual } from "../index";
import type { Browser } from "playwright";

const REMOTE_WS =
  process.env.BROWSERLESS_URL ||
  process.env.BROWSERLESS_WS ||
  process.env.PLAYWRIGHT_WS_ENDPOINT;
// Only on explicit opt-in (the `test:render` script), never merely because a
// BROWSERLESS_URL sits in an auto-loaded .env — otherwise `bun test` would try
// to reach a browser. The endpoint is just the target once enabled.
const ENABLED = process.env.RENDER_TESTS === "1";
const suite = ENABLED ? describe : describe.skip;

suite("real-render validation (Playwright / Chromium)", () => {
  let browser: Browser | null = null;

  beforeAll(async () => {
    const { chromium } = await import("playwright");
    if (REMOTE_WS) {
      // Connect to a remote Chromium. Browserless exposes both a CDP endpoint
      // and a Playwright-protocol endpoint — try CDP first, fall back to the
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
      setTimeout(() => reject(new Error("Chromium launch timed out — install a local browser (`bunx playwright install chromium`) or set BROWSERLESS_WS to a remote endpoint.")), 20000),
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
    // Gmail's transform strips gradient backgrounds; render the result in Blink (Gmail's engine):
    const stripped = transformForClient(html, "gmail-web").html;
    const page = await browser!.newPage();
    await page.setContent(`<!doctype html><html><body>${stripped}</body></html>`);
    const bg = await page.$eval("a", (el) => getComputedStyle(el).backgroundColor);
    await page.close();
    // No real background remains → the missing-background-fallback warning is a true positive.
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(bg);
  }, 30000);
});
