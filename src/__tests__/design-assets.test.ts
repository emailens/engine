import { expect, test } from "bun:test";
import { sharedAssets } from "../design/check";

// React Email's Matte loads a 9.2 MB image that takes about a minute: each
// page fetched it on its own, so whether either shot had it was a race and
// the verdict flipped between runs (2026-11-12). Within a check, an asset is
// fetched once and both pages get the same answer, or the same failure.

const asset = (n: number) => ({ status: 200, headers: {}, body: Buffer.from([n]) });

test("an asset is fetched once and both pages get the same bytes", async () => {
  let calls = 0;
  const get = sharedAssets(1000);
  const fetchIt = async () => asset(++calls);
  const [a, b] = [await get("https://x/hero.png", fetchIt), await get("https://x/hero.png", fetchIt)];
  expect(calls).toBe(1);
  expect(a).toBe(b);
});

test("one that is not back by the deadline fails for both pages", async () => {
  const get = sharedAssets(50);
  const never = () => new Promise<never>(() => {});
  const t = performance.now();
  expect(await get("https://x/slow.png", never)).toBeNull();
  expect(await get("https://x/slow.png", async () => asset(1))).toBeNull();
  expect(performance.now() - t).toBeLessThan(500);
});

test("a fetch that throws is a failure, not a crash", async () => {
  const get = sharedAssets(1000);
  expect(
    await get("https://x/gone.png", async () => {
      throw new Error("net::ERR_NAME_NOT_RESOLVED");
    }),
  ).toBeNull();
});
