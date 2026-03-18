import * as cheerio from "cheerio";

/**
 * Convert HTML email to plain text suitable for multipart/alternative emails.
 * Uses cheerio for parsing (already a dependency — no new deps needed).
 */
export function toPlainText(html: string): string {
  const $ = cheerio.load(html);

  // Remove elements that should not appear in plain text
  $("style, script").remove();
  $("[data-skip-in-text='true']").remove();

  // Convert <hr> to ---
  $("hr").replaceWith("\n---\n");

  // Convert <br> to newlines
  $("br").replaceWith("\n");

  // Convert <img> to alt text
  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    $(el).replaceWith(alt ? alt : "");
  });

  // Convert <a> tags
  $("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") || "";
    const text = $el.text().trim();

    if (!href || href === text) {
      $el.replaceWith(text || href);
    } else if (!text) {
      $el.replaceWith(href);
    } else {
      $el.replaceWith(`${text} (${href})`);
    }
  });

  // Convert list items with prefix
  $("li").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    $el.replaceWith(`\n- ${text}\n`);
  });

  // Convert block elements to double newlines
  const blockTags = "p, div, h1, h2, h3, h4, h5, h6, tr, blockquote, ul, ol";
  $(blockTags).each((_, el) => {
    const $el = $(el);
    $el.prepend("\n\n");
    $el.append("\n\n");
  });

  // Get text content (strips remaining tags)
  let text = $("body").text();

  // If no body tag, fall back to root text
  if (!text.trim()) {
    text = $.root().text();
  }

  // Collapse 3+ consecutive newlines into 2
  text = text.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  return text.trim();
}
