import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EMAIL_CLIENTS } from "../clients";
import { transformForClient } from "../transform";
import type { Framework } from "../types";
import { type DomNode, dumpDom, markPictures } from "./dom";
import { explainDesign } from "./explain";
import { hasDesign, keptOf, type Verdict, verdictOf } from "./kept";
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
      'The design check needs "playwright-core", which is not bundled. Either:\n' +
        "  npx -p @emailens/cli -p playwright-core emailens design <file>\n" +
        "  npm install -g @emailens/cli playwright-core",
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
async function open(browser: Browser, doc: string, width: number) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.route("**/*", (route: any) => serve(route, doc).catch(() => {}));
  await page.goto(`${APP}/page`, { waitUntil: "load", timeout: 30_000 }).catch(() => {});
  await page.evaluate("document.fonts.ready");
  return { page, close: () => context.close() };
}

/**
 * `clientId`'s live preview of `html` against `html` itself, as the email
 * page judges it. Null when the email has no design to compare (plain text).
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
  const vp = viewOf(clientId);
  const sim = await open(
    browser,
    prepareIframeHtml(transformed, clientId, false, false, { scaleToFit: true }),
    vp.width,
  );
  try {
    const drawn = (await sim.page.evaluate(`(${emailWidth})(document)`)) as number;
    const fit = mobileShrink(clientId, vp.width, drawn);
    if (fit.scale !== 1)
      await sim.page.evaluate(
        `document.head.insertAdjacentHTML("beforeend", ${JSON.stringify(shrinkToFitStyle(fit.naturalWidth, fit.scale))})`,
      );
    const root = `(document.querySelector(".emailens-shell") ?? document.body)`;
    const simNodes = (await sim.page.evaluate(`(${dumpDom})(${root})`)) as DomNode[];
    const frame = (await sim.page.evaluate(`(${frameOf})(${root})`)) as { width: number; zoom: number };
    const { doc, fits } = designDoc(html, clientId, frame.width);
    const design = await open(browser, doc, vp.width);
    try {
      if (fits) await design.page.evaluate(`(${releaseImages})(document, ${frame.width})`);
      const nodes = (await design.page.evaluate(
        `(${markPictures})(document.body, (${dumpDom})(document.body))`,
      )) as DomNode[];
      const kept = keptOf(nodes, simNodes, frame.zoom || 1);
      const verdict = verdictOf(kept);
      const why = explainDesign({ verdict, kept }, name);
      return { clientId, name, verdict, label: VERDICT_LABEL[verdict], ...why };
    } finally {
      await design.close();
    }
  } finally {
    await sim.close();
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
