import type { CheerioAPI } from "cheerio";
import {
  GMAIL_CLIP_THRESHOLD,
  GMAIL_CLIP_WARNING_THRESHOLD,
  GMAIL_STYLE_LIMIT,
  GMAIL_STYLE_WARNING_THRESHOLD,
  EMPTY_SIZE,
} from "./constants";
import { fromHtml } from "./parse-html";
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
export function checkSizeFromDom($: CheerioAPI, html: string): SizeReport {
  const htmlBytes = new TextEncoder().encode(html).length;
  // Summed across every <style>, because Gmail's ceiling is cumulative. A file
  // that stays under it in each block and crosses it in total is the case a
  // per-block count would call clean.
  const styleBytes = $("style")
    .toArray()
    .reduce((n, el) => n + new TextEncoder().encode($(el).text()).length, 0);
  const humanSize = humanizeBytes(htmlBytes);
  const issues: SizeIssue[] = [];
  let clipped = false;

  if (htmlBytes > GMAIL_CLIP_THRESHOLD) {
    clipped = true;
    issues.push({
      rule: "gmail-clipped",
      severity: "error",
      message: `Email is ${humanSize}; Gmail will clip it at ~102 KB. Recipients see a "View entire message" link instead of your content.`,
      detail: `${htmlBytes} bytes exceeds the ${GMAIL_CLIP_THRESHOLD} byte threshold.`,
    });
  } else if (htmlBytes > GMAIL_CLIP_WARNING_THRESHOLD) {
    issues.push({
      rule: "gmail-clip-warning",
      severity: "warning",
      message: `Email is ${humanSize}, approaching Gmail's ~102 KB clip threshold. Consider trimming.`,
      detail: `${htmlBytes} bytes is within ${GMAIL_CLIP_THRESHOLD - htmlBytes} bytes of the clip threshold.`,
    });
  }

  if (styleBytes > GMAIL_STYLE_LIMIT) {
    issues.push({
      rule: "gmail-style-truncated",
      severity: "error",
      message:
        `${humanizeBytes(styleBytes)} of CSS is past Gmail's 16 KB ceiling for ` +
        `<style>. Gmail keeps the rules before the limit and drops the rest, so ` +
        `the email renders with part of its CSS and no error anywhere.`,
      detail: `${styleBytes} bytes of CSS across all <style> elements exceeds the ${GMAIL_STYLE_LIMIT} byte limit.`,
    });
  } else if (styleBytes > GMAIL_STYLE_WARNING_THRESHOLD) {
    issues.push({
      rule: "gmail-style-warning",
      severity: "warning",
      message:
        `${humanizeBytes(styleBytes)} of CSS, approaching Gmail's 16 KB <style> ` +
        `ceiling. Past it, later rules are dropped silently.`,
      detail: `${styleBytes} bytes is within ${GMAIL_STYLE_LIMIT - styleBytes} bytes of the limit.`,
    });
  }

  return { htmlBytes, styleBytes, humanSize, clipped, issues };
}

/**
 * Check email HTML size for Gmail clipping issues.
 *
 * Returns byte count, human-readable size, clip status, and issues.
 * Gmail clips messages larger than ~102 KB, hiding content behind a
 * "View entire message" link.
 */
export function checkSize(html: string): SizeReport {
  return fromHtml(html, EMPTY_SIZE, checkSizeFromDom);
}
