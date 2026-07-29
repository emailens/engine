import { describe, test, expect } from "bun:test";
import { mapSupportCode, getLatestSupport, getLatestNotes } from "../../scripts/sync-caniemail";

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
