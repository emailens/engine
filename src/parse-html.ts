import type { CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import { MAX_HTML_SIZE } from "./constants";

/** Options shared by every entry point that parses HTML. */
export interface ParseOptions {
  /**
   * Record source positions so issues carry a `loc`. Costs a little parse time
   * (parse5 tracks a location record per node and per attribute), so it is
   * opt-in for callers that need to point at the source: editors, CI
   * annotations, agents.
   */
  positions?: boolean;
}

/** Parse HTML, optionally with source positions. */
export function loadHtml(html: string, options?: ParseOptions): CheerioAPI {
  return options?.positions
    ? cheerio.load(html, { sourceCodeLocationInfo: true })
    : cheerio.load(html);
}

/**
 * Shared entry guard for the HTML analyzers. Returns `empty` for blank input,
 * throws past the size cap, otherwise parses once and hands the DOM (and the
 * raw html, for byte-length checks) to `fn`.
 */
export function fromHtml<T>(
  html: string,
  empty: T,
  fn: ($: CheerioAPI, html: string) => T,
  options?: ParseOptions,
): T {
  if (!html || !html.trim()) return empty;
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }
  return fn(loadHtml(html, options), html);
}
