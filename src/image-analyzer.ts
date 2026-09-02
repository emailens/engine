import * as cheerio from "cheerio";
import { EMPTY_IMAGES } from "./constants";
import { fromHtml, type ParseOptions } from "./parse-html";
import { locOfAttr, locOfElement } from "./source-location";
import { IMAGE_SUPPORT } from "./rules/css-support";
import type { ImageFormat } from "./rules/css-support";
import { EMAIL_CLIENTS } from "./clients";
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

/**
 * File extension / data-URI mime → the caniemail image format key.
 *
 * caniemail grades every one of these per client, so the answer to "can I ship
 * an AVIF" is data, not a guess. `base64` is deliberately absent here: it is
 * not an extension. `imageFormats()` adds it from the data-URI marker instead,
 * because caniemail grades data-URI delivery as a row of its own (Gmail:
 * unsupported), separately from the format the URI carries.
 */
const IMAGE_FORMAT_BY_EXTENSION: Record<string, ImageFormat> = {
  apng: "apng",
  avif: "avif",
  bmp: "bmp",
  gif: "gif",
  hdr: "hdr",
  heic: "heif",
  heif: "heif",
  ico: "ico",
  jfif: "jpg",
  jpeg: "jpg",
  jpg: "jpg",
  mp4: "mp4",
  png: "png",
  svg: "svg",
  tif: "tiff",
  tiff: "tiff",
  webp: "webp",
};

/** Mime subtypes that are not spelled like their extension. */
const DATA_URI_MIME_ALIAS: Record<string, ImageFormat> = {
  "svg+xml": "svg",
  "x-icon": "ico",
  "vnd.microsoft.icon": "ico",
  "x-png": "png",
};

/** How each format reads in a sentence, and what to ship instead. */
const IMAGE_FORMAT_LABEL: Record<ImageFormat, string> = {
  apng: "Animated PNG",
  avif: "AVIF",
  base64: "Base64 (data URI)",
  bmp: "BMP",
  gif: "GIF",
  hdr: "HDR",
  heif: "HEIF",
  ico: "ICO",
  jpg: "JPEG",
  mp4: "Video-as-image (MP4)",
  png: "PNG",
  svg: "SVG",
  tiff: "TIFF",
  webp: "WebP",
};

const IMAGE_FORMAT_ADVICE: Partial<Record<ImageFormat, string>> = {
  apng: "Use a GIF for animation, or a static PNG.",
  avif: "Use PNG or JPEG.",
  base64: "Host the image and reference it by URL.",
  bmp: "Use PNG or JPEG.",
  hdr: "Use PNG or JPEG.",
  heif: "Use PNG or JPEG.",
  ico: "Use PNG.",
  mp4: "Use an animated GIF, or a static image linking to the video.",
  svg: "Use PNG instead.",
  tiff: "Use PNG or JPEG.",
  webp: "Use PNG or JPEG.",
};

/**
 * Which caniemail image formats a `src` uses. A data URI counts twice: once
 * for base64 delivery, once for the format it carries.
 */
function imageFormats(src: string): ImageFormat[] {
  const formats: ImageFormat[] = [];
  const lower = src.toLowerCase();

  if (lower.startsWith("data:")) {
    if (lower.includes(";base64")) formats.push("base64");
    const mime = /^data:image\/([a-z0-9.+-]+)/.exec(lower)?.[1];
    const fromMime = mime && (IMAGE_FORMAT_BY_EXTENSION[mime] ?? DATA_URI_MIME_ALIAS[mime]);
    if (fromMime) formats.push(fromMime);
    return formats;
  }

  // Ignore the query string and fragment: `photo.webp?v=2` is still a WebP.
  const path = lower.split(/[?#]/)[0];
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1];
  const fromExt = ext ? IMAGE_FORMAT_BY_EXTENSION[ext] : undefined;
  if (fromExt) formats.push(fromExt);
  return formats;
}

/**
 * The clients that cannot render a format. Both lists come out in
 * EMAIL_CLIENTS order, not ranked; it is the returned pair that is
 * severity-ordered. An empty `broken` means nobody is known to break on it.
 */
function clientsWithout(format: ImageFormat): { broken: string[]; partial: string[] } {
  const row = IMAGE_SUPPORT[format];
  const broken: string[] = [];
  const partial: string[] = [];
  if (!row) return { broken, partial };
  for (const client of EMAIL_CLIENTS) {
    if (row[client.id] === "unsupported") broken.push(client.name);
    else if (row[client.id] === "partial") partial.push(client.name);
  }
  // ponytail: no caniemail note here. A note belongs to one client, and this
  // message speaks for a list of them; an unattributed caveat reads as a fact
  // about all of them. The per-client detail lives in IMAGE_SUPPORT_NOTES.
  return { broken, partial };
}

/** "A, B and C" — or "A, B and 9 others" once a list stops being readable. */
function nameList(names: string[], max = 4): string {
  if (!names.length) return "no clients";
  if (names.length === 1) return names[0];
  if (names.length <= max) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  // Five broken clients is one over the cap, and "and 1 others" is the kind of
  // sentence that makes a reader distrust the number printed next to it.
  const rest = names.length - max;
  return `${names.slice(0, max).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
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
 * Analyze images from a pre-parsed email DOM.
 *
 * Accepts a Cheerio instance to avoid redundant HTML parsing when
 * called from `auditEmail()` or `createSession()`.
 *
 * @internal
 */
export function analyzeImagesFromDom($: cheerio.CheerioAPI): ImageReport {
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
    const elLoc = locOfElement(el);
    const srcLoc = src ? locOfAttr(el, "src") : elLoc;

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
          message: "Image missing width/height attributes, causes layout shifts and Outlook rendering issues.",
          src: truncateSrc(src),
          ...(elLoc ? { loc: elLoc } : {}),
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
        message: `Data URI is ${kb}KB; consider hosting the image externally to reduce email size.`,
        src: truncateSrc(src),
        ...(srcLoc ? { loc: srcLoc } : {}),
      });
    }

    // Missing alt
    if (alt === null) {
      imgIssues.push("missing-alt");
      issues.push({
        rule: "missing-alt",
        severity: "warning",
        message: "Image missing alt attribute, hurts deliverability and accessibility.",
        src: truncateSrc(src),
        ...(elLoc ? { loc: elLoc } : {}),
      });
    }

    // Image format support, per client, from caniemail. Formats nobody is
    // known to break on (PNG, JPEG, GIF) produce nothing.
    for (const format of imageFormats(src)) {
      const { broken, partial } = clientsWithout(format);
      if (!broken.length) continue;
      const label = IMAGE_FORMAT_LABEL[format] ?? format.toUpperCase();
      const advice = IMAGE_FORMAT_ADVICE[format];
      imgIssues.push(`${format}-format`);
      issues.push({
        rule: `${format}-format`,
        severity: "info",
        message:
          `${label} is not supported by ${nameList(broken)}` +
          ` (${broken.length} of ${EMAIL_CLIENTS.length} clients` +
          `${partial.length ? `, partial in ${partial.length} more` : ""}).` +
          `${advice ? ` ${advice}` : ""}`,
        src: truncateSrc(src),
        ...(srcLoc ? { loc: srcLoc } : {}),
      });
    }

    // Missing display:block
    if (!style.includes("display:block") && !style.includes("display: block")) {
      imgIssues.push("missing-display-block");
      issues.push({
        rule: "missing-display-block",
        severity: "info",
        message: "Image without display:block, may cause unwanted gaps in Outlook.",
        src: truncateSrc(src),
        ...(elLoc ? { loc: elLoc } : {}),
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
      message: `Email contains ${nonTrackingImages.length} images; heavy emails may be clipped or load slowly.`,
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
      message: `Total data URI size is ${kb}KB; consider hosting images externally to reduce email size.`,
    });
  }

  return { total: images.length, totalDataUriBytes, issues, images };
}

/**
 * Analyze images in an HTML email for best practices.
 *
 * Checks for missing dimensions, oversized data URIs, missing alt
 * attributes, image formats the target clients cannot render, tracking
 * pixels, missing display:block, and overall image heaviness.
 */
export function analyzeImages(html: string, options?: ParseOptions): ImageReport {
  return fromHtml(html, EMPTY_IMAGES, analyzeImagesFromDom, options);
}
