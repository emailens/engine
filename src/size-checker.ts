import type { CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import { MAX_HTML_SIZE, GMAIL_CLIP_THRESHOLD, GMAIL_CLIP_WARNING_THRESHOLD } from "./constants";
import type { SizeIssue, SizeReport } from "./types";

/**
 * Format bytes into a human-readable string.
 */
function humanizeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Check email HTML size for Gmail clipping issues.
 *
 * Accepts both Cheerio + raw HTML because byte length requires the raw
 * string (Cheerio serialization may differ from the original).
 *
 * @internal Used by audit pipeline with pre-parsed DOM.
 */
export function checkSizeFromDom(_$: CheerioAPI, html: string): SizeReport {
  const htmlBytes = new TextEncoder().encode(html).length;
  const humanSize = humanizeBytes(htmlBytes);
  const issues: SizeIssue[] = [];
  let clipped = false;

  if (htmlBytes > GMAIL_CLIP_THRESHOLD) {
    clipped = true;
    issues.push({
      rule: "gmail-clipped",
      severity: "error",
      message: `Email is ${humanSize} — Gmail will clip it at ~102 KB. Recipients see a "View entire message" link instead of your content.`,
      detail: `${htmlBytes} bytes exceeds the ${GMAIL_CLIP_THRESHOLD} byte threshold.`,
    });
  } else if (htmlBytes > GMAIL_CLIP_WARNING_THRESHOLD) {
    issues.push({
      rule: "gmail-clip-warning",
      severity: "warning",
      message: `Email is ${humanSize} — approaching Gmail's ~102 KB clip threshold. Consider trimming.`,
      detail: `${htmlBytes} bytes is within ${GMAIL_CLIP_THRESHOLD - htmlBytes} bytes of the clip threshold.`,
    });
  }

  return { htmlBytes, humanSize, clipped, issues };
}

/**
 * Check email HTML size for Gmail clipping issues.
 *
 * Returns byte count, human-readable size, clip status, and issues.
 * Gmail clips messages larger than ~102 KB, hiding content behind a
 * "View entire message" link.
 */
export function checkSize(html: string): SizeReport {
  if (!html || !html.trim()) {
    return { htmlBytes: 0, humanSize: "0 B", clipped: false, issues: [] };
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const $ = cheerio.load(html);
  return checkSizeFromDom($, html);
}
