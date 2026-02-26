import * as cheerio from "cheerio";
import type { SpamIssue, SpamReport } from "./types";

const SPAM_TRIGGER_PHRASES = [
  "act now", "limited time", "click here", "buy now", "order now",
  "don't miss", "don't delete", "urgent", "congratulations",
  "you've been selected", "you've won", "winner", "free gift",
  "risk free", "no obligation", "no cost", "no fees",
  "100% free", "100% satisfied", "double your money",
  "earn extra cash", "make money", "cash bonus",
  "as seen on", "incredible deal", "lowest price",
  "once in a lifetime", "special promotion", "this isn't spam",
  "what are you waiting for", "apply now", "sign up free",
  "cancel anytime", "no strings attached", "no questions asked",
];

const URL_SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
  "is.gd", "buff.ly", "rebrand.ly", "bl.ink", "short.io",
  "cutt.ly", "rb.gy",
];

const WEIGHTS: Record<string, number> = {
  "caps-ratio": 15,
  "excessive-punctuation": 10,
  "spam-phrases": 5,
  "missing-unsubscribe": 15,
  "hidden-text": 20,
  "url-shortener": 10,
  "image-only": 20,
  "high-image-ratio": 10,
  "deceptive-link": 15,
  "all-caps-subject": 10,
};

function extractVisibleText($: cheerio.CheerioAPI): string {
  const clone = $.root().clone();
  clone.find("script, style, head").remove();
  return clone.text().replace(/\s+/g, " ").trim();
}

function checkCapsRatio(text: string): SpamIssue | null {
  const words = text.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length < 5) return null;

  const capsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  const ratio = capsWords.length / words.length;

  if (ratio > 0.2) {
    return {
      rule: "caps-ratio",
      severity: "warning",
      message: `${Math.round(ratio * 100)}% of words are ALL CAPS — spam filters flag excessive capitalization.`,
      detail: `Found ${capsWords.length} of ${words.length} words in all caps.`,
    };
  }
  return null;
}

function checkExcessivePunctuation(text: string): SpamIssue | null {
  const exclamations = (text.match(/!/g) || []).length;
  const dollars = (text.match(/\$/g) || []).length;
  const total = exclamations + dollars;

  if (total > 5) {
    return {
      rule: "excessive-punctuation",
      severity: "warning",
      message: `Excessive special characters detected (${exclamations} "!", ${dollars} "$") — common spam trigger.`,
    };
  }
  return null;
}

function checkSpamPhrases(text: string): SpamIssue[] {
  const lower = text.toLowerCase();
  const found: SpamIssue[] = [];

  for (const phrase of SPAM_TRIGGER_PHRASES) {
    if (lower.includes(phrase)) {
      found.push({
        rule: "spam-phrases",
        severity: "info",
        message: `Contains spam trigger phrase: "${phrase}"`,
      });
    }
  }
  return found;
}

function checkUnsubscribe($: cheerio.CheerioAPI): SpamIssue | null {
  let hasUnsubscribe = false;

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().toLowerCase();
    if (
      text.includes("unsubscribe") ||
      href.toLowerCase().includes("unsubscribe") ||
      text.includes("opt out") ||
      text.includes("opt-out") ||
      href.toLowerCase().includes("opt-out") ||
      href.toLowerCase().includes("optout")
    ) {
      hasUnsubscribe = true;
    }
  });

  if (!hasUnsubscribe) {
    return {
      rule: "missing-unsubscribe",
      severity: "error",
      message: "No unsubscribe link found — required by CAN-SPAM and GDPR. Most spam filters penalize this.",
      detail: 'Add an <a> link with "unsubscribe" text or href.',
    };
  }
  return null;
}

function checkHiddenText($: cheerio.CheerioAPI): SpamIssue | null {
  let found = false;
  let detail = "";

  $("[style]").each((_, el) => {
    const style = ($(el).attr("style") || "").toLowerCase();
    const text = $(el).text().trim();
    if (!text) return;

    if (/font-size\s*:\s*0(?:px|em|rem|pt)?(?:\s|;|$)/.test(style)) {
      found = true;
      detail = "font-size:0 on element with text content";
      return false;
    }
    if (/visibility\s*:\s*hidden/.test(style)) {
      found = true;
      detail = "visibility:hidden on element with text content";
      return false;
    }
    if (/display\s*:\s*none/.test(style)) {
      found = true;
      detail = "display:none on element with text content";
      return false;
    }
  });

  if (found) {
    return {
      rule: "hidden-text",
      severity: "error",
      message: "Hidden text detected — major spam filter red flag.",
      detail,
    };
  }
  return null;
}

function checkUrlShorteners($: cheerio.CheerioAPI): SpamIssue[] {
  const issues: SpamIssue[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    for (const shortener of URL_SHORTENERS) {
      if (href.includes(shortener) && !seen.has(shortener)) {
        seen.add(shortener);
        issues.push({
          rule: "url-shortener",
          severity: "warning",
          message: `URL shortener detected (${shortener}) — spam filters distrust shortened links.`,
          detail: href,
        });
      }
    }
  });
  return issues;
}

function checkImageToTextRatio($: cheerio.CheerioAPI): SpamIssue | null {
  const text = extractVisibleText($);
  const images = $("img").length;
  if (images === 0) return null;

  if (text.length < 50 && images > 0) {
    return {
      rule: "image-only",
      severity: "error",
      message: `Image-heavy email with almost no text (${text.length} chars, ${images} images) — likely to be flagged as spam or clipped.`,
    };
  }

  const ratio = images / (text.length / 100);
  if (ratio > 0.5 && images > 3) {
    return {
      rule: "high-image-ratio",
      severity: "warning",
      message: `High image-to-text ratio (${images} images for ${text.length} chars of text) — consider adding more text content.`,
    };
  }
  return null;
}

function checkDeceptiveLinks($: cheerio.CheerioAPI): SpamIssue[] {
  const issues: SpamIssue[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();

    if (/^https?:\/\/\S+/i.test(text) || /^www\.\S+/i.test(text)) {
      try {
        const textDomain = new URL(
          text.startsWith("www.") ? `https://${text}` : text
        ).hostname.replace(/^www\./, "");
        const hrefDomain = new URL(href).hostname.replace(/^www\./, "");

        if (textDomain !== hrefDomain) {
          issues.push({
            rule: "deceptive-link",
            severity: "error",
            message: `Link text shows "${textDomain}" but links to "${hrefDomain}" — phishing red flag.`,
            detail: `Text: ${text}\nHref: ${href}`,
          });
        }
      } catch {
        // Malformed URL, skip
      }
    }
  });
  return issues;
}

function checkAllCapsTitle($: cheerio.CheerioAPI): SpamIssue | null {
  const title = $("title").text().trim();
  if (title.length > 5 && title === title.toUpperCase() && /[A-Z]/.test(title)) {
    return {
      rule: "all-caps-subject",
      severity: "warning",
      message: "Email title/subject is ALL CAPS — common spam indicator.",
    };
  }
  return null;
}

/**
 * Analyze an HTML email for spam indicators.
 *
 * Returns a 0–100 score (100 = clean, 0 = very spammy) and an array
 * of issues found. Uses heuristic rules modeled after common spam
 * filter triggers (CAN-SPAM, GDPR, SpamAssassin patterns).
 */
export function analyzeSpam(html: string): SpamReport {
  if (!html || !html.trim()) {
    return { score: 100, level: "low", issues: [] };
  }

  const $ = cheerio.load(html);
  const text = extractVisibleText($);
  const issues: SpamIssue[] = [];

  const capsIssue = checkCapsRatio(text);
  if (capsIssue) issues.push(capsIssue);

  const punctIssue = checkExcessivePunctuation(text);
  if (punctIssue) issues.push(punctIssue);

  issues.push(...checkSpamPhrases(text));

  const unsubIssue = checkUnsubscribe($);
  if (unsubIssue) issues.push(unsubIssue);

  const hiddenIssue = checkHiddenText($);
  if (hiddenIssue) issues.push(hiddenIssue);

  issues.push(...checkUrlShorteners($));

  const imageRatioIssue = checkImageToTextRatio($);
  if (imageRatioIssue) issues.push(imageRatioIssue);

  issues.push(...checkDeceptiveLinks($));

  const capsTitle = checkAllCapsTitle($);
  if (capsTitle) issues.push(capsTitle);

  // Calculate score
  let penalty = 0;
  const seenRules = new Map<string, number>();

  for (const issue of issues) {
    const count = (seenRules.get(issue.rule) || 0) + 1;
    seenRules.set(issue.rule, count);
    const weight = WEIGHTS[issue.rule] || 5;

    if (issue.rule === "spam-phrases") {
      if (count <= 5) penalty += weight;
    } else if (issue.rule === "url-shortener" || issue.rule === "deceptive-link") {
      if (count <= 2) penalty += weight;
    } else {
      penalty += weight;
    }
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const level: SpamReport["level"] =
    score >= 70 ? "low" : score >= 40 ? "medium" : "high";

  return { score, level, issues };
}
