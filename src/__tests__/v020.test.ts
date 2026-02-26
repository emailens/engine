import { describe, test, expect } from "bun:test";
import {
  analyzeEmail,
  generateCompatibilityScore,
  generateAiFix,
  estimateAiFixTokens,
  heuristicTokenCount,
  AI_FIX_SYSTEM_PROMPT,
  STRUCTURAL_FIX_PROPERTIES,
  getCodeFix,
  getSuggestion,
  generateFixPrompt,
} from "../index";
import type { CSSWarning, AiProvider } from "../index";

// ============================================================================
// Test HTML fixtures
// ============================================================================

const SIMPLE_HTML = `<html><body><p style="color: red;">Hello</p></body></html>`;

const COMPLEX_HTML = `<html>
<head>
  <style>
    .card { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div style="display: flex; gap: 16px; word-break: break-all;">
    <div style="position: absolute; transform: rotate(45deg);">Column A</div>
    <div style="overflow: hidden; opacity: 0.5;">Column B</div>
  </div>
  <svg><circle r="10" /></svg>
  <form><input type="text" /></form>
</body>
</html>`;

const WORD_BREAK_HTML = `<html><body>
  <span style="word-break: break-all;">https://very-long-url-that-should-wrap.example.com/path/to/resource</span>
</body></html>`;

const OVERFLOW_WRAP_HTML = `<html><body>
  <p style="overflow-wrap: break-word;">Content with overflow-wrap</p>
</body></html>`;

const TEXT_OVERFLOW_HTML = `<html><body>
  <div style="text-overflow: ellipsis; overflow: hidden;">Truncated text</div>
</body></html>`;

const BORDER_SPACING_HTML = `<html><body>
  <table style="border-spacing: 8px;"><tr><td>Cell</td></tr></table>
</body></html>`;

const MIN_WIDTH_HTML = `<html><body>
  <div style="min-width: 200px;">Content</div>
</body></html>`;

const MIN_HEIGHT_HTML = `<html><body>
  <div style="min-height: 100px;">Content</div>
</body></html>`;

const MAX_HEIGHT_HTML = `<html><body>
  <div style="max-height: 400px;">Content</div>
</body></html>`;

const TEXT_SHADOW_HTML = `<html><body>
  <h1 style="text-shadow: 1px 1px 2px black;">Title</h1>
</body></html>`;

const BG_SIZE_HTML = `<html><body>
  <div style="background-size: cover;">Content</div>
</body></html>`;

const BG_POSITION_HTML = `<html><body>
  <div style="background-position: center;">Content</div>
</body></html>`;

const VERTICAL_ALIGN_HTML = `<html><body>
  <td style="vertical-align: middle;">Cell</td>
</body></html>`;

const WHITE_SPACE_HTML = `<html><body>
  <span style="white-space: pre-wrap;">Content</span>
</body></html>`;

// ============================================================================
// fixType classification tests
// ============================================================================

describe("fixType classification", () => {
  test("word-break warnings have fixType: structural", () => {
    const warnings = analyzeEmail(WORD_BREAK_HTML);
    const wbWarnings = warnings.filter((w) => w.property === "word-break");
    expect(wbWarnings.length).toBeGreaterThan(0);
    for (const w of wbWarnings) {
      expect(w.fixType).toBe("structural");
    }
  });

  test("overflow-wrap warnings have fixType: structural", () => {
    const warnings = analyzeEmail(OVERFLOW_WRAP_HTML);
    const owWarnings = warnings.filter((w) => w.property === "overflow-wrap");
    expect(owWarnings.length).toBeGreaterThan(0);
    for (const w of owWarnings) {
      expect(w.fixType).toBe("structural");
    }
  });

  test("text-overflow warnings have fixType: structural", () => {
    const warnings = analyzeEmail(TEXT_OVERFLOW_HTML);
    const toWarnings = warnings.filter((w) => w.property === "text-overflow");
    expect(toWarnings.length).toBeGreaterThan(0);
    for (const w of toWarnings) {
      expect(w.fixType).toBe("structural");
    }
  });

  test("text-shadow warnings have fixType: css", () => {
    const warnings = analyzeEmail(TEXT_SHADOW_HTML);
    const tsWarnings = warnings.filter((w) => w.property === "text-shadow");
    expect(tsWarnings.length).toBeGreaterThan(0);
    for (const w of tsWarnings) {
      expect(w.fixType).toBe("css");
    }
  });

  test("border-spacing warnings have fixType: css", () => {
    const warnings = analyzeEmail(BORDER_SPACING_HTML);
    const bsWarnings = warnings.filter((w) => w.property === "border-spacing");
    expect(bsWarnings.length).toBeGreaterThan(0);
    for (const w of bsWarnings) {
      expect(w.fixType).toBe("css");
    }
  });

  test("min-width warnings have fixType: css", () => {
    const warnings = analyzeEmail(MIN_WIDTH_HTML);
    const mwWarnings = warnings.filter((w) => w.property === "min-width");
    expect(mwWarnings.length).toBeGreaterThan(0);
    for (const w of mwWarnings) {
      expect(w.fixType).toBe("css");
    }
  });

  test("<svg> warnings have fixType: structural", () => {
    const html = `<html><body><svg><circle r="10" /></svg></body></html>`;
    const warnings = analyzeEmail(html);
    const svgWarnings = warnings.filter((w) => w.property === "<svg>");
    expect(svgWarnings.length).toBeGreaterThan(0);
    for (const w of svgWarnings) {
      expect(w.fixType).toBe("structural");
    }
  });

  test("<form> warnings have fixType: structural", () => {
    const html = `<html><body><form><input type="text" /></form></body></html>`;
    const warnings = analyzeEmail(html);
    const formWarnings = warnings.filter((w) => w.property === "<form>");
    expect(formWarnings.length).toBeGreaterThan(0);
    for (const w of formWarnings) {
      expect(w.fixType).toBe("structural");
    }
  });

  test("<video> warnings have fixType: structural", () => {
    const html = `<html><body><video src="demo.mp4"></video></body></html>`;
    const warnings = analyzeEmail(html);
    const videoWarnings = warnings.filter((w) => w.property === "<video>");
    expect(videoWarnings.length).toBeGreaterThan(0);
    for (const w of videoWarnings) {
      expect(w.fixType).toBe("structural");
    }
  });

  test("<style> warnings have fixType: css", () => {
    const html = `<html><head><style>.test { color: red; }</style></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    const styleWarnings = warnings.filter((w) => w.property === "<style>");
    expect(styleWarnings.length).toBeGreaterThan(0);
    for (const w of styleWarnings) {
      expect(w.fixType).toBe("css");
    }
  });

  test("<link> warnings have fixType: css", () => {
    const html = `<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    const linkWarnings = warnings.filter((w) => w.property === "<link>");
    expect(linkWarnings.length).toBeGreaterThan(0);
    for (const w of linkWarnings) {
      expect(w.fixType).toBe("css");
    }
  });

  test("@font-face warnings have fixType: css", () => {
    const html = `<html><head><style>@font-face { font-family: "Custom"; src: url(font.woff2); }</style></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    const fontWarnings = warnings.filter((w) => w.property === "@font-face");
    expect(fontWarnings.length).toBeGreaterThan(0);
    for (const w of fontWarnings) {
      expect(w.fixType).toBe("css");
    }
  });

  test("@media warnings have fixType: css", () => {
    const html = `<html><head><style>@media (max-width: 600px) { .m { font-size: 14px; } }</style></head><body></body></html>`;
    const warnings = analyzeEmail(html);
    const mediaWarnings = warnings.filter((w) => w.property === "@media");
    expect(mediaWarnings.length).toBeGreaterThan(0);
    for (const w of mediaWarnings) {
      expect(w.fixType).toBe("css");
    }
  });

  test("all warnings from COMPLEX_HTML have fixType set", () => {
    const warnings = analyzeEmail(COMPLEX_HTML);
    for (const w of warnings) {
      expect(w.fixType).toBeDefined();
      expect(["css", "structural"]).toContain(w.fixType);
    }
  });
});

// ============================================================================
// New CSS property detection tests
// ============================================================================

describe("new CSS properties (v0.2.0)", () => {
  test("detects word-break in inline styles", () => {
    const warnings = analyzeEmail(WORD_BREAK_HTML);
    const wbWarnings = warnings.filter((w) => w.property === "word-break");
    expect(wbWarnings.length).toBeGreaterThan(0);
    // Should warn for Outlook Windows at minimum
    expect(wbWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects overflow-wrap in inline styles", () => {
    const warnings = analyzeEmail(OVERFLOW_WRAP_HTML);
    const owWarnings = warnings.filter((w) => w.property === "overflow-wrap");
    expect(owWarnings.length).toBeGreaterThan(0);
    expect(owWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects text-overflow in inline styles", () => {
    const warnings = analyzeEmail(TEXT_OVERFLOW_HTML);
    const toWarnings = warnings.filter((w) => w.property === "text-overflow");
    expect(toWarnings.length).toBeGreaterThan(0);
  });

  test("detects border-spacing in inline styles", () => {
    const warnings = analyzeEmail(BORDER_SPACING_HTML);
    const bsWarnings = warnings.filter((w) => w.property === "border-spacing");
    expect(bsWarnings.length).toBeGreaterThan(0);
    expect(bsWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects min-width in inline styles", () => {
    const warnings = analyzeEmail(MIN_WIDTH_HTML);
    const mwWarnings = warnings.filter((w) => w.property === "min-width");
    expect(mwWarnings.length).toBeGreaterThan(0);
    expect(mwWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects min-height in inline styles", () => {
    const warnings = analyzeEmail(MIN_HEIGHT_HTML);
    const mhWarnings = warnings.filter((w) => w.property === "min-height");
    expect(mhWarnings.length).toBeGreaterThan(0);
    expect(mhWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects max-height in inline styles", () => {
    const warnings = analyzeEmail(MAX_HEIGHT_HTML);
    const mhWarnings = warnings.filter((w) => w.property === "max-height");
    expect(mhWarnings.length).toBeGreaterThan(0);
    expect(mhWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects text-shadow in inline styles", () => {
    const warnings = analyzeEmail(TEXT_SHADOW_HTML);
    const tsWarnings = warnings.filter((w) => w.property === "text-shadow");
    expect(tsWarnings.length).toBeGreaterThan(0);
    // Gmail, Outlook Windows, and Yahoo should all flag this
    expect(tsWarnings.some((w) => w.client === "gmail-web")).toBe(true);
    expect(tsWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects background-size in inline styles", () => {
    const warnings = analyzeEmail(BG_SIZE_HTML);
    const bgWarnings = warnings.filter((w) => w.property === "background-size");
    expect(bgWarnings.length).toBeGreaterThan(0);
    expect(bgWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects background-position in inline styles", () => {
    const warnings = analyzeEmail(BG_POSITION_HTML);
    const bgWarnings = warnings.filter((w) => w.property === "background-position");
    expect(bgWarnings.length).toBeGreaterThan(0);
    expect(bgWarnings.some((w) => w.client === "outlook-windows")).toBe(true);
  });

  test("detects vertical-align partial support in Outlook", () => {
    const warnings = analyzeEmail(VERTICAL_ALIGN_HTML);
    const vaWarnings = warnings.filter((w) => w.property === "vertical-align");
    // Outlook Windows has "partial" support, so should produce info-level warning
    const outlookVA = vaWarnings.find((w) => w.client === "outlook-windows");
    if (outlookVA) {
      expect(outlookVA.severity).toBe("info");
    }
  });

  test("detects white-space partial support in Outlook", () => {
    const warnings = analyzeEmail(WHITE_SPACE_HTML);
    const wsWarnings = warnings.filter((w) => w.property === "white-space");
    const outlookWS = wsWarnings.find((w) => w.client === "outlook-windows");
    if (outlookWS) {
      expect(outlookWS.severity).toBe("info");
    }
  });
});

// ============================================================================
// STRUCTURAL_FIX_PROPERTIES tests
// ============================================================================

describe("STRUCTURAL_FIX_PROPERTIES", () => {
  test("contains flex and grid", () => {
    expect(STRUCTURAL_FIX_PROPERTIES.has("display:flex")).toBe(true);
    expect(STRUCTURAL_FIX_PROPERTIES.has("display:grid")).toBe(true);
  });

  test("contains word-break and overflow-wrap", () => {
    expect(STRUCTURAL_FIX_PROPERTIES.has("word-break")).toBe(true);
    expect(STRUCTURAL_FIX_PROPERTIES.has("overflow-wrap")).toBe(true);
  });

  test("contains HTML elements", () => {
    expect(STRUCTURAL_FIX_PROPERTIES.has("<svg>")).toBe(true);
    expect(STRUCTURAL_FIX_PROPERTIES.has("<video>")).toBe(true);
    expect(STRUCTURAL_FIX_PROPERTIES.has("<form>")).toBe(true);
  });

  test("does NOT contain CSS-only properties", () => {
    expect(STRUCTURAL_FIX_PROPERTIES.has("color")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("font-size")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("text-shadow")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("border-spacing")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("min-width")).toBe(false);
  });

  test("does NOT contain non-structural properties", () => {
    // These were removed in the review fix
    expect(STRUCTURAL_FIX_PROPERTIES.has("overflow")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("visibility")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("transform")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("animation")).toBe(false);
    expect(STRUCTURAL_FIX_PROPERTIES.has("transition")).toBe(false);
  });
});

// ============================================================================
// Fix snippets for new properties
// ============================================================================

describe("fix snippets for new CSS properties", () => {
  test("word-break has fix snippet for Outlook (html)", () => {
    const fix = getCodeFix("word-break", "outlook-windows");
    expect(fix).toBeDefined();
    expect(fix!.language).toBe("html");
    expect(fix!.after).toContain("table");
  });

  test("word-break has JSX fix snippet", () => {
    const fix = getCodeFix("word-break", "outlook-windows", "jsx");
    expect(fix).toBeDefined();
    expect(fix!.language).toBe("jsx");
  });

  test("word-break has MJML fix snippet", () => {
    const fix = getCodeFix("word-break", "outlook-windows", "mjml");
    expect(fix).toBeDefined();
    expect(fix!.language).toBe("mjml");
  });

  test("overflow-wrap has fix snippet for html", () => {
    const fix = getCodeFix("overflow-wrap", "outlook-windows");
    expect(fix).toBeDefined();
    expect(fix!.language).toBe("html");
  });

  test("overflow-wrap has JSX fix snippet", () => {
    const fix = getCodeFix("overflow-wrap", "outlook-windows", "jsx");
    expect(fix).toBeDefined();
  });

  test("text-shadow has suggestion", () => {
    const sug = getSuggestion("text-shadow", "gmail-web");
    expect(sug.text).toBeTruthy();
    expect(sug.text).not.toContain("is not supported in this email client");
  });

  test("border-spacing has suggestion", () => {
    const sug = getSuggestion("border-spacing", "outlook-windows");
    expect(sug.text).toBeTruthy();
    expect(sug.text).toContain("cellspacing");
  });

  test("min-width has suggestion", () => {
    const sug = getSuggestion("min-width", "outlook-windows");
    expect(sug.text).toBeTruthy();
  });

  test("min-height has suggestion", () => {
    const sug = getSuggestion("min-height", "outlook-windows");
    expect(sug.text).toBeTruthy();
  });

  test("max-height has suggestion", () => {
    const sug = getSuggestion("max-height", "outlook-windows");
    expect(sug.text).toBeTruthy();
  });
});

// ============================================================================
// Client prefix resolution (Yahoo, Samsung)
// ============================================================================

describe("getClientPrefix for Yahoo and Samsung", () => {
  test("word-break suggestions resolve for Yahoo Mail", () => {
    const sug = getSuggestion("word-break", "yahoo-mail");
    expect(sug.text).toBeTruthy();
    // Should NOT fall back to the generic "not supported" message
    expect(sug.text).not.toContain("is not supported in this email client");
  });

  test("word-break suggestions resolve for Samsung Mail", () => {
    const sug = getSuggestion("word-break", "samsung-mail");
    expect(sug.text).toBeTruthy();
  });
});

// ============================================================================
// heuristicTokenCount tests
// ============================================================================

describe("heuristicTokenCount", () => {
  test("returns a positive number for non-empty text", () => {
    expect(heuristicTokenCount("Hello world")).toBeGreaterThan(0);
  });

  test("returns 0 for empty string", () => {
    expect(heuristicTokenCount("")).toBe(0);
  });

  test("scales linearly with text length", () => {
    const short = heuristicTokenCount("a".repeat(350)); // 100 tokens
    const long = heuristicTokenCount("a".repeat(3500)); // 1000 tokens
    // 10x more text should be ~10x more tokens
    expect(long / short).toBe(10);
  });

  test("estimates ~3.5 chars per token", () => {
    const text = "a".repeat(350);
    const tokens = heuristicTokenCount(text);
    expect(tokens).toBe(100); // 350 / 3.5 = 100
  });

  test("rounds up partial tokens", () => {
    const text = "a"; // 1 char / 3.5 = 0.286, should ceil to 1
    expect(heuristicTokenCount(text)).toBe(1);
  });
});

// ============================================================================
// estimateAiFixTokens tests
// ============================================================================

describe("estimateAiFixTokens", () => {
  test("returns valid token estimate for simple HTML", async () => {
    const warnings = analyzeEmail(SIMPLE_HTML);
    const scores = generateCompatibilityScore(warnings);

    const estimate = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
    });

    expect(estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
    expect(estimate.promptCharacters).toBeGreaterThan(0);
    expect(estimate.htmlCharacters).toBe(SIMPLE_HTML.length);
    expect(estimate.warningCount).toBe(warnings.length);
    expect(estimate.truncated).toBe(false);
    expect(estimate.warningsRemoved).toBe(0);
  });

  test("includes system prompt tokens in estimate", async () => {
    const warnings = analyzeEmail(SIMPLE_HTML);
    const scores = generateCompatibilityScore(warnings);

    const withDefault = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
    });

    const withZero = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
      systemPromptTokens: 0,
    });

    // Default should be 250 tokens higher
    expect(withDefault.inputTokens - withZero.inputTokens).toBe(250);
  });

  test("custom systemPromptTokens overrides default", async () => {
    const warnings = analyzeEmail(SIMPLE_HTML);
    const scores = generateCompatibilityScore(warnings);

    const custom = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
      systemPromptTokens: 500,
    });

    const zero = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
      systemPromptTokens: 0,
    });

    expect(custom.inputTokens - zero.inputTokens).toBe(500);
  });

  test("uses custom tokenCounter when provided", async () => {
    const warnings = analyzeEmail(SIMPLE_HTML);
    const scores = generateCompatibilityScore(warnings);

    const fixedCount = 42;
    const estimate = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
      systemPromptTokens: 0,
      tokenCounter: () => fixedCount,
    });

    expect(estimate.inputTokens).toBe(fixedCount);
  });

  test("uses async tokenCounter when provided", async () => {
    const warnings = analyzeEmail(SIMPLE_HTML);
    const scores = generateCompatibilityScore(warnings);

    const fixedCount = 99;
    const estimate = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
      systemPromptTokens: 0,
      tokenCounter: async () => fixedCount,
    });

    expect(estimate.inputTokens).toBe(fixedCount);
  });

  test("counts structural warnings correctly", async () => {
    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    const estimate = await estimateAiFixTokens({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
    });

    const manualStructural = estimate.warnings.filter(
      (w) => w.fixType === "structural",
    ).length;
    expect(estimate.structuralCount).toBe(manualStructural);
  });

  test("returns truncated warnings list", async () => {
    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    const estimate = await estimateAiFixTokens({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
    });

    // warnings field should exist and be an array
    expect(Array.isArray(estimate.warnings)).toBe(true);
    expect(estimate.warnings.length).toBe(estimate.warningCount);
  });
});

// ============================================================================
// Smart truncation tests
// ============================================================================

describe("smart truncation", () => {
  test("truncates when prompt exceeds maxInputTokens", async () => {
    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    // Use a very low limit to force truncation
    const estimate = await estimateAiFixTokens({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
      maxInputTokens: 500, // very low — will definitely truncate
      systemPromptTokens: 0,
    });

    expect(estimate.truncated).toBe(true);
    expect(estimate.warningsRemoved).toBeGreaterThan(0);
    expect(estimate.warningCount).toBeLessThan(warnings.length);
  });

  test("preserves structural and error warnings during truncation", async () => {
    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    const estimate = await estimateAiFixTokens({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
      maxInputTokens: 500,
      systemPromptTokens: 0,
    });

    if (estimate.truncated && estimate.warnings.length > 0) {
      // After truncation, remaining warnings should be predominantly
      // structural or error-level
      const structural = estimate.warnings.filter((w) => w.fixType === "structural");
      const errors = estimate.warnings.filter((w) => w.severity === "error");
      expect(structural.length + errors.length).toBeGreaterThan(0);
    }
  });

  test("does not truncate when prompt fits within limits", async () => {
    const warnings = analyzeEmail(SIMPLE_HTML);
    const scores = generateCompatibilityScore(warnings);

    const estimate = await estimateAiFixTokens({
      originalHtml: SIMPLE_HTML,
      warnings,
      scores,
      scope: "all",
      maxInputTokens: 100000, // very high — won't truncate
    });

    expect(estimate.truncated).toBe(false);
    expect(estimate.warningsRemoved).toBe(0);
  });
});

// ============================================================================
// generateAiFix tests
// ============================================================================

describe("generateAiFix", () => {
  // Mock provider that echoes back a code fence
  const mockProvider: AiProvider = async (prompt) => {
    return "```html\n<html><body><p>Fixed!</p></body></html>\n```";
  };

  test("returns fixed code from provider", async () => {
    const warnings = analyzeEmail(WORD_BREAK_HTML);
    const scores = generateCompatibilityScore(warnings);

    const result = await generateAiFix({
      originalHtml: WORD_BREAK_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
      provider: mockProvider,
    });

    expect(result.code).toBe("<html><body><p>Fixed!</p></body></html>");
    expect(result.prompt).toContain("Email Compatibility Fix Request");
    expect(result.targetedWarnings).toBeGreaterThan(0);
    expect(result.tokenEstimate.inputTokens).toBeGreaterThan(0);
  });

  test("extracts code from response without fences", async () => {
    const noFenceProvider: AiProvider = async () => "<p>Raw response</p>";

    const warnings = analyzeEmail(WORD_BREAK_HTML);
    const scores = generateCompatibilityScore(warnings);

    const result = await generateAiFix({
      originalHtml: WORD_BREAK_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
      provider: noFenceProvider,
    });

    expect(result.code).toBe("<p>Raw response</p>");
  });

  test("extracts largest code fence when multiple exist", async () => {
    const multiFenceProvider: AiProvider = async () => {
      return `Here's a small fix:

\`\`\`html
<small>snippet</small>
\`\`\`

And here's the full code:

\`\`\`html
<html><head></head><body><div class="full"><p>This is the complete fixed email with lots of content</p></div></body></html>
\`\`\``;
    };

    const warnings = analyzeEmail(WORD_BREAK_HTML);
    const scores = generateCompatibilityScore(warnings);

    const result = await generateAiFix({
      originalHtml: WORD_BREAK_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
      provider: multiFenceProvider,
    });

    // Should get the larger code block, not the small snippet
    expect(result.code).toContain("complete fixed email");
    expect(result.code).not.toBe("<small>snippet</small>");
  });

  test("uses truncated warnings when maxInputTokens is low", async () => {
    let receivedPrompt = "";
    const capturingProvider: AiProvider = async (prompt) => {
      receivedPrompt = prompt;
      return "```html\n<p>fixed</p>\n```";
    };

    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    const result = await generateAiFix({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
      maxInputTokens: 500,
      provider: capturingProvider,
    });

    // The prompt sent to the provider should be smaller than
    // a prompt with all warnings
    const fullPrompt = generateFixPrompt({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
    });

    expect(receivedPrompt.length).toBeLessThan(fullPrompt.length);
    expect(result.tokenEstimate.truncated).toBe(true);
  });

  test("scopes to specific client with scope: current", async () => {
    let receivedPrompt = "";
    const capturingProvider: AiProvider = async (prompt) => {
      receivedPrompt = prompt;
      return "```html\n<p>fixed</p>\n```";
    };

    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    await generateAiFix({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "current",
      selectedClientId: "outlook-windows",
      format: "html",
      provider: capturingProvider,
    });

    // Prompt should mention Outlook specifically
    expect(receivedPrompt).toContain("Outlook Windows");
  });

  test("reports structuralCount correctly", async () => {
    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    const result = await generateAiFix({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
      provider: mockProvider,
    });

    expect(result.structuralCount).toBeGreaterThanOrEqual(0);
    expect(result.structuralCount).toBeLessThanOrEqual(result.targetedWarnings);
  });

  test("handles provider that returns empty string", async () => {
    const emptyProvider: AiProvider = async () => "";

    const warnings = analyzeEmail(WORD_BREAK_HTML);
    const scores = generateCompatibilityScore(warnings);

    const result = await generateAiFix({
      originalHtml: WORD_BREAK_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
      provider: emptyProvider,
    });

    expect(result.code).toBe("");
  });

  test("propagates provider errors", async () => {
    const errorProvider: AiProvider = async () => {
      throw new Error("API rate limit exceeded");
    };

    const warnings = analyzeEmail(WORD_BREAK_HTML);
    const scores = generateCompatibilityScore(warnings);

    expect(
      generateAiFix({
        originalHtml: WORD_BREAK_HTML,
        warnings,
        scores,
        scope: "all",
        format: "html",
        provider: errorProvider,
      }),
    ).rejects.toThrow("API rate limit exceeded");
  });
});

// ============================================================================
// AI_FIX_SYSTEM_PROMPT tests
// ============================================================================

describe("AI_FIX_SYSTEM_PROMPT", () => {
  test("is a non-empty string", () => {
    expect(typeof AI_FIX_SYSTEM_PROMPT).toBe("string");
    expect(AI_FIX_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  test("mentions structural fix patterns", () => {
    expect(AI_FIX_SYSTEM_PROMPT).toContain("structural");
    expect(AI_FIX_SYSTEM_PROMPT).toContain("table");
    expect(AI_FIX_SYSTEM_PROMPT).toContain("VML");
    expect(AI_FIX_SYSTEM_PROMPT).toContain("mso");
  });

  test("mentions framework formats", () => {
    expect(AI_FIX_SYSTEM_PROMPT).toContain("JSX");
    expect(AI_FIX_SYSTEM_PROMPT).toContain("MJML");
    expect(AI_FIX_SYSTEM_PROMPT).toContain("Maizzle");
  });
});

// ============================================================================
// generateFixPrompt structural labels
// ============================================================================

describe("generateFixPrompt structural labels", () => {
  test("includes [STRUCTURAL] label for structural warnings", () => {
    const warnings = analyzeEmail(COMPLEX_HTML);
    const scores = generateCompatibilityScore(warnings);

    const prompt = generateFixPrompt({
      originalHtml: COMPLEX_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
    });

    expect(prompt).toContain("[STRUCTURAL]");
    expect(prompt).toContain("HTML restructuring required");
  });

  test("does not include [STRUCTURAL] for CSS-only warnings", () => {
    // text-shadow is CSS-only
    const warnings = analyzeEmail(TEXT_SHADOW_HTML);
    const scores = generateCompatibilityScore(warnings);

    const prompt = generateFixPrompt({
      originalHtml: TEXT_SHADOW_HTML,
      warnings,
      scores,
      scope: "all",
      format: "html",
    });

    // text-shadow warnings should NOT have [STRUCTURAL] since they're CSS-only
    const lines = prompt.split("\n");
    const textShadowLines = lines.filter((l) => l.includes("text-shadow"));
    for (const line of textShadowLines) {
      expect(line).not.toContain("[STRUCTURAL]");
    }
  });
});
