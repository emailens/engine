import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  type Gray,
  imagesMissing,
  matches,
  measureGap,
} from "../design/gap";

// A made-up email: white page, dark blocks of varied size, like text and
// images. Seeded so the test is the same every run.
function page(width: number, height: number, seed = 7): Gray {
  const data = new Uint8Array(width * height).fill(255);
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 160; i++) {
    const w = 8 + Math.floor(rnd() * 60);
    const h = 4 + Math.floor(rnd() * 24);
    const x0 = Math.floor(rnd() * (width - w));
    const y0 = Math.floor(rnd() * (height - h));
    const v = Math.floor(rnd() * 160);
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) data[y * width + x] = v;
  }
  return { data, width, height };
}

// The real client drew the same email `scale` times larger, at (left, top).
function drawn(
  sim: Gray,
  scale: number,
  left: number,
  top: number,
  width: number,
  height: number,
): Gray {
  const data = new Uint8Array(width * height).fill(255);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.floor((x - left) / scale);
      const sy = Math.floor((y - top) / scale);
      if (sx >= 0 && sy >= 0 && sx < sim.width && sy < sim.height)
        data[y * width + x] = sim.data[sy * sim.width + sx];
    }
  return { data, width, height };
}

describe("measureGap: how a real capture differs from the live preview", () => {
  const sim = page(400, 900);

  test("finds the scale and offset a client drew the email at", () => {
    // Gmail Android, run sGYezPFjFWW3: the email filled the screen with its
    // text about 12% larger than the live preview's.
    const real = drawn(sim, 1.12, 24, 6, 520, 1050);
    const gap = measureGap(sim, real);
    expect(gap.scale).toBeCloseTo(1.12, 1);
    expect(Math.abs(gap.scale - 1.12)).toBeLessThan(0.015);
    expect(Math.abs(gap.x - 24)).toBeLessThanOrEqual(3);
    expect(Math.abs(gap.y - 6)).toBeLessThanOrEqual(3);
    expect(gap.partsAt).toBeNull();
  });

  test("an identical capture is scale 1 and never parts", () => {
    const gap = measureGap(sim, drawn(sim, 1, 0, 0, 400, 900));
    expect(gap.scale).toBeCloseTo(1, 2);
    expect(gap.partsAt).toBeNull();
    expect(gap.diff).toBeLessThan(0.02);
  });

  // colorlib~13 on Samsung Mail (design check, 2026-11-12): two pixel-identical
  // shots read 0.025, "changed". The flat margin trimmed off the pane was an
  // odd width, the half-size search could not land on it, and the fit settled
  // at 0.9975x: a few px of drift by the foot of a tall email.
  test("an identical shot with an odd margin fits 1:1 and reads no difference", () => {
    const email = page(345, 2600, 13);
    const pane: Gray = {
      data: new Uint8Array(360 * 2600).fill(250),
      width: 360,
      height: 2600,
    };
    for (let y = 0; y < 2600; y++)
      pane.data.set(email.data.subarray(y * 345, y * 345 + 345), y * 360 + 7);
    const gap = measureGap(pane, pane);
    expect(gap.scale).toBe(1);
    expect(gap.diff).toBeLessThan(0.001);
  });

  // A one-line table on Apple Mail (design check, 2026-11-12): two identical
  // 900x66 shots, mostly blank, fit at 1.0063x and read 0.011. The coarse
  // passes see a flat landscape and each finer one only searches near the
  // last, so the cascade never got back to 1:1, where a right fit sits.
  test("a short, mostly blank identical shot still fits 1:1", () => {
    // The shot itself: our own one-line test email, greyscale at 1 CSS px.
    const line: Gray = {
      data: new Uint8Array(
        readFileSync(join(import.meta.dir, "fixtures/gap-one-line-900x66.gray")),
      ),
      width: 900,
      height: 66,
    };
    const gap = measureGap(line, line);
    expect(gap.scale).toBe(1);
    expect(gap.diff).toBeLessThan(0.001);
  });

  // Gmail web and Apple Mail Mac, all 32 runs measured 2026-11-04: the 600px
  // email drawn 1:1 in a window (sidebar, toolbar, headers ~100px above it)
  // read as 0.82x and 1.31x, because the live preview's flat pane either side
  // of the email was matched against the window's chrome.
  test("a window capture is measured on the email, not the pane around it", () => {
    const email = page(300, 900, 11);
    // The live preview pane: the email centred in flat grey, as a desktop client.
    const pane: Gray = {
      data: new Uint8Array(700 * 900).fill(240),
      width: 700,
      height: 900,
    };
    for (let y = 0; y < 900; y++)
      pane.data.set(email.data.subarray(y * 300, y * 300 + 300), y * 700 + 200);
    // The real window: busy chrome everywhere, the email 1:1 at (380, 110).
    const real = page(1000, 1100, 5);
    for (let y = 0; y < 900; y++)
      real.data.set(
        email.data.subarray(y * 300, y * 300 + 300),
        (y + 110) * 1000 + 380,
      );
    const gap = measureGap(pane, real);
    expect(Math.abs(gap.scale - 1)).toBeLessThan(0.01);
    expect(gap.match).toBeGreaterThan(0.9);
    expect(gap.partsAt).toBeNull();
  });

  // Gmail web since its 796px message column (fidelity bench, 2026-11-09):
  // the email's grey fills the column, Gmail's white pane the rest. Each side
  // is flat in its own colour; read against the left edge, the right side
  // never was, the white pane stayed in, and the fit fell to 0.68x.
  test("a pane that differs left and right is trimmed on both sides", () => {
    const email = page(300, 900, 11);
    const pane: Gray = {
      data: new Uint8Array(700 * 900),
      width: 700,
      height: 900,
    };
    for (let y = 0; y < 900; y++) {
      pane.data.fill(200, y * 700, y * 700 + 450);
      pane.data.fill(255, y * 700 + 450, y * 700 + 700);
      pane.data.set(email.data.subarray(y * 300, y * 300 + 300), y * 700 + 75);
    }
    const real = page(1000, 1100, 5);
    for (let y = 0; y < 900; y++)
      real.data.set(
        email.data.subarray(y * 300, y * 300 + 300),
        (y + 110) * 1000 + 380,
      );
    const gap = measureGap(pane, real);
    expect(Math.abs(gap.scale - 1)).toBeLessThan(0.01);
    expect(gap.match).toBeGreaterThan(0.9);
  });

  test("says where the two part when the real email changes halfway down", () => {
    // As in run GjJM8YpmiwGA: the same top, then the live preview drew an
    // image the real client did not.
    const real = drawn(sim, 1, 0, 0, 400, 900);
    const other = page(400, 900, 99);
    for (let i = 450 * 400; i < real.data.length; i++)
      real.data[i] = other.data[i];
    const gap = measureGap(sim, real);
    expect(gap.scale).toBeCloseTo(1, 2);
    expect(gap.partsAt).not.toBeNull();
    expect(Math.abs((gap.partsAt ?? 0) - 450)).toBeLessThanOrEqual(40);
  });
});

// J9vFS4nm_LGl on Proton: shot before its images arrived, it lined up with the
// email rendered with every image failed (diff 0.057) far better than with
// them (0.165). Outlook Classic, images loaded, went the other way.
describe("imagesMissing: a capture shot before its images loaded", () => {
  const full = { match: 0.57, scale: 0.665, diff: 0.165 };
  test("closer to the email without images", () => {
    expect(imagesMissing(full, { match: 0.91, scale: 1, diff: 0.057 })).toBe(
      true,
    );
  });
  test("no call within the replay's noise, or when unaligned", () => {
    expect(imagesMissing(full, { match: 0.91, scale: 1, diff: 0.16 })).toBe(
      false,
    );
    expect(imagesMissing(full, { match: 0.25, scale: 0.7, diff: 0.02 })).toBe(
      false,
    );
  });
  test("a capture that matches needs no second look", () => {
    expect(matches({ match: 0.99, scale: 1, diff: 0.018 })).toBe(true);
    expect(matches(full)).toBe(false);
  });
});
