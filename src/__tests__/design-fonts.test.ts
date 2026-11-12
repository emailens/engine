import { afterEach, expect, spyOn, test } from "bun:test";
import { font } from "../design/check";

// A stand-in that cannot be fetched falls back to the host's own face, and
// the verdicts drift with it (a plain table read "changed" on a bare Linux
// runner, 2026-11-12). That must be said, not swallowed.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a stand-in font that cannot be fetched is reported once", async () => {
  globalThis.fetch = (async () => new Response("blocked", { status: 403 })) as typeof fetch;
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  expect(await font("zz-not-cached-1.woff2")).toBeNull();
  expect(await font("zz-not-cached-2.woff2")).toBeNull();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(String(warn.mock.calls[0][0])).toContain("fonts");
  warn.mockRestore();
});
