import { describe, expect, test } from "bun:test";
import { transformForClient } from "../index";

describe("Yahoo web removes where a form submits", () => {
  // Six forms sent to our Yahoo seed, delivered HTML read back (2026-10-29).
  const html =
    `<html><body><form action="https://example.com/s" method="post"><input type="email" name="e">` +
    `<button type="submit" formaction="https://example.com/v">go</button></form></body></html>`;

  test("drops action, formaction and type=email, keeps the form and its method", () => {
    const t = transformForClient(html, "yahoo-mail");
    expect(t.html).toContain('<form method="post" target="_blank">');
    expect(t.html).not.toContain("action=");
    expect(t.html).not.toContain('type="email"');
    expect(t.warnings.some((w) => w.property === "<form>" && w.severity === "error")).toBe(true);
  });

  test("other clients keep them", () => {
    expect(transformForClient(html, "apple-mail-macos").html).toContain('action="https://example.com/s"');
  });
});
