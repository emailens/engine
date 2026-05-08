import { describe, test, expect } from "bun:test";
import { toPlainText } from "../plain-text";

describe("toPlainText", () => {
  // ── Basic text extraction ────────────────────────────────────────────

  test("extracts plain text from simple HTML", () => {
    const html = `<html><body><p>Hello world</p></body></html>`;
    expect(toPlainText(html)).toBe("Hello world");
  });

  test("returns empty string for empty input", () => {
    expect(toPlainText("")).toBe("");
  });

  test("returns empty string for HTML with no visible content", () => {
    const html = `<html><head><title>Test</title></head><body></body></html>`;
    expect(toPlainText(html)).toBe("");
  });

  test("strips <style> and <script> content", () => {
    const html = `<html><head><style>body { color: red; }</style></head><body><script>alert('x')</script><p>Visible</p></body></html>`;
    expect(toPlainText(html)).toBe("Visible");
  });

  // ── Whitespace handling ──────────────────────────────────────────────

  test("collapses whitespace in text nodes", () => {
    const html = `<html><body><p>  Hello    world   </p></body></html>`;
    expect(toPlainText(html)).toBe("Hello world");
  });

  test("collapses multiple blank lines into one", () => {
    const html = `<html><body><p>First</p><p></p><p></p><p></p><p>Second</p></body></html>`;
    const result = toPlainText(html);
    expect(result).not.toContain("\n\n\n");
    expect(result).toContain("First");
    expect(result).toContain("Second");
  });

  // ── Block elements ───────────────────────────────────────────────────

  test("adds line breaks between block elements", () => {
    const html = `<html><body><p>First</p><p>Second</p></body></html>`;
    const result = toPlainText(html);
    expect(result).toBe("First\nSecond");
  });

  test("handles headings as block elements", () => {
    const html = `<html><body><h1>Title</h1><p>Body text</p></body></html>`;
    const result = toPlainText(html);
    expect(result).toBe("Title\nBody text");
  });

  test("handles div as block element", () => {
    const html = `<html><body><div>First</div><div>Second</div></body></html>`;
    const result = toPlainText(html);
    expect(result).toBe("First\nSecond");
  });

  test("handles table cells as separate lines", () => {
    const html = `<html><body><table><tr><td>Cell 1</td><td>Cell 2</td></tr></table></body></html>`;
    const result = toPlainText(html);
    expect(result).toContain("Cell 1");
    expect(result).toContain("Cell 2");
    // Cells should be on separate lines
    expect(result).toBe("Cell 1\nCell 2");
  });

  test("handles table rows as separate lines", () => {
    const html = `<html><body><table><tr><td>Row 1</td></tr><tr><td>Row 2</td></tr></table></body></html>`;
    const result = toPlainText(html);
    expect(result).toContain("Row 1");
    expect(result).toContain("Row 2");
  });

  // ── Inline elements ──────────────────────────────────────────────────

  test("keeps inline elements on the same line", () => {
    const html = `<html><body><p>Hello <strong>bold</strong> and <em>italic</em></p></body></html>`;
    expect(toPlainText(html)).toBe("Hello bold and italic");
  });

  test("handles <span> inline", () => {
    const html = `<html><body><p>Hello <span>inline</span> text</p></body></html>`;
    expect(toPlainText(html)).toBe("Hello inline text");
  });

  // ── Self-closing elements ────────────────────────────────────────────

  test("<br> creates a line break", () => {
    const html = `<html><body><p>Line 1<br>Line 2</p></body></html>`;
    const result = toPlainText(html);
    expect(result).toBe("Line 1\nLine 2");
  });

  test("<hr> renders as ---", () => {
    const html = `<html><body><p>Above</p><hr><p>Below</p></body></html>`;
    const result = toPlainText(html);
    expect(result).toBe("Above\n---\nBelow");
  });

  test("<img> uses alt text", () => {
    const html = `<html><body><p>See <img alt="logo" src="logo.png"> here</p></body></html>`;
    expect(toPlainText(html)).toBe("See logo here");
  });

  test("<img> without alt is skipped", () => {
    const html = `<html><body><p>See <img src="spacer.gif"> here</p></body></html>`;
    // The spaces around the img remain and collapse to "See  here" (two spaces from two text nodes)
    expect(toPlainText(html)).toBe("See  here");
  });

  // ── Links ────────────────────────────────────────────────────────────

  test("link appends URL in parentheses when different from text", () => {
    const html = `<html><body><p>Visit <a href="https://example.com">Example</a></p></body></html>`;
    expect(toPlainText(html)).toBe("Visit Example (https://example.com)");
  });

  test("link with same text and href does not duplicate", () => {
    const html = `<html><body><p><a href="https://example.com">https://example.com</a></p></body></html>`;
    expect(toPlainText(html)).toBe("https://example.com");
  });

  test("link with # href shows only text", () => {
    const html = `<html><body><p><a href="#">Click here</a></p></body></html>`;
    expect(toPlainText(html)).toBe("Click here");
  });

  test("link with no text shows href", () => {
    const html = `<html><body><p><a href="https://example.com"></a></p></body></html>`;
    expect(toPlainText(html)).toBe("https://example.com");
  });

  // ── Lists ────────────────────────────────────────────────────────────

  test("unordered list items get bullet prefix", () => {
    const html = `<html><body><ul><li>One</li><li>Two</li><li>Three</li></ul></body></html>`;
    const result = toPlainText(html);
    expect(result).toContain("- One");
    expect(result).toContain("- Two");
    expect(result).toContain("- Three");
  });

  test("ordered list items get bullet prefix", () => {
    const html = `<html><body><ol><li>First</li><li>Second</li></ol></body></html>`;
    const result = toPlainText(html);
    expect(result).toContain("- First");
    expect(result).toContain("- Second");
  });

  // ── data-skip-in-text ────────────────────────────────────────────────

  test("removes elements with data-skip-in-text='true'", () => {
    const html = `<html><body><p>Visible</p><div data-skip-in-text="true">Hidden</div></body></html>`;
    const result = toPlainText(html);
    expect(result).toBe("Visible");
    expect(result).not.toContain("Hidden");
  });

  // ── Realistic email templates ────────────────────────────────────────

  test("handles a typical email structure", () => {
    const html = `
      <html>
        <head><style>body { font-family: Arial; }</style></head>
        <body>
          <table>
            <tr>
              <td>
                <h1>Welcome!</h1>
                <p>Thanks for signing up, <strong>John</strong>.</p>
                <p>Click below to get started:</p>
                <a href="https://app.example.com/start">Get Started</a>
                <hr>
                <p>Best,<br>The Team</p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    const result = toPlainText(html);
    expect(result).toContain("Welcome!");
    expect(result).toContain("Thanks for signing up, John.");
    expect(result).toContain("Get Started (https://app.example.com/start)");
    expect(result).toContain("---");
    expect(result).toContain("Best,");
    expect(result).toContain("The Team");
    // Should not contain CSS
    expect(result).not.toContain("font-family");
  });

  test("handles nested tables (common in email layouts)", () => {
    const html = `
      <html><body>
        <table>
          <tr>
            <td>
              <table>
                <tr><td>Header</td></tr>
              </table>
              <table>
                <tr><td>Content</td></tr>
              </table>
              <table>
                <tr><td>Footer</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </body></html>
    `;
    const result = toPlainText(html);
    expect(result).toContain("Header");
    expect(result).toContain("Content");
    expect(result).toContain("Footer");
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  test("handles HTML without <body>", () => {
    const html = `<p>No body tag</p>`;
    expect(toPlainText(html)).toBe("No body tag");
  });

  test("handles deeply nested inline elements", () => {
    const html = `<html><body><p><strong><em><u>Deep</u></em></strong></p></body></html>`;
    expect(toPlainText(html)).toBe("Deep");
  });

  test("handles blockquote as block element", () => {
    const html = `<html><body><p>Before</p><blockquote>Quoted text</blockquote><p>After</p></body></html>`;
    const result = toPlainText(html);
    expect(result).toBe("Before\nQuoted text\nAfter");
  });
});
