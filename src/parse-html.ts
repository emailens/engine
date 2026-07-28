import type { CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import { MAX_HTML_SIZE } from "./constants";

/**
 * Shared entry guard for the HTML analyzers. Returns `empty` for blank input,
 * throws past the size cap, otherwise parses once and hands the DOM (and the
 * raw html, for byte-length checks) to `fn`.
 */
export function fromHtml<T>(
  html: string,
  empty: T,
  fn: ($: CheerioAPI, html: string) => T,
): T {
  if (!html || !html.trim()) return empty;
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }
  return fn(cheerio.load(html), html);
}
