import { describe, expect, test } from "bun:test";
import { EMAIL_CLIENTS, analyzeEmail, generateCompatibilityScore } from "../index";

// Real-device run C93iCoVV5yas (preview 9OIChQggAtbG), 2026-11-03: every
// <img> pointed at a relative path (src="images/logo.png"). All eight real
// clients drew a broken image in its place, the logo and the social icons
// included, while the report scored most clients 94. An email has no page
// address to resolve a relative path against, so it can never load.
const page = (src: string) =>
  `<html><body><table><tr><td><img src="${src}" alt="Logo" width="150"></td></tr></table></body></html>`;

describe("images that cannot load in any inbox", () => {
  for (const src of ["images/logo.png", "./logo.png", "/img/logo.png", "file:///C:/mail/logo.png", "http://localhost:3000/logo.png", "http://127.0.0.1/logo.png", ""]) {
    test(`src="${src}" is an error in every client`, () => {
      const warnings = analyzeEmail(page(src)).filter((w) => w.property === "<img src>");
      expect(new Set(warnings.map((w) => w.client))).toEqual(new Set(EMAIL_CLIENTS.map((c) => c.id)));
      expect(warnings.every((w) => w.severity === "error")).toBe(true);
      const scores = generateCompatibilityScore(warnings);
      expect(Object.values(scores).every((s) => s.score === 90)).toBe(true);
    });
  }

  for (const src of ["https://cdn.example.com/logo.png", "http://example.com/logo.png", "//cdn.example.com/logo.png", "cid:logo@mail", "data:image/png;base64,iVBORw0KGgo=", "{{logo_url}}", "*|LOGO|*"]) {
    test(`src="${src}" is not flagged`, () => {
      expect(analyzeEmail(page(src)).filter((w) => w.property === "<img src>")).toEqual([]);
    });
  }
});
