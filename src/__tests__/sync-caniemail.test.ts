import { describe, test, expect } from "bun:test";
import {
  mapSupportCode,
  getLatestSupport,
  getLatestNotes,
  featureToPropertyKey,
  kindOfKey,
  normalizeTestDate,
} from "../../scripts/sync-caniemail";

describe("mapSupportCode", () => {
  test("maps caniemail codes to support levels", () => {
    expect(mapSupportCode("y")).toBe("supported");
    expect(mapSupportCode("a")).toBe("partial");
    expect(mapSupportCode("n")).toBe("unsupported");
    expect(mapSupportCode("u")).toBe("unknown");
  });

  test("strips note references before mapping", () => {
    expect(mapSupportCode("a #1 #3")).toBe("partial");
    expect(mapSupportCode("y #2")).toBe("supported");
  });

  test("unknown codes fall back to 'unknown'", () => {
    expect(mapSupportCode("")).toBe("unknown");
    expect(mapSupportCode("?")).toBe("unknown");
  });
});

describe("getLatestSupport", () => {
  test("picks the chronologically latest version (numeric-aware)", () => {
    expect(getLatestSupport({ "9": "n", "10": "y" })).toBe("supported");
    expect(getLatestSupport({ "1": "y", "2": "a" })).toBe("partial");
  });

  test("empty version map is unknown", () => {
    expect(getLatestSupport({})).toBe("unknown");
  });
});

describe("getLatestNotes", () => {
  const notesByNum = { "1": "Negative values are not supported.", "3": "auto is not supported." };

  test("resolves the latest version's note references", () => {
    expect(getLatestNotes({ "1": "a #1", "2": "a #1 #3" }, notesByNum)).toEqual([
      "Negative values are not supported.",
      "auto is not supported.",
    ]);
  });

  test("returns [] when the latest code has no note references", () => {
    expect(getLatestNotes({ "1": "y" }, notesByNum)).toEqual([]);
  });

  test("returns [] when there is no notes map", () => {
    expect(getLatestNotes({ "1": "a #1" }, null)).toEqual([]);
  });

  test("ignores references with no matching note text", () => {
    expect(getLatestNotes({ "1": "a #9" }, notesByNum)).toEqual([]);
  });
});

// ─── Classification and date hygiene ────────────────────────────────────────
// These two decide, respectively, which detector a feature gets and whether
// `check:freshness` can see it. Both are pure, and neither was reachable from
// a test until they were exported.

describe("kindOfKey", () => {
  test("routes on the caniemail category and slug, not on the key's shape", () => {
    expect(kindOfKey("webp", "image-webp", "image")).toBe("image");
    expect(kindOfKey("[align]", "html-align", "html")).toBe("html-attribute");
    expect(kindOfKey('<input type="text">', "html-input-text", "html")).toBe("html-element");
    expect(kindOfKey("@media hover", "css-at-media-hover", "css")).toBe("at-rule");
    expect(kindOfKey("margin", "css-margin", "css")).toBe("css-property");
    expect(kindOfKey("calc", "css-unit-calc", "css")).toBe("css-function");
    expect(kindOfKey(":hover", "css-pseudo-class-hover", "css")).toBe("selector");
    expect(kindOfKey("::after", "css-pseudo-element-after", "css")).toBe("selector");
    expect(kindOfKey("display:flex", "css-display-flex", "css")).toBe("compound-value");
    expect(kindOfKey("doctype", "html-doctype", "html")).toBe("html-misc");
  });

  test("the slug wins over the key: `amp` is misc even though it reads like a property", () => {
    // `amp4email` is a bare lowercase word, which every shape test would call a
    // CSS property. Only the slug says otherwise.
    expect(kindOfKey("amp4email", "amp", "html")).toBe("html-misc");
    expect(kindOfKey("html5-semantics", "html-semantics", "html")).toBe("html-misc");
  });

  test("an image slug is an image whatever its key looks like", () => {
    // `svg` the image format and `<svg>` the element are different features
    // with different rows; the category is what keeps them apart.
    expect(kindOfKey("svg", "image-svg", "image")).toBe("image");
    expect(kindOfKey("<svg>", "html-svg", "html")).toBe("html-element");
  });
});

describe("normalizeTestDate", () => {
  test("pads a hand-entered date", () => {
    // caniemail ships "2024-05-1" today. Zero-padding is what makes the plain
    // string comparison in the collision branch sound.
    expect(normalizeTestDate("2024-05-1")).toBe("2024-05-01");
    expect(normalizeTestDate("2024-5-1")).toBe("2024-05-01");
    expect(normalizeTestDate("2024-05-01")).toBe("2024-05-01");
    expect(normalizeTestDate(" 2024-05-01 ")).toBe("2024-05-01");
  });

  test("drops anything it cannot read rather than passing it to a Date", () => {
    // `daysSince` in check-data-freshness returns NaN on a bad date, and
    // `NaN > STALE` is false, so an unreadable date would read as fresh.
    for (const bad of ["2024-05", "May 2024", "2026-08-10 15:16:24 +0000", "", "  ", undefined]) {
      expect([bad, normalizeTestDate(bad)]).toEqual([bad, ""]);
    }
  });

  test("padding keeps chronological order under string comparison", () => {
    expect(normalizeTestDate("2024-5-9") < normalizeTestDate("2024-05-10")).toBe(true);
    expect(normalizeTestDate("2019-2-28") < normalizeTestDate("2024-1-1")).toBe(true);
  });
});

describe("featureToPropertyKey", () => {
  const feature = (slug: string, category: string, title = "") =>
    ({ slug, category, title } as Parameters<typeof featureToPropertyKey>[0]);

  test("keys each family the way its detector expects to find it", () => {
    expect(featureToPropertyKey(feature("image-webp", "image"))).toBe("webp");
    expect(featureToPropertyKey(feature("css-at-media-hover", "css"))).toBe("@media hover");
    expect(featureToPropertyKey(feature("html-input-text", "html"))).toBe('<input type="text">');
    expect(featureToPropertyKey(feature("html-align", "html"))).toBe("[align]");
    expect(featureToPropertyKey(feature("css-margin", "css", "margin"))).toBe("margin");
  });

  test("an element title is read from the title, not guessed from the slug", () => {
    expect(featureToPropertyKey(feature("html-marquee", "html", "<marquee> element"))).toBe(
      "<marquee>",
    );
  });

  test("an unrecognised shape returns null rather than a made-up key", () => {
    expect(featureToPropertyKey(feature("html-something-new", "html", "Some new thing"))).toBeNull();
  });
});
