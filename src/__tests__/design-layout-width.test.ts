import { describe, expect, test } from "bun:test";
import { layoutWidth } from "../design/shell";

describe("layoutWidth", () => {
  // A 600px frame fires the common `max-width: 600px` breakpoint, which real
  // desktop panes never do: a customer's Outlook Classic sim lost its CTA
  // headline and a whole table to it (2026-11-02).
  test("a desktop client lays out wider than a 600px breakpoint", () => {
    expect(layoutWidth("outlook-windows-legacy")).toBeGreaterThan(600);
    expect(layoutWidth("gmail-web")).toBeGreaterThan(600);
  });

  test("a phone lays out at its device width", () => {
    expect(layoutWidth("apple-mail-ios")).toBe(393);
  });

  test("Gmail Android lays out at its message view, not the screen", () => {
    expect(layoutWidth("gmail-android")).toBe(396);
  });

  test("no client is the email's own 600px", () => {
    expect(layoutWidth(null)).toBe(600);
    expect(layoutWidth("not-a-client")).toBe(600);
  });
});
