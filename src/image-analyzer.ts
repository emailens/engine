import * as cheerio from "cheerio";
import type { ImageIssue, ImageInfo, ImageReport } from "./types";

const DATA_URI_WARN_BYTES = 100 * 1024;
const TOTAL_DATA_URI_WARN_BYTES = 500 * 1024;
const HIGH_IMAGE_COUNT = 10;

function estimateBase64Bytes(dataUri: string): number {
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx === -1) return 0;
  const payload = dataUri.slice(commaIdx + 1);
  return Math.floor((payload.length * 3) / 4);
}

function isTrackingPixel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: cheerio.Cheerio<any>,
): boolean {
  const width = el.attr("width");
  const height = el.attr("height");
  const style = (el.attr("style") || "").toLowerCase();

  if (width === "1" && height === "1") return true;
  if (width === "0" || height === "0") return true;

  if (
    style.includes("display:none") ||
    style.includes("display: none") ||
    style.includes("visibility:hidden") ||
    style.includes("visibility: hidden")
  ) {
    return true;
  }

  if (/width\s*:\s*1px/.test(style) && /height\s*:\s*1px/.test(style)) {
    return true;
  }

  return false;
}

function truncateSrc(src: string, max = 60): string {
  if (src.startsWith("data:")) {
    const semi = src.indexOf(";");
    return semi > 0 ? src.slice(0, semi + 1) + "base64,..." : "data:...";
  }
  return src.length > max ? src.slice(0, max - 3) + "..." : src;
}

/**
 * Analyze images in an HTML email for best practices.
 *
 * Checks for missing dimensions, oversized data URIs, missing alt
 * attributes, unsupported formats (WebP, SVG), tracking pixels,
 * missing display:block, and overall image heaviness.
 */
export function analyzeImages(html: string): ImageReport {
  if (!html || !html.trim()) {
    return { total: 0, totalDataUriBytes: 0, issues: [], images: [] };
  }

  const $ = cheerio.load(html);
  const issues: ImageIssue[] = [];
  const images: ImageInfo[] = [];
  let totalDataUriBytes = 0;

  $("img").each((_, el) => {
    const img = $(el);
    const src = img.attr("src") || "";
    const alt = img.attr("alt") ?? null;
    const width = img.attr("width") ?? null;
    const height = img.attr("height") ?? null;
    const style = (img.attr("style") || "").toLowerCase();
    const imgIssues: string[] = [];

    const tracking = isTrackingPixel(img);

    let dataUriBytes = 0;
    if (src.startsWith("data:")) {
      dataUriBytes = estimateBase64Bytes(src);
      totalDataUriBytes += dataUriBytes;
    }

    // Skip detailed checks for tracking pixels
    if (tracking) {
      images.push({
        src: truncateSrc(src),
        alt, width, height,
        isTrackingPixel: true,
        dataUriBytes,
        issues: ["tracking-pixel"],
      });
      return;
    }

    // Missing width/height
    if (!width && !height) {
      const hasStyleWidth = /width\s*:/.test(style);
      const hasStyleHeight = /height\s*:/.test(style);
      if (!hasStyleWidth && !hasStyleHeight) {
        imgIssues.push("missing-dimensions");
        issues.push({
          rule: "missing-dimensions",
          severity: "warning",
          message: "Image missing width/height attributes — causes layout shifts and Outlook rendering issues.",
          src: truncateSrc(src),
        });
      }
    }

    // Large data URI
    if (dataUriBytes > DATA_URI_WARN_BYTES) {
      const kb = Math.round(dataUriBytes / 1024);
      imgIssues.push("large-data-uri");
      issues.push({
        rule: "large-data-uri",
        severity: "warning",
        message: `Data URI is ${kb}KB — consider hosting the image externally to reduce email size.`,
        src: truncateSrc(src),
      });
    }

    // Missing alt
    if (alt === null) {
      imgIssues.push("missing-alt");
      issues.push({
        rule: "missing-alt",
        severity: "warning",
        message: "Image missing alt attribute — hurts deliverability and accessibility.",
        src: truncateSrc(src),
      });
    }

    // WebP format
    if (src.toLowerCase().endsWith(".webp") || src.includes("image/webp")) {
      imgIssues.push("webp-format");
      issues.push({
        rule: "webp-format",
        severity: "info",
        message: "WebP format detected — not supported by all email clients. Consider PNG or JPEG.",
        src: truncateSrc(src),
      });
    }

    // SVG format
    if (src.toLowerCase().endsWith(".svg") || src.includes("image/svg")) {
      imgIssues.push("svg-format");
      issues.push({
        rule: "svg-format",
        severity: "info",
        message: "SVG format detected — not supported by most email clients. Use PNG instead.",
        src: truncateSrc(src),
      });
    }

    // Missing display:block
    if (!style.includes("display:block") && !style.includes("display: block")) {
      imgIssues.push("missing-display-block");
      issues.push({
        rule: "missing-display-block",
        severity: "info",
        message: "Image without display:block — may cause unwanted gaps in Outlook.",
        src: truncateSrc(src),
      });
    }

    images.push({
      src: truncateSrc(src),
      alt, width, height,
      isTrackingPixel: false,
      dataUriBytes,
      issues: imgIssues,
    });
  });

  // Aggregate checks
  const nonTrackingImages = images.filter((i) => !i.isTrackingPixel);

  if (nonTrackingImages.length > HIGH_IMAGE_COUNT) {
    issues.push({
      rule: "high-image-count",
      severity: "info",
      message: `Email contains ${nonTrackingImages.length} images — heavy emails may be clipped or load slowly.`,
    });
  }

  const trackingPixels = images.filter((i) => i.isTrackingPixel);
  if (trackingPixels.length > 0) {
    issues.push({
      rule: "tracking-pixel",
      severity: "info",
      message: `${trackingPixels.length} tracking pixel${trackingPixels.length > 1 ? "s" : ""} detected.`,
    });
  }

  if (totalDataUriBytes > TOTAL_DATA_URI_WARN_BYTES) {
    const kb = Math.round(totalDataUriBytes / 1024);
    issues.push({
      rule: "total-data-uri-size",
      severity: "warning",
      message: `Total data URI size is ${kb}KB — consider hosting images externally to reduce email size.`,
    });
  }

  return { total: images.length, totalDataUriBytes, issues, images };
}
