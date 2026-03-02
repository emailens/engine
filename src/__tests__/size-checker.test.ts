import { describe, test, expect } from "bun:test";
import { checkSize } from "../size-checker";
import { GMAIL_CLIP_THRESHOLD, GMAIL_CLIP_WARNING_THRESHOLD } from "../constants";

describe("size-checker", () => {
  test("small email returns no issues", () => {
    const html = `<html><body><p>Hello world</p></body></html>`;
    const report = checkSize(html);
    expect(report.clipped).toBe(false);
    expect(report.issues).toHaveLength(0);
    expect(report.htmlBytes).toBeGreaterThan(0);
    expect(report.humanSize).toContain("B");
  });

  test("empty HTML returns zero size", () => {
    const report = checkSize("");
    expect(report.htmlBytes).toBe(0);
    expect(report.humanSize).toBe("0 B");
    expect(report.clipped).toBe(false);
    expect(report.issues).toHaveLength(0);
  });

  test("email > 102KB is clipped", () => {
    const padding = "x".repeat(GMAIL_CLIP_THRESHOLD + 100);
    const html = `<html><body><p>${padding}</p></body></html>`;
    const report = checkSize(html);
    expect(report.clipped).toBe(true);
    expect(report.issues.length).toBe(1);
    expect(report.issues[0].rule).toBe("gmail-clipped");
    expect(report.issues[0].severity).toBe("error");
  });

  test("email between 90KB and 102KB gets warning", () => {
    const targetSize = GMAIL_CLIP_WARNING_THRESHOLD + 1024;
    // We need the total byte count to land between 90KB and 102KB
    const overhead = `<html><body><p></p></body></html>`.length;
    const padding = "a".repeat(targetSize - overhead);
    const html = `<html><body><p>${padding}</p></body></html>`;
    const report = checkSize(html);
    expect(report.clipped).toBe(false);
    expect(report.issues.length).toBe(1);
    expect(report.issues[0].rule).toBe("gmail-clip-warning");
    expect(report.issues[0].severity).toBe("warning");
  });

  test("email below 90KB has no size issues", () => {
    const padding = "y".repeat(1000);
    const html = `<html><body><p>${padding}</p></body></html>`;
    const report = checkSize(html);
    expect(report.clipped).toBe(false);
    expect(report.issues).toHaveLength(0);
  });

  test("humanSize formats KB correctly", () => {
    const padding = "z".repeat(50 * 1024);
    const html = `<html><body><p>${padding}</p></body></html>`;
    const report = checkSize(html);
    expect(report.humanSize).toContain("KB");
  });

  test("htmlBytes counts UTF-8 bytes not string length", () => {
    // Multi-byte emoji characters
    const html = `<html><body><p>${"🎉".repeat(100)}</p></body></html>`;
    const report = checkSize(html);
    // Each emoji is 4 bytes in UTF-8
    expect(report.htmlBytes).toBeGreaterThan(html.length);
  });
});
