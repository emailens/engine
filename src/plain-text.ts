import * as cheerio from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";

/**
 * Convert HTML email to plain text suitable for multipart/alternative emails.
 *
 * Walks the DOM tree node-by-node, emitting text content with proper
 * line breaks for block elements. Avoids cheerio's `.text()` which
 * preserves all source whitespace from deeply nested email tables.
 */
export function toPlainText(html: string): string {
  const $ = cheerio.load(html);

  // Remove elements that should not appear in plain text
  $("style, script, head").remove();
  $("[data-skip-in-text='true']").remove();

  const lines: string[] = [];
  let currentLine = "";

  const BLOCK_TAGS = new Set([
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "tr", "table", "blockquote", "ul", "ol", "li",
    "section", "article", "header", "footer", "main",
    "td", "th", // treat cells as blocks to avoid run-on text
  ]);

  const SKIP_TAGS = new Set(["style", "script", "head"]);

  function flushLine() {
    const trimmed = currentLine.trim();
    if (trimmed) lines.push(trimmed);
    currentLine = "";
  }

  function walk(node: AnyNode) {
    if (node.type === "text") {
      // Collapse whitespace in text nodes (like browser rendering)
      const text = (node as Text).data.replace(/\s+/g, " ");
      if (text.trim()) {
        currentLine += text;
      }
      return;
    }

    if (node.type !== "tag") return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (SKIP_TAGS.has(tag)) return;

    // Self-closing conversions
    if (tag === "br") {
      flushLine();
      return;
    }
    if (tag === "hr") {
      flushLine();
      lines.push("---");
      return;
    }
    if (tag === "img") {
      const alt = $(el).attr("alt")?.trim();
      if (alt) currentLine += alt;
      return;
    }

    // Links: inline, append URL if different from text
    if (tag === "a") {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!href || href === "#" || href === text) {
        currentLine += text || href;
      } else if (!text) {
        currentLine += href;
      } else {
        currentLine += `${text} (${href})`;
      }
      return; // don't recurse into children, already extracted text
    }

    // Block elements: flush before and after
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) {
      flushLine();
    } else if (currentLine && !currentLine.endsWith(" ")) {
      // Inline elements: ensure a space separator so sibling spans
      // like <span>15</span><span>Clients</span> become "15 Clients"
      currentLine += " ";
    }

    // List items get a bullet prefix
    if (tag === "li") {
      currentLine = "- ";
    }

    // Recurse into children
    for (const child of el.children) {
      walk(child);
    }

    if (isBlock) flushLine();
  }

  // Start walking from body, or root if no body
  const body = $("body");
  const root = body.length ? body[0] : $.root()[0];
  if (root && "children" in root) {
    for (const child of root.children) {
      walk(child);
    }
  }
  flushLine();

  // Join lines, collapse multiple blank lines into one
  let result = lines.join("\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}
