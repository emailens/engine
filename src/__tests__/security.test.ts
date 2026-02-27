import { describe, test, expect } from "bun:test";
import {
  analyzeEmail,
  transformForClient,
  analyzeSpam,
  validateLinks,
  checkAccessibility,
  analyzeImages,
  simulateDarkMode,
  MAX_HTML_SIZE,
} from "../index";
import { CompileError } from "../compile/errors";

// Helper: create a string larger than MAX_HTML_SIZE
function makeOversizedHtml(): string {
  return "<html><body>" + "x".repeat(MAX_HTML_SIZE + 1) + "</body></html>";
}

describe("Input size limits", () => {
  const oversized = makeOversizedHtml();

  test("analyzeEmail rejects oversized HTML", () => {
    expect(() => analyzeEmail(oversized)).toThrow("exceeds");
  });

  test("transformForClient rejects oversized HTML", () => {
    expect(() => transformForClient(oversized, "gmail-web")).toThrow("exceeds");
  });

  test("analyzeSpam rejects oversized HTML", () => {
    expect(() => analyzeSpam(oversized)).toThrow("exceeds");
  });

  test("validateLinks rejects oversized HTML", () => {
    expect(() => validateLinks(oversized)).toThrow("exceeds");
  });

  test("checkAccessibility rejects oversized HTML", () => {
    expect(() => checkAccessibility(oversized)).toThrow("exceeds");
  });

  test("analyzeImages rejects oversized HTML", () => {
    expect(() => analyzeImages(oversized)).toThrow("exceeds");
  });

  test("simulateDarkMode rejects oversized HTML", () => {
    expect(() => simulateDarkMode(oversized, "gmail-web")).toThrow("exceeds");
  });

  test("MAX_HTML_SIZE is exported and equals 2MB", () => {
    expect(MAX_HTML_SIZE).toBe(2 * 1024 * 1024);
  });
});

describe("Maizzle directive blocklist", () => {
  const { compileMaizzle } = require("../compile/maizzle");

  test("rejects <raw> directive", async () => {
    const source = `<raw>dangerous content</raw>`;
    try {
      await compileMaizzle(source);
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).message).toContain("directives");
    }
  });

  test("rejects <extends> with file path", async () => {
    const source = `<extends src="/etc/passwd"><block name="content">hi</block></extends>`;
    try {
      await compileMaizzle(source);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).message).toContain("directives");
    }
  });

  test("rejects <block> directive", async () => {
    const source = `<block name="content">dangerous</block>`;
    try {
      await compileMaizzle(source);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).message).toContain("directives");
    }
  });

  test("rejects <yield> directive", async () => {
    const source = `<yield>template content</yield>`;
    try {
      await compileMaizzle(source);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).message).toContain("directives");
    }
  });
});

describe("React Email JSX security", () => {
  const { compileReactEmail } = require("../compile/react-email");

  test("rejects require('fs')", async () => {
    const source = `
      import React from "react";
      const fs = require("fs");
      export default function Email() {
        return <div>{fs.readFileSync("/etc/passwd", "utf8")}</div>;
      }
    `;
    try {
      await compileReactEmail(source, { sandbox: "vm" });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain("not allowed");
    }
  });

  test("rejects require('child_process')", async () => {
    const source = `
      import React from "react";
      const cp = require("child_process");
      export default function Email() {
        return <div>test</div>;
      }
    `;
    try {
      await compileReactEmail(source, { sandbox: "vm" });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain("not allowed");
    }
  });

  test("rejects source exceeding 256KB", async () => {
    const source = `
      import React from "react";
      export default function Email() {
        return <div>${"x".repeat(260_000)}</div>;
      }
    `;
    try {
      await compileReactEmail(source, { sandbox: "vm" });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).message).toContain("256");
    }
  });
});

describe("Pathological input handling", () => {
  test("deeply nested CSS selectors complete within timeout", () => {
    // Create HTML with deeply nested elements and CSS
    const depth = 50;
    let html = "<html><head><style>";
    html += Array.from({ length: depth }, (_, i) => `.l${i}`).join(" > ") + " { color: red; }";
    html += "</style></head><body>";
    html += Array.from({ length: depth }, (_, i) => `<div class="l${i}">`).join("");
    html += "text";
    html += "</div>".repeat(depth);
    html += "</body></html>";

    const start = Date.now();
    const warnings = analyzeEmail(html);
    const elapsed = Date.now() - start;

    // Should complete in under 5 seconds
    expect(elapsed).toBeLessThan(5000);
    expect(Array.isArray(warnings)).toBe(true);
  });
});
