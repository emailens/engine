import * as cheerio from "cheerio";
import type { AccessibilityIssue, AccessibilityReport } from "./types";

const GENERIC_LINK_TEXT = new Set([
  "click here", "here", "read more", "learn more", "more",
  "link", "this link", "click", "tap here", "this",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeElement($: cheerio.CheerioAPI, el: any): string {
  const tag = (el.tagName as string)?.toLowerCase() || "unknown";
  const src = $(el).attr("src");
  const href = $(el).attr("href");
  if (src) return `<${tag} src="${src.slice(0, 60)}${src.length > 60 ? "..." : ""}">`;
  if (href) return `<${tag} href="${href.slice(0, 60)}${href.length > 60 ? "..." : ""}">`;
  const text = $(el).text().trim().slice(0, 40);
  if (text) return `<${tag}>${text}${$(el).text().trim().length > 40 ? "..." : ""}</${tag}>`;
  return `<${tag}>`;
}

function checkLangAttribute($: cheerio.CheerioAPI): AccessibilityIssue | null {
  const lang = $("html").attr("lang");
  if (!lang || !lang.trim()) {
    return {
      severity: "error",
      rule: "missing-lang",
      message: "Missing lang attribute on <html> element",
      details: 'Screen readers use the lang attribute to determine pronunciation. Add lang="en" (or appropriate language code).',
    };
  }
  return null;
}

function checkTitle($: cheerio.CheerioAPI): AccessibilityIssue | null {
  const title = $("title").text().trim();
  if (!title) {
    return {
      severity: "warning",
      rule: "missing-title",
      message: "Missing or empty <title> element",
      details: "The <title> helps screen readers identify the email content.",
    };
  }
  return null;
}

function checkImageAlt($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    const src = $(el).attr("src") || "";
    const role = $(el).attr("role");

    if (role === "presentation" || role === "none") return;

    if (alt === undefined) {
      issues.push({
        severity: "error",
        rule: "img-missing-alt",
        message: "Image missing alt attribute",
        element: describeElement($, el),
        details: 'Every image must have an alt attribute. Use alt="" for decorative images.',
      });
    } else if (alt.trim() === "") {
      const isLikelyContent =
        !src.includes("spacer") &&
        !src.includes("pixel") &&
        !src.includes("tracking") &&
        !src.includes("1x1") &&
        !src.includes("transparent");

      if (isLikelyContent && ($(el).attr("width") || "0") !== "1") {
        issues.push({
          severity: "info",
          rule: "img-empty-alt",
          message: "Image has empty alt text — verify it is decorative",
          element: describeElement($, el),
          details: "Empty alt is correct for decorative images, but content images need descriptive alt text.",
        });
      }
    } else if (/\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(alt)) {
      issues.push({
        severity: "error",
        rule: "img-filename-alt",
        message: "Image alt text is a filename, not a description",
        element: describeElement($, el),
        details: `Alt "${alt}" should describe the image content, not the file name.`,
      });
    }
  });

  return issues;
}

function checkLinkAccessibility($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  $("a").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const ariaLabel = $(el).attr("aria-label");
    const title = $(el).attr("title");
    const imgAlt = $(el).find("img").attr("alt");

    if (!text && !ariaLabel && !title && !imgAlt) {
      issues.push({
        severity: "error",
        rule: "link-no-accessible-name",
        message: "Link has no accessible name",
        element: describeElement($, el),
        details: "Links need visible text, aria-label, or an image with alt text.",
      });
      return;
    }

    if (text && GENERIC_LINK_TEXT.has(text) && !ariaLabel) {
      issues.push({
        severity: "warning",
        rule: "link-generic-text",
        message: `Link text "${$(el).text().trim()}" is not descriptive`,
        element: describeElement($, el),
        details: "Screen readers often list links out of context. Use text that describes the destination.",
      });
    }
  });

  return issues;
}

function checkTableAccessibility($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  $("table").each((_, el) => {
    const role = $(el).attr("role");
    const hasHeaders = $(el).find("th").length > 0;
    const looksLikeLayout = !hasHeaders;

    if (looksLikeLayout && role !== "presentation" && role !== "none") {
      const nestedTables = $(el).find("table").length;
      if (nestedTables > 0 || $(el).find("td").length > 2) {
        issues.push({
          severity: "info",
          rule: "table-missing-role",
          message: 'Layout table missing role="presentation"',
          element: `<table> with ${$(el).find("td").length} cells`,
          details: 'Add role="presentation" to tables used for layout so screen readers don\'t announce them as data tables.',
        });
      }
    }
  });

  return issues;
}

function checkColorContrast($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  let smallTextCount = 0;

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";

    const fontSizeMatch = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?)(px|pt)/i);
    if (fontSizeMatch) {
      const size = parseFloat(fontSizeMatch[1]);
      const unit = fontSizeMatch[2].toLowerCase();
      const pxSize = unit === "pt" ? size * 1.333 : size;

      if (pxSize < 10 && pxSize > 0) {
        smallTextCount++;
        if (smallTextCount <= 3) {
          issues.push({
            severity: "warning",
            rule: "small-text",
            message: `Very small text (${fontSizeMatch[0].trim()})`,
            element: describeElement($, el),
            details: "Text smaller than 10px is difficult to read, especially on mobile devices.",
          });
        }
      }
    }
  });

  if (smallTextCount > 3) {
    issues.push({
      severity: "warning",
      rule: "small-text-multiple",
      message: `${smallTextCount} elements with text smaller than 10px`,
      details: "Consider using a minimum font size of 12-14px for readability.",
    });
  }

  return issues;
}

function checkSemanticStructure($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = parseInt(el.tagName.replace(/h/i, ""), 10);
    headings.push({ level, text: $(el).text().trim().slice(0, 60) });
  });

  for (let i = 1; i < headings.length; i++) {
    const gap = headings[i].level - headings[i - 1].level;
    if (gap > 1) {
      issues.push({
        severity: "info",
        rule: "heading-skip",
        message: `Heading level skipped: h${headings[i - 1].level} to h${headings[i].level}`,
        details: "Skipped heading levels can confuse screen readers. Use sequential heading levels.",
      });
      break;
    }
  }

  return issues;
}

/**
 * Audit an HTML email for accessibility issues.
 *
 * Checks for missing lang attributes, image alt text, small fonts,
 * layout table roles, link accessibility, heading hierarchy, and
 * color contrast. Returns a 0–100 score and detailed issues.
 */
export function checkAccessibility(html: string): AccessibilityReport {
  if (!html || !html.trim()) {
    return { score: 100, issues: [] };
  }

  const $ = cheerio.load(html);
  const issues: AccessibilityIssue[] = [];

  const langIssue = checkLangAttribute($);
  if (langIssue) issues.push(langIssue);

  const titleIssue = checkTitle($);
  if (titleIssue) issues.push(titleIssue);

  issues.push(...checkImageAlt($));
  issues.push(...checkLinkAccessibility($));
  issues.push(...checkTableAccessibility($));
  issues.push(...checkColorContrast($));
  issues.push(...checkSemanticStructure($));

  let penalty = 0;
  for (const issue of issues) {
    switch (issue.severity) {
      case "error": penalty += 12; break;
      case "warning": penalty += 6; break;
      case "info": penalty += 2; break;
    }
  }

  const score = Math.max(0, 100 - penalty);
  return { score, issues };
}
