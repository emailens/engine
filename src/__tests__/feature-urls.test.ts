import { describe, expect, test } from "bun:test";
import { CSS_SUPPORT, FEATURE_URLS, featureUrl } from "../index";

/**
 * A rule's page on caniemail, for a diagnostic's `codeDescription`.
 *
 * The point of generating these rather than deriving them: the URL cannot be
 * computed from the key. `border-radius` is `/features/css-border-radius/`,
 * `<abbr>` is `/features/html-abbr/`, `:hover` is
 * `/features/css-pseudo-class-hover/`, and `<a download>` is
 * `/features/html-a-download/`. Guessing means shipping 404s, and a link that
 * goes nowhere is worse than no link at all.
 */

describe("caniemail links", () => {
  test("nearly every feature has one", () => {
    const known = Object.keys(CSS_SUPPORT).length;
    expect(Object.keys(FEATURE_URLS).length).toBeGreaterThan(known * 0.95);
  });

  test("the ones with no caniemail entry get nothing rather than a guess", () => {
    // `top`, `right` and `bottom` are documented under `css-position`, and
    // `color` and `font-family` have no entry of their own. Naming them keeps
    // the gap deliberate: if a resync gives them pages this fails and the
    // comment gets deleted.
    const missing = Object.keys(CSS_SUPPORT).filter((key) => !(key in FEATURE_URLS));
    expect(missing.sort()).toEqual(["bottom", "color", "font-family", "right", "top"]);
    for (const key of missing) expect(featureUrl(key)).toBeUndefined();
  });

  test("no link points at a feature the matrix does not carry", () => {
    // Dead weight in every bundle that imports this, and a link for a code
    // nothing can ever report.
    for (const key of Object.keys(FEATURE_URLS)) {
      expect([key, key in CSS_SUPPORT]).toEqual([key, true]);
    }
  });

  test("every URL is a caniemail feature page", () => {
    for (const [key, url] of Object.entries(FEATURE_URLS)) {
      expect([key, /^https:\/\/www\.caniemail\.com\/features\/[a-z0-9-]+\/$/.test(url)]).toEqual([
        key,
        true,
      ]);
    }
  });

  test("the shapes that cannot be derived from the key are right", () => {
    expect(featureUrl("border-radius")).toBe("https://www.caniemail.com/features/css-border-radius/");
    expect(featureUrl("<abbr>")).toBe("https://www.caniemail.com/features/html-abbr/");
    expect(featureUrl(":hover")).toBe("https://www.caniemail.com/features/css-pseudo-class-hover/");
    expect(featureUrl("@media")).toBe("https://www.caniemail.com/features/css-at-media/");
    expect(featureUrl("::before")).toBe(
      "https://www.caniemail.com/features/css-pseudo-element-before/",
    );
  });

  test("a rule id that is not a feature has no link", () => {
    expect(featureUrl("img-missing-alt")).toBeUndefined();
    expect(featureUrl("")).toBeUndefined();
  });
});
