import * as cheerio from "cheerio";
import type { SpamAnalysisOptions, SpamIssue, SpamReport } from "./types";

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

// Fix #6: Pre-compiled word-boundary regexes for spam phrases
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SPAM_PHRASE_PATTERNS: Map<string, RegExp> = new Map(
  SPAM_TRIGGER_PHRASES.map((phrase) => [
    phrase,
    new RegExp("\\b" + escapeRegex(phrase) + "\\b"),
  ]),
);

const URL_SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
  "is.gd", "buff.ly", "rebrand.ly", "bl.ink", "short.io",
  "cutt.ly", "rb.gy",
];

// Fix #2: Known ESP tracking domains
const ESP_TRACKING_DOMAINS = [
  "mailchi.mp", "list-manage.com", "click.mailchimp.com",
  "sendgrid.net", "click.sendgrid.net", "ct.sendgrid.net",
  "click.klaviyomail.com", "trk.klaviyo.com",
  "click.hubspotemail.net",
  "links.iterable.com", "track.customer.io",
  "go.pardot.com", "mailgun.org",
  "em.salesforce.com", "click.marketingcloud.com",
  "r.mail.yahoo.com", "t.dripemail2.com",
];

// Fix #4: Transactional email signal phrases
const TRANSACTIONAL_SIGNALS = [
  "reset your password", "password reset",
  "verify your email", "email verification",
  "order confirmation", "your order",
  "your receipt", "purchase confirmation",
  "verification code", "confirm your account",
  "your invoice", "shipping confirmation",
  "account activation", "security alert",
];

const TRANSACTIONAL_SIGNAL_PATTERN = new RegExp(
  TRANSACTIONAL_SIGNALS.map(escapeRegex).join("|"),
  "i",
);

// OTP-like pattern: standalone 4-8 digit codes
const OTP_PATTERN = /\b\d{4,8}\b/;

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

// Fix #5: Scale punctuation threshold by text length, exclude $digit patterns
function checkExcessivePunctuation(text: string): SpamIssue | null {
  const exclamations = (text.match(/!/g) || []).length;
  // Only count $ NOT followed by a digit (skip price patterns like $29)
  const dollars = (text.match(/\$(?!\d)/g) || []).length;
  const total = exclamations + dollars;

  const threshold = Math.max(5, Math.floor(text.length / 200));

  if (total > threshold) {
    return {
      rule: "excessive-punctuation",
      severity: "warning",
      message: `Excessive special characters detected (${exclamations} "!", ${dollars} "$") — common spam trigger.`,
    };
  }
  return null;
}

// Fix #6: Word-boundary matching for spam phrases
function checkSpamPhrases(text: string): SpamIssue[] {
  const lower = text.toLowerCase();
  const found: SpamIssue[] = [];

  for (const [phrase, pattern] of SPAM_PHRASE_PATTERNS) {
    if (pattern.test(lower)) {
      found.push({
        rule: "spam-phrases",
        severity: "info",
        message: `Contains spam trigger phrase: "${phrase}"`,
      });
    }
  }
  return found;
}

// Fix #4: Transactional exemption + options API for unsubscribe
function checkUnsubscribe(
  $: cheerio.CheerioAPI,
  text: string,
  options?: SpamAnalysisOptions,
): SpamIssue | null {
  // Explicit transactional type → skip entirely
  if (options?.emailType === "transactional") return null;

  // List-Unsubscribe header provided → satisfied
  if (options?.listUnsubscribeHeader?.trim()) return null;

  let hasUnsubscribe = false;

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const linkText = $(el).text().toLowerCase();
    if (
      linkText.includes("unsubscribe") ||
      href.toLowerCase().includes("unsubscribe") ||
      linkText.includes("opt out") ||
      linkText.includes("opt-out") ||
      href.toLowerCase().includes("opt-out") ||
      href.toLowerCase().includes("optout")
    ) {
      hasUnsubscribe = true;
    }
  });

  if (!hasUnsubscribe) {
    // Auto-detect transactional signals
    const lower = text.toLowerCase();
    const signalMatches = TRANSACTIONAL_SIGNALS.filter((s) =>
      lower.includes(s.toLowerCase()),
    );
    const hasOtp = OTP_PATTERN.test(text);
    const signalCount = signalMatches.length + (hasOtp ? 1 : 0);

    if (signalCount >= 2) {
      // Looks transactional — downgrade to info instead of error
      return {
        rule: "missing-unsubscribe",
        severity: "info",
        message:
          "No unsubscribe link found, but email appears transactional — may not be required.",
        detail: `Detected transactional signals: ${signalMatches.join(", ")}${hasOtp ? ", OTP code" : ""}`,
      };
    }

    return {
      rule: "missing-unsubscribe",
      severity: "error",
      message:
        "No unsubscribe link found — required by CAN-SPAM and GDPR. Most spam filters penalize this.",
      detail: 'Add an <a> link with "unsubscribe" text or href.',
    };
  }
  return null;
}

// Fix #1: Preheader exemption for hidden text
const PREHEADER_ACCESSORY_PATTERNS = [
  /max-height\s*:\s*0/,
  /overflow\s*:\s*hidden/,
  /mso-hide\s*:\s*all/,
  /opacity\s*:\s*0/,
  /color\s*:\s*transparent/,
  /line-height\s*:\s*0/,
];

function isLikelyPreheader(
  style: string,
  text: string,
): boolean {
  if (text.length > 200) return false;

  // Exempt only when preheader-specific accessory patterns are present
  return PREHEADER_ACCESSORY_PATTERNS.some((p) => p.test(style));
}

function checkHiddenText($: cheerio.CheerioAPI): SpamIssue | null {
  let found = false;
  let detail = "";

  $("[style]").each((_, el) => {
    const style = ($(el).attr("style") || "").toLowerCase();
    const text = $(el).text().trim();
    if (!text) return;

    // visibility:hidden is always flagged — no legitimate preheader use
    if (/visibility\s*:\s*hidden/.test(style)) {
      found = true;
      detail = "visibility:hidden on element with text content";
      return false;
    }

    if (/font-size\s*:\s*0(?:px|em|rem|pt)?(?:\s|;|$)/.test(style)) {
      if (!isLikelyPreheader(style, text)) {
        found = true;
        detail = "font-size:0 on element with text content";
        return false;
      }
    }

    if (/display\s*:\s*none/.test(style)) {
      if (!isLikelyPreheader(style, text)) {
        found = true;
        detail = "display:none on element with text content";
        return false;
      }
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

// Fix #3: Hostname matching instead of substring for URL shorteners
function checkUrlShorteners($: cheerio.CheerioAPI): SpamIssue[] {
  const issues: SpamIssue[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    let hostname: string;
    try {
      hostname = new URL(href).hostname.toLowerCase();
    } catch {
      return; // malformed URL, skip
    }

    for (const shortener of URL_SHORTENERS) {
      if (
        (hostname === shortener || hostname.endsWith("." + shortener)) &&
        !seen.has(shortener)
      ) {
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

// Fix #7: Accept pre-extracted text to avoid duplicate extractVisibleText call
function checkImageToTextRatio(
  $: cheerio.CheerioAPI,
  text: string,
): SpamIssue | null {
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

// Fix #2: ESP tracking domain allowlist + encoded destination heuristic
function isEspTrackingDomain(hostname: string): boolean {
  return ESP_TRACKING_DOMAINS.some(
    (esp) => hostname === esp || hostname.endsWith("." + esp),
  );
}

function hasEncodedDestination(href: string, textDomain: string): boolean {
  // Check if the href path/query contains the text domain URL-encoded
  const encoded = encodeURIComponent(textDomain);
  return href.includes(encoded) || href.includes(textDomain);
}

function checkDeceptiveLinks($: cheerio.CheerioAPI): SpamIssue[] {
  const issues: SpamIssue[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();

    if (/^https?:\/\/\S+/i.test(text) || /^www\.\S+/i.test(text)) {
      try {
        const textDomain = new URL(
          text.startsWith("www.") ? `https://${text}` : text,
        ).hostname.replace(/^www\./, "");
        const hrefDomain = new URL(href).hostname.replace(/^www\./, "");

        if (textDomain !== hrefDomain) {
          // Skip known ESP tracking domains
          if (isEspTrackingDomain(hrefDomain)) return;

          // Skip if href contains encoded destination (redirect wrapper)
          if (hasEncodedDestination(href, textDomain)) return;

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
 * Returns a 0-100 score (100 = clean, 0 = very spammy) and an array
 * of issues found. Uses heuristic rules modeled after common spam
 * filter triggers (CAN-SPAM, GDPR, SpamAssassin patterns).
 */
export function analyzeSpam(
  html: string,
  options?: SpamAnalysisOptions,
): SpamReport {
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

  const unsubIssue = checkUnsubscribe($, text, options);
  if (unsubIssue) issues.push(unsubIssue);

  const hiddenIssue = checkHiddenText($);
  if (hiddenIssue) issues.push(hiddenIssue);

  issues.push(...checkUrlShorteners($));

  // Fix #7: pass pre-extracted text instead of calling extractVisibleText again
  const imageRatioIssue = checkImageToTextRatio($, text);
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
      // info-level issues don't penalize score
      if (issue.severity !== "info") {
        penalty += weight;
      }
    }
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const level: SpamReport["level"] =
    score >= 70 ? "low" : score >= 40 ? "medium" : "high";

  return { score, level, issues };
}
