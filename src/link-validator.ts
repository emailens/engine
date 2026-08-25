import * as cheerio from "cheerio";
import type { LinkIssue, LinkReport } from "./types";
import { GENERIC_LINK_TEXT, EMPTY_LINKS } from "./constants";
import { fromHtml, type ParseOptions } from "./parse-html";
import { locOfAttr, locOfElement } from "./source-location";

function classifyHref(href: string): string {
  if (!href || !href.trim()) return "empty";
  const h = href.trim().toLowerCase();
  if (h.startsWith("https://")) return "https";
  if (h.startsWith("http://")) return "http";
  if (h.startsWith("mailto:")) return "mailto";
  if (h.startsWith("tel:")) return "tel";
  if (h.startsWith("#")) return "anchor";
  if (h.startsWith("javascript:")) return "javascript";
  if (h.startsWith("//")) return "protocol-relative";
  return "other";
}

function isPlaceholderHref(href: string): boolean {
  const h = href.trim().toLowerCase();
  return h === "#" || h === "" || h === "javascript:void(0)" || h === "javascript:;";
}

/**
 * Validate links from a pre-parsed email DOM.
 *
 * Accepts a Cheerio instance to avoid redundant HTML parsing when
 * called from `auditEmail()` or `createSession()`.
 *
 * @internal
 */
export function validateLinksFromDom($: cheerio.CheerioAPI): LinkReport {
  const issues: LinkIssue[] = [];
  const breakdown = { https: 0, http: 0, mailto: 0, tel: 0, anchor: 0, javascript: 0, protocolRelative: 0, other: 0 };

  const links = $("a");
  const totalLinks = links.length;

  if (totalLinks === 0) {
    issues.push({
      severity: "info",
      rule: "no-links",
      message: "Email contains no links",
    });
    return { totalLinks: 0, issues, breakdown };
  }

  const hrefCounts = new Map<string, number>();

  links.each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    const category = classifyHref(href);
    // Findings about the URL point at the href; findings about the link as a
    // whole (no href, no text) point at the opening tag.
    const elLoc = locOfElement(el);
    const hrefLoc = href ? locOfAttr(el, "href") : elLoc;

    // Count breakdown
    switch (category) {
      case "https": breakdown.https++; break;
      case "http": breakdown.http++; break;
      case "mailto": breakdown.mailto++; break;
      case "tel": breakdown.tel++; break;
      case "anchor": breakdown.anchor++; break;
      case "javascript": breakdown.javascript++; break;
      case "protocol-relative": breakdown.protocolRelative++; break;
      default: breakdown.other++; break;
    }

    // Track href occurrences for duplicate detection
    if (href && href.trim()) {
      hrefCounts.set(href, (hrefCounts.get(href) || 0) + 1);
    }

    // Empty or missing href
    if (!href || !href.trim()) {
      issues.push({
        severity: "error",
        rule: "empty-href",
        message: "Link has no href attribute",
        text: text.slice(0, 80) || "(no text)",
        ...(elLoc ? { loc: elLoc } : {}),
      });
      return;
    }

    // javascript: protocol (not placeholder)
    if (category === "javascript" && !isPlaceholderHref(href)) {
      issues.push({
        severity: "error",
        rule: "javascript-href",
        message: "Link uses javascript: protocol",
        href: href.slice(0, 100),
        text: text.slice(0, 80) || "(no text)",
        ...(hrefLoc ? { loc: hrefLoc } : {}),
      });
      return;
    }

    // Placeholder href
    if (isPlaceholderHref(href)) {
      issues.push({
        severity: "warning",
        rule: "placeholder-href",
        message: "Link has a placeholder href (# or javascript:void)",
        href,
        text: text.slice(0, 80) || "(no text)",
        ...(hrefLoc ? { loc: hrefLoc } : {}),
      });
      return;
    }

    // HTTP instead of HTTPS
    if (category === "http") {
      issues.push({
        severity: "warning",
        rule: "insecure-link",
        message: "Link uses HTTP instead of HTTPS",
        href: href.slice(0, 120),
        text: text.slice(0, 80) || "(no text)",
        ...(hrefLoc ? { loc: hrefLoc } : {}),
      });
    }

    // Protocol-relative URL
    if (category === "protocol-relative") {
      issues.push({
        severity: "warning",
        rule: "protocol-relative",
        message: "Protocol-relative URL may break in email clients; use https:// explicitly",
        href: href.slice(0, 120),
        text: text.slice(0, 80) || "(no text)",
        ...(hrefLoc ? { loc: hrefLoc } : {}),
      });
    }

    // Generic link text
    if (text && GENERIC_LINK_TEXT.has(text.toLowerCase())) {
      issues.push({
        severity: "warning",
        rule: "generic-link-text",
        message: `Link text "${text}" is vague; use descriptive text for accessibility and engagement`,
        href: href.slice(0, 120),
        text,
        ...(elLoc ? { loc: elLoc } : {}),
      });
    }

    // Link with no text and no aria-label
    if (!text && !$(el).attr("aria-label") && !$(el).find("img[alt]").length) {
      issues.push({
        severity: "error",
        rule: "empty-link-text",
        message: "Link has no visible text or aria-label",
        href: href.slice(0, 120),
        ...(elLoc ? { loc: elLoc } : {}),
      });
    }

    // mailto without address
    if (category === "mailto" && href.trim().toLowerCase() === "mailto:") {
      issues.push({
        severity: "error",
        rule: "empty-mailto",
        message: "mailto: link has no email address",
        href,
        text: text.slice(0, 80) || "(no text)",
        ...(hrefLoc ? { loc: hrefLoc } : {}),
      });
    }

    // tel: without number
    if (category === "tel" && href.trim().toLowerCase() === "tel:") {
      issues.push({
        severity: "error",
        rule: "empty-tel",
        message: "tel: link has no phone number",
        href,
        text: text.slice(0, 80) || "(no text)",
        ...(hrefLoc ? { loc: hrefLoc } : {}),
      });
    }

    // Very long URL
    if (href.length > 2000) {
      issues.push({
        severity: "info",
        rule: "long-url",
        message: "URL exceeds 2000 characters, may be truncated by some email clients",
        href: href.slice(0, 120) + "...",
        text: text.slice(0, 80) || "(no text)",
        ...(hrefLoc ? { loc: hrefLoc } : {}),
      });
    }
  });

  // Broken anchor detection: #id links where no matching id exists
  links.each((_, el) => {
    const href = $(el).attr("href") || "";
    const trimmed = href.trim();
    if (trimmed.startsWith("#") && trimmed.length > 1) {
      const targetId = trimmed.slice(1);
      const target = $(`[id="${targetId}"]`);
      const anchorLoc = locOfAttr(el, "href");
      if (target.length === 0) {
        issues.push({
          severity: "error",
          rule: "broken-anchor",
          message: `Anchor link "${trimmed}" points to an element that does not exist`,
          href: trimmed,
          text: $(el).text().trim().slice(0, 80) || "(no text)",
          ...(anchorLoc ? { loc: anchorLoc } : {}),
        });
      }
    }
  });

  // Duplicate link detection
  for (const [href, count] of hrefCounts) {
    if (count > 5) {
      issues.push({
        severity: "info",
        rule: "duplicate-links",
        message: `URL appears ${count} times; consider consolidating`,
        href: href.slice(0, 120),
      });
    }
  }

  return { totalLinks, issues, breakdown };
}

/**
 * Extract and validate all links from an HTML email.
 *
 * Performs static analysis only (no network requests). Checks for
 * empty/placeholder hrefs, javascript: protocol, insecure HTTP,
 * generic link text, accessibility issues, and more.
 */
export function validateLinks(html: string, options?: ParseOptions): LinkReport {
  return fromHtml(html, EMPTY_LINKS, validateLinksFromDom, options);
}
