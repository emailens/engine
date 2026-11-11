import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EMAIL_CLIENTS } from "../clients";
import { transformForClient } from "../transform";
import type { Framework } from "../types";
import { type DomNode, dumpDom, markPictures } from "./dom";
import { explainDesign } from "./explain";
import { hasDesign, type Kept, keptOf, type Verdict, verdictOf } from "./kept";
import { aligned, type Gap, type Gray, measureGap } from "./gap";
import { designDoc, emailWidth, frameOf, releaseImages, viewOf } from "./page";
import {
  mobileShrink,
  prepareIframeHtml,
  prepareWordSource,
  shrinkToFitStyle,
} from "./shell";

/**
 * Whether an email still looks like its design once a client has drawn it:
 * the verdict the Emailens email page shows (Ready / Needs work / Broken).
 * The engine builds the two pages and judges them; a browser lays them out,
 * because only a browser knows where each box lands.
 *
 * DOM only, as on the email page: no pixel diff (the app adds one server
 * side, which needs sharp).
 */

// A made-up origin both pages are served from, so the font stand-ins'
// /fonts/ addresses resolve; nothing is ever sent to it.
const APP = "https://app.emailens.test";
const FONTS_FROM = "https://app.emailens.dev/fonts/";
const FONT_CACHE = join(homedir(), ".cache", "emailens", "fonts");
const CONNECT_TIMEOUT_MS = 15_000;

export const VERDICT_LABEL: Record<Verdict, string> = {
  kept: "Ready",
  changed: "Needs work",
  broken: "Broken",
};

export interface DesignResult {
  clientId: string;
  name: string;
  verdict: Verdict;
  label: string;
  sentence: string;
  reasons: string[];
  more: number;
  /** Share of pixels off between the two shots; absent without sharp. */
  diff?: number;
  /** Whether the pixel fit found the offset; when not, `diff` is not to be trusted. */
  aligned?: boolean;
}

// sharp is an optional peer: without it the check is structure only, as the
// email page's (kappa 0.29 against the owner's grades, 0.48 with pixels).
type Sharp = (input: Buffer) => any;
let sharpP: Promise<Sharp | null> | undefined;
const loadSharp = () =>
  (sharpP ??= import("sharp").then(
    (m: any) => (m.default ?? m) as Sharp,
    () => null,
  ));

const MAX_HEIGHT = 5000;
// ponytail: the first 4000 CSS px only; a gap further down is rare and the
// fit costs grow with height (the app's real-checks/gap-images.ts).
const MAX_CSS_HEIGHT = 4000;

/** A PNG as measureGap reads it: greyscale, `cssPerPx` CSS px per pixel. */
async function gray(sharp: Sharp, png: Buffer, cssPerPx: number): Promise<Gray> {
  const img = sharp(png);
  const { width = 1, height = 1 } = await img.metadata();
  const rows = Math.min(height, Math.ceil(MAX_CSS_HEIGHT / cssPerPx));
  const { data, info } = await img
    .extract({ left: 0, top: 0, width, height: rows })
    .resize({ width: Math.max(1, Math.round(width * cssPerPx)) })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // greyscale() can still hand back one channel per colour; keep the first.
  const out = new Uint8Array(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * info.channels];
  return { data: out, width: info.width, height: info.height };
}

/** The page shot as wide as it draws and as tall, up to MAX_HEIGHT (the app's server.ts). */
async function shoot(page: any, minWidth: number): Promise<Buffer> {
  const [width, height] = (await page.evaluate(
    `[document.documentElement.scrollWidth, Math.ceil([...document.body.querySelectorAll("*")].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).reduce((m, r) => Math.max(m, r.bottom), 0) || document.body.scrollHeight)]`,
  )) as [number, number];
  // fullPage: Playwright clips to the 900px viewport otherwise, and an email
  // taller than that lost its lower half (Puppeteer's captureBeyondViewport,
  // which the app uses, has no such limit).
  return page.screenshot({
    fullPage: true,
    clip: {
      x: 0,
      y: 0,
      width: Math.max(minWidth, width),
      height: Math.min(Math.max(height, 1), MAX_HEIGHT),
    },
  });
}

// playwright-core is an optional peer: typed loosely, as screenshots.ts does.
type Browser = { newContext(o: object): Promise<any>; close(): Promise<void> };

/** Browserless when BROWSERLESS_URL is set, else a local Chromium. */
export async function openBrowser(): Promise<Browser> {
  let chromium: any;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch {
    throw new Error(
      'The design check needs "playwright-core" installed beside this package ' +
        "(npm install playwright-core), and a browser: a local Chromium " +
        "(npx playwright-core install chromium) or BROWSERLESS_URL.",
    );
  }
  const url = process.env.BROWSERLESS_URL;
  if (!url) {
    return chromium.launch().catch((e: Error) => {
      throw new Error(
        `No local Chromium (${e.message.split("\n")[0]}).\n` +
          "Set BROWSERLESS_URL to a Browserless instance, or install one: npx playwright-core install chromium",
      );
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    chromium.connectOverCDP(url),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Browserless connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s. Check BROWSERLESS_URL.`)),
        CONNECT_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/** A font stand-in, from the cache or fetched once from the app. */
async function font(name: string): Promise<Buffer | null> {
  const file = join(FONT_CACHE, name);
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(FONTS_FROM + name).catch(() => null);
  if (!res?.ok) return null;
  const body = Buffer.from(await res.arrayBuffer());
  mkdirSync(FONT_CACHE, { recursive: true });
  writeFileSync(file, body);
  return body;
}

async function serve(route: any, doc: string) {
  const url: string = route.request().url();
  if (url === `${APP}/page`)
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: doc });
  if (url.startsWith(`${APP}/fonts/`)) {
    const name = url.slice(`${APP}/fonts/`.length);
    // ponytail: a stand-in name is [a-z0-9-]+.woff2; anything else is refused.
    const body = /^[a-z0-9-]+\.woff2$/.test(name) ? await font(name) : null;
    return body
      ? route.fulfill({ contentType: "font/woff2", body })
      : route.fulfill({ status: 404, body: "" });
  }
  // The email's own images and stylesheets load: the design depends on them.
  // The browser is the user's own, so only non-web schemes are refused.
  return /^https?:\/\//i.test(url) ? route.continue() : route.abort();
}

/** A page of `doc` at `width`, scripts off, loaded with its fonts. */
async function open(browser: Browser, doc: string, width: number, scale: number) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: scale,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.route("**/*", (route: any) => serve(route, doc).catch(() => {}));
  await page.goto(`${APP}/page`, { waitUntil: "load", timeout: 30_000 }).catch(() => {});
  await page.evaluate("document.fonts.ready");
  return { page, close: () => context.close() };
}

/** As the app's server check: the design shot and brought to the client's size. */
async function pixelGap(sharp: Sharp, simPng: Buffer, designPage: any, width: number, zoom: number) {
  return measureGap(
    await gray(sharp, simPng, 1 / 2),
    await gray(sharp, await shoot(designPage, width), zoom / 2),
  );
}

/** The client's live preview, drawn and read: its DOM, its frame, its shot. */
async function drawSim(
  browser: Browser,
  transformed: string,
  clientId: string,
  width: number,
  sharp: Sharp | null,
) {
  const sim = await open(
    browser,
    prepareIframeHtml(transformed, clientId, false, false, { scaleToFit: true }),
    width,
    sharp ? 2 : 1,
  );
  try {
    const drawn = (await sim.page.evaluate(`(${emailWidth})(document)`)) as number;
    const fit = mobileShrink(clientId, width, drawn);
    if (fit.scale !== 1)
      await sim.page.evaluate(
        `document.head.insertAdjacentHTML("beforeend", ${JSON.stringify(shrinkToFitStyle(fit.naturalWidth, fit.scale))})`,
      );
    const root = `(document.querySelector(".emailens-shell") ?? document.body)`;
    const nodes = (await sim.page.evaluate(`(${dumpDom})(${root})`)) as DomNode[];
    const frame = (await sim.page.evaluate(`(${frameOf})(${root})`)) as { width: number; zoom: number };
    const png = sharp ? await shoot(sim.page, width) : null;
    return { nodes, frame, png };
  } finally {
    await sim.close();
  }
}

/** The verdict with its words, and the pixel numbers when there were shots. */
function resultOf(
  clientId: string,
  name: string,
  kept: Kept,
  gap: Gap | null,
): DesignResult {
  const verdict = verdictOf(kept, gap?.diff);
  return {
    clientId,
    name,
    verdict,
    label: VERDICT_LABEL[verdict],
    ...explainDesign({ verdict, kept }, name),
    ...(gap ? { diff: +gap.diff.toFixed(4), aligned: aligned(gap) } : {}),
  };
}

/**
 * `clientId`'s live preview of `html` against `html` itself, as the email
 * page judges it, plus the pixel line when sharp is installed (as the app's
 * server check). Null when the email has no design to compare.
 */
export async function checkDesign(
  browser: Browser,
  html: string,
  clientId: string,
  framework?: Framework,
): Promise<DesignResult | null> {
  if (!hasDesign(html)) return null;
  const name = EMAIL_CLIENTS.find((c) => c.id === clientId)?.name ?? clientId;
  const transformed = transformForClient(prepareWordSource(html), clientId, framework).html;
  const { width } = viewOf(clientId);
  const sharp = await loadSharp();
  const sim = await drawSim(browser, transformed, clientId, width, sharp);
  const { doc, fits } = designDoc(html, clientId, sim.frame.width);
  // Shots at 2x, as the app's server check takes them; 1x when not shot.
  const design = await open(browser, doc, width, sharp ? 2 : 1);
  try {
    if (fits) await design.page.evaluate(`(${releaseImages})(document, ${sim.frame.width})`);
    const nodes = (await design.page.evaluate(
      `(${markPictures})(document.body, (${dumpDom})(document.body))`,
    )) as DomNode[];
    const zoom = sim.frame.zoom || 1;
    const gap = sharp && sim.png ? await pixelGap(sharp, sim.png, design.page, width, zoom) : null;
    return resultOf(clientId, name, keptOf(nodes, sim.nodes, zoom), gap);
  } finally {
    await design.close();
  }
}

/**
 * Every client in `clientIds`, `parallel` at a time (each is two browser
 * contexts), on one browser opened and closed here. In `clientIds` order;
 * empty when the email has no design to compare.
 */
export async function checkDesignAcross(
  html: string,
  clientIds: string[],
  opts: {
    framework?: Framework;
    parallel?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<DesignResult[]> {
  const browser = await openBrowser();
  try {
    const out = new Map<string, DesignResult>();
    const queue = [...clientIds];
    let done = 0;
    const work = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const r = await checkDesign(browser, html, id, opts.framework);
        if (r) out.set(id, r);
        opts.onProgress?.(++done, clientIds.length);
      }
    };
    await Promise.all(Array.from({ length: opts.parallel ?? 4 }, work));
    return clientIds.flatMap((id) => out.get(id) ?? []);
  } finally {
    await browser.close();
  }
}
