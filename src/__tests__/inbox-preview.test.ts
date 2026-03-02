import { describe, test, expect } from "bun:test";
import { extractInboxPreview } from "../inbox-preview";

describe("inbox-preview — truncation", () => {
  test("returns per-client truncation data", () => {
    const html = `<html><head><title>This is a really long subject line that exceeds most client limits for inbox display</title></head>
    <body><div style="display:none;max-height:0;overflow:hidden;">This is a preheader that is also quite long and will be truncated by various email clients at different character limits depending on the device</div><p>Body text</p></body></html>`;
    const result = extractInboxPreview(html);

    expect(result.truncation.length).toBe(8);
    expect(result.truncation[0].client).toBe("Gmail (Web)");

    // Long subject should be truncated on mobile clients
    const gmailMobile = result.truncation.find(t => t.client === "Gmail (Mobile)");
    expect(gmailMobile).toBeDefined();
    expect(gmailMobile!.subjectTruncated).toBe(true);
    expect(gmailMobile!.truncatedSubject!.endsWith("…")).toBe(true);
  });

  test("short subject/preheader are not truncated", () => {
    const html = `<html><head><title>Hello</title></head>
    <body><div style="display:none;max-height:0;overflow:hidden;">Short preview</div><p>Body text</p></body></html>`;
    const result = extractInboxPreview(html);

    for (const t of result.truncation) {
      expect(t.subjectTruncated).toBe(false);
      expect(t.truncatedSubject).toBe("Hello");
    }
  });

  test("null subject/preheader result in null truncation fields", () => {
    const html = `<html><body><p>No title tag</p></body></html>`;
    const result = extractInboxPreview(html);

    for (const t of result.truncation) {
      expect(t.truncatedSubject).toBeNull();
      expect(t.subjectTruncated).toBe(false);
    }
  });
});

describe("inbox-preview — short preheader", () => {
  test("preheader < 30 chars triggers warning", () => {
    const html = `<html><head><title>Test</title></head>
    <body><div style="display:none;max-height:0;overflow:hidden;">Short</div><p>Body</p></body></html>`;
    const result = extractInboxPreview(html);
    const issue = result.issues.find(i => i.rule === "preheader-too-short");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  test("preheader >= 30 chars does not trigger short warning", () => {
    const longPreheader = "A".repeat(35);
    const html = `<html><head><title>Test</title></head>
    <body><div style="display:none;max-height:0;overflow:hidden;">${longPreheader}</div><p>Body</p></body></html>`;
    const result = extractInboxPreview(html);
    const issue = result.issues.find(i => i.rule === "preheader-too-short");
    expect(issue).toBeUndefined();
  });
});

describe("inbox-preview — zwnj padding", () => {
  test("detects zwnj/nbsp padding hack", () => {
    const html = `<html><head><title>Test</title></head>
    <body><div style="display:none;max-height:0;overflow:hidden;">Preview&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div><p>Body</p></body></html>`;
    const result = extractInboxPreview(html);
    const issue = result.issues.find(i => i.rule === "zwnj-padding");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("info");
  });

  test("no false positive without zwnj padding", () => {
    const html = `<html><head><title>Test</title></head>
    <body><div style="display:none;max-height:0;overflow:hidden;">Normal preheader text here</div><p>Body</p></body></html>`;
    const result = extractInboxPreview(html);
    const issue = result.issues.find(i => i.rule === "zwnj-padding");
    expect(issue).toBeUndefined();
  });
});

describe("inbox-preview — emoji in subject", () => {
  test("detects emoji in subject line", () => {
    const html = `<html><head><title>🎉 Big Sale Today!</title></head><body><p>Body</p></body></html>`;
    const result = extractInboxPreview(html);
    const issue = result.issues.find(i => i.rule === "emoji-in-subject");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("info");
  });

  test("no false positive for plain text subject", () => {
    const html = `<html><head><title>Weekly Newsletter</title></head><body><p>Body</p></body></html>`;
    const result = extractInboxPreview(html);
    const issue = result.issues.find(i => i.rule === "emoji-in-subject");
    expect(issue).toBeUndefined();
  });

  test("detects various emoji types", () => {
    const html = `<html><head><title>Sale ⭐ Now!</title></head><body><p>Body</p></body></html>`;
    const result = extractInboxPreview(html);
    const issue = result.issues.find(i => i.rule === "emoji-in-subject");
    expect(issue).toBeDefined();
  });
});

describe("inbox-preview — empty/missing input", () => {
  test("empty HTML includes truncation: []", () => {
    const result = extractInboxPreview("");
    expect(result.truncation).toEqual([]);
  });
});
