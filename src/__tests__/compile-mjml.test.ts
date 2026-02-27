import { describe, test, expect } from "bun:test";
import { compileMjml, CompileError } from "../compile/index";

// ============================================================================
// Basic compilation tests
// ============================================================================

describe("compileMjml", () => {
  test("compiles a simple MJML document to HTML", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Hello World</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("Hello World");
    expect(html).toContain("<!doctype html");
  });

  test("compiles MJML with head and attributes", async () => {
    const source = `
      <mjml>
        <mj-head>
          <mj-attributes>
            <mj-all font-family="Arial, sans-serif" />
            <mj-text font-size="16px" color="#333333" />
          </mj-attributes>
        </mj-head>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Styled content</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("Styled content");
    expect(html).toContain("Arial");
  });

  test("compiles MJML with button component", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-button href="https://example.com" background-color="#6d28d9">
                Click Me
              </mj-button>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("Click Me");
    expect(html).toContain("https://example.com");
    expect(html).toContain("6d28d9");
  });

  test("compiles MJML with image component", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-image src="https://example.com/logo.png" alt="Logo" width="200px" />
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("https://example.com/logo.png");
    expect(html).toContain('alt="Logo"');
  });

  test("compiles MJML with multiple columns", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Column 1</mj-text>
            </mj-column>
            <mj-column>
              <mj-text>Column 2</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("Column 1");
    expect(html).toContain("Column 2");
  });

  test("produces table-based HTML (email-safe output)", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Content</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("<table");
    expect(html).toContain("<td");
  });

  test("includes Outlook VML conditionals", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Content</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("[if mso");
  });

  test("compiles MJML with divider", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Before</mj-text>
              <mj-divider border-color="#e5e5e5" />
              <mj-text>After</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  test("compiles MJML with social component", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-social font-size="15px" icon-size="30px" mode="horizontal">
                <mj-social-element name="twitter" href="https://twitter.com" />
              </mj-social>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("twitter");
  });
});

// ============================================================================
// Validation tests
// ============================================================================

describe("compileMjml validation", () => {
  test("rejects empty source", async () => {
    try {
      await compileMjml("");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).format).toBe("mjml");
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("rejects whitespace-only source", async () => {
    try {
      await compileMjml("   \n\t  ");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("rejects source exceeding size limit", async () => {
    const source = "<mjml>" + "x".repeat(600_000) + "</mjml>";
    try {
      await compileMjml(source);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("rejects source without <mjml> root element", async () => {
    try {
      await compileMjml("<html><body>Not MJML</body></html>");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
      expect((err as CompileError).message).toContain("<mjml>");
    }
  });

  test("rejects plain text", async () => {
    try {
      await compileMjml("Just some text, not MJML at all");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
    }
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("compileMjml edge cases", () => {
  test("handles MJML with inline styles", async () => {
    const source = `
      <mjml>
        <mj-body background-color="#f5f5f5">
          <mj-section background-color="#ffffff">
            <mj-column>
              <mj-text color="#333333" font-size="16px" line-height="1.6">
                Styled text
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("Styled text");
    expect(html).toContain("#f5f5f5");
  });

  test("handles MJML with nested content (raw HTML inside mj-text)", async () => {
    const source = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>
                <p>Paragraph with <strong>bold</strong> and <em>italic</em></p>
                <ul>
                  <li>Item 1</li>
                  <li>Item 2</li>
                </ul>
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("Item 1");
  });

  test("handles minimal valid MJML", async () => {
    const html = await compileMjml("<mjml><mj-body></mj-body></mjml>");
    expect(html).toContain("<!doctype html");
  });

  test("handles MJML with custom fonts via mj-attributes", async () => {
    const source = `
      <mjml>
        <mj-head>
          <mj-font name="Roboto"
            href="https://fonts.googleapis.com/css?family=Roboto" />
          <mj-attributes>
            <mj-all font-family="Roboto, Arial, sans-serif" />
          </mj-attributes>
        </mj-head>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Custom font text</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `;
    const html = await compileMjml(source);
    expect(html).toContain("Roboto");
    expect(html).toContain("Custom font text");
  });
});

// ============================================================================
// CompileError contract
// ============================================================================

describe("CompileError contract (MJML)", () => {
  test("has correct name and format properties", async () => {
    try {
      await compileMjml("");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect(err).toBeInstanceOf(Error);
      expect((err as CompileError).name).toBe("CompileError");
      expect((err as CompileError).format).toBe("mjml");
    }
  });
});
