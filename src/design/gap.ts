/**
 * How a real capture differs from the live preview of the same email: the
 * scale and offset the real client drew it at, and how far down the two
 * still agree. Every engine refinement so far started by measuring this by
 * hand (run C93iCoVV5yas: zoomed out to 0.855; run sGYezPFjFWW3: text 12%
 * larger; run GjJM8YpmiwGA: an extra image halfway down). Pure: pixels in,
 * numbers out.
 *
 * Both images are greyscale at one CSS pixel per pixel. The caller brings
 * the real capture to that nominal scale (its device pixel ratio) and cuts
 * it to where the email starts; what is left to find is how the client
 * itself scaled and placed the email.
 */

export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Gap {
  /** Real size over preview size: 1.12 means the client drew it 12% larger. */
  scale: number;
  /** Where the preview's top-left lands in the real capture, CSS px. */
  x: number;
  y: number;
  /** Agreement of the aligned tops, 0 to 1 (normalised cross-correlation). */
  match: number;
  /** Mean difference per band, 0 to 1, top to bottom. */
  bands: { y: number; diff: number }[];
  /** Preview CSS px where the two stop agreeing, or null if they never do. */
  partsAt: number | null;
  /** Mean difference over the whole overlap, 0 to 1. */
  diff: number;
}

/** A Gap as the admin view carries it: the summary, not the bands. */
export type DeviceGap = Omit<Gap, "bands">;

// Below this the tops never lined up (a banner, a crop, the wrong geometry),
// so scale and diff describe a bad alignment, not the client. On run
// sGYezPFjFWW3 good pairs read 0.74 to 0.99; 0.41 to 0.64 were misaligned.
const ALIGNED = 0.7;
// A capture is normalised to CSS px, so a right fit sits at 1:1. There a
// lower match still lines up: small text on a dark or flat email keeps the
// correlation at 0.59 to 0.69 on fits checked by eye (2026-11-04: Tidewave
// on Apple Mail and Outlook Mac, Calendly and Dribbble on Outlook Classic).
// A wrong fit drifts in scale instead (e3bKX64ZQH_i on Yahoo: 0.50 at 1.18).
const ALIGNED_AT_1_1 = 0.55;
const ONE_TO_ONE = 0.03;
export const aligned = (g: Pick<DeviceGap, "match" | "scale">) =>
  g.match >= ALIGNED ||
  (g.match >= ALIGNED_AT_1_1 && Math.abs(g.scale - 1) <= ONE_TO_ONE);

/** One line on a device's gap, as the admin view and its prompt word it. */
export function describeGap(g: DeviceGap): string {
  if (!aligned(g))
    return `could not align with the real capture (match ${g.match.toFixed(2)}), compare by eye`;
  const where =
    g.partsAt === null
      ? "matches the real capture"
      : `parts from the real capture at ${g.partsAt}px`;
  return `${where} (drawn ${g.scale.toFixed(3)}x, match ${g.match.toFixed(2)}, mean difference ${g.diff.toFixed(3)})`;
}

const BAND = 32;
// A band this different, twice running, is where they part. Two text lines
// that sit a few pixels apart read about 0.04 to 0.06; a missing block, 0.15+.
const PARTS = 0.1;
// Only the top is matched to find the scale: below it a real difference
// (an extra image, a reflow) would pull the fit.
const TOP = 600;

/** Box-average down by an integer factor. */
function shrink(img: Gray, f: number): Gray {
  if (f === 1) return img;
  const width = Math.max(1, Math.floor(img.width / f));
  const height = Math.max(1, Math.floor(img.height / f));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * img.width + x * f;
        for (let dx = 0; dx < f; dx++) sum += img.data[row + dx];
      }
      data[y * width + x] = sum / (f * f);
    }
  return { data, width, height };
}

/** Bilinear resample of the top `rows` rows to `scale` times their size. */
function resample(img: Gray, scale: number, rows = img.height): Gray {
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(Math.min(rows, img.height) * scale));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(img.height - 1, y / scale);
    const y0 = Math.floor(fy);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(img.width - 1, x / scale);
      const x0 = Math.floor(fx);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const top =
        img.data[y0 * img.width + x0] * (1 - wx) +
        img.data[y0 * img.width + x1] * wx;
      const bot =
        img.data[y1 * img.width + x0] * (1 - wx) +
        img.data[y1 * img.width + x1] * wx;
      data[y * width + x] = top * (1 - wy) + bot * wy;
    }
  }
  return { data, width, height };
}

/** Normalised cross-correlation of `t` placed at (ox, oy) in `img`. */
function ncc(t: Gray, img: Gray, ox: number, oy: number): number {
  let st = 0;
  let si = 0;
  let stt = 0;
  let sii = 0;
  let sti = 0;
  const n = t.width * t.height;
  for (let y = 0; y < t.height; y++) {
    const trow = y * t.width;
    const irow = (y + oy) * img.width + ox;
    for (let x = 0; x < t.width; x++) {
      const a = t.data[trow + x];
      const b = img.data[irow + x];
      st += a;
      si += b;
      stt += a * a;
      sii += b * b;
      sti += a * b;
    }
  }
  const vt = stt - (st * st) / n;
  const vi = sii - (si * si) / n;
  if (vt <= 0 || vi <= 0) return vt === vi ? 1 : 0;
  return (sti - (st * si) / n) / Math.sqrt(vt * vi);
}

interface Fit {
  scale: number;
  x: number;
  y: number;
  match: number;
}

/** Best placement of the preview's top in `real`, both shrunk by `f`. */
function search(
  sim: Gray,
  real: Gray,
  f: number,
  scales: number[],
  near?: { x: number; y: number; r: number },
): Fit {
  const s = shrink(sim, f);
  const r = shrink(real, f);
  let best: Fit = { scale: 1, x: 0, y: 0, match: -2 };
  for (const scale of scales) {
    const t = resample(s, scale, Math.ceil(TOP / f));
    if (t.width > r.width || t.height > r.height) continue;
    const x0 = near ? Math.max(0, Math.floor(near.x / f) - near.r) : 0;
    const x1 = near
      ? Math.min(r.width - t.width, Math.ceil(near.x / f) + near.r)
      : r.width - t.width;
    const y0 = near ? Math.max(0, Math.floor(near.y / f) - near.r) : 0;
    const y1 = near
      ? Math.min(r.height - t.height, Math.ceil(near.y / f) + near.r)
      : Math.min(r.height - t.height, Math.ceil(SLACK / f));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const m = ncc(t, r, x, y);
        if (m > best.match) best = { scale, x: x * f, y: y * f, match: m };
      }
  }
  return best;
}

const range = (from: number, to: number, step: number) =>
  Array.from(
    { length: Math.round((to - from) / step) + 1 },
    (_, i) => +(from + i * step).toFixed(4),
  );

/** Band-by-band difference once the preview is laid on the real capture. */
function compare(sim: Gray, real: Gray, fit: Fit) {
  const bands: { y: number; diff: number }[] = [];
  for (let y0 = 0; y0 < sim.height; y0 += BAND) {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < Math.min(sim.height, y0 + BAND); y += 2) {
      const ry = Math.round(fit.y + y * fit.scale);
      if (ry >= real.height) break;
      for (let x = 0; x < sim.width; x += 2) {
        const rx = Math.round(fit.x + x * fit.scale);
        if (rx >= real.width) break;
        sum += Math.abs(
          sim.data[y * sim.width + x] - real.data[ry * real.width + rx],
        );
        n++;
      }
    }
    if (n === 0) break;
    bands.push({ y: y0, diff: sum / n / 255 });
  }
  let partsAt: number | null = null;
  for (let i = 0; i + 1 < bands.length; i++)
    if (bands[i].diff > PARTS && bands[i + 1].diff > PARTS) {
      partsAt = bands[i].y;
      break;
    }
  const diff = bands.length
    ? bands.reduce((a, b) => a + b.diff, 0) / bands.length
    : 1;
  return { bands, partsAt, diff };
}

/**
 * The columns that hold the email: a desktop pane is mostly flat background
 * either side, and in a window capture that area is the client's chrome, which
 * pulls the fit (Gmail web read 0.82x, Apple Mail Mac 1.31x, both really 1:1).
 * Each side is flat in its own edge's colour: Gmail web's column is the
 * email's background on the left and Gmail's white pane on the right.
 */
function emailColumns(sim: Gray): { left: number; img: Gray } {
  const rows = Math.min(sim.height, TOP);
  const flat = (x: number, edgeX: number) => {
    for (let y = 0; y < rows; y++) {
      const edge = sim.data[y * sim.width + edgeX];
      if (Math.abs(sim.data[y * sim.width + x] - edge) > 8) return false;
    }
    return true;
  };
  let left = 0;
  while (left < sim.width - 1 && flat(left, 0)) left++;
  let right = sim.width - 1;
  while (right > left && flat(right, sim.width - 1)) right--;
  const width = right - left + 1;
  if (width === sim.width) return { left: 0, img: sim };
  const data = new Uint8Array(width * sim.height);
  for (let y = 0; y < sim.height; y++)
    data.set(
      sim.data.subarray(y * sim.width + left, y * sim.width + right + 1),
      y * width,
    );
  return { left, img: { data, width, height: sim.height } };
}

// Room below the cut for what sits above the email: a desktop window's
// toolbar and message headers (Apple Mail Mac about 100px, Outlook Mac 270).
const SLACK = 320;

export function measureGap(pane: Gray, real: Gray): Gap {
  const { left, img: sim } = emailColumns(pane);
  // Coarse to fine: every scale from 0.7 to 1.4 at 1/8, then around the best.
  const coarse = search(sim, real, 8, range(0.7, 1.4, 0.04));
  const mid = search(
    sim,
    real,
    4,
    range(coarse.scale - 0.04, coarse.scale + 0.04, 0.01),
    {
      x: coarse.x,
      y: coarse.y,
      r: 3,
    },
  );
  const fine = search(
    sim,
    real,
    2,
    range(mid.scale - 0.01, mid.scale + 0.01, 0.0025),
    {
      x: mid.x,
      y: mid.y,
      r: 3,
    },
  );
  // Full size last: at half size an odd trimmed margin has no grid point to
  // land on, and the fit drifts in scale instead (0.9975x on identical shots).
  const full = search(
    sim,
    real,
    1,
    range(fine.scale - 0.0025, fine.scale + 0.0025, 0.00125),
    { x: fine.x, y: fine.y, r: 2 },
  );
  // Reported for the pane's top-left, as before the trim.
  const x = Math.round(full.x - left * full.scale);
  return { ...full, x, ...compare(sim, real, full) };
}

type Summary = Pick<DeviceGap, "match" | "scale" | "diff">;

// Mean difference under this reads as the same email by eye: Gmail web's
// font-rounding drift sits at 0.03, a rewrapped paragraph at 0.08 and up.
const SAME = 0.05;
// Run-to-run noise of a replay; a difference smaller than this is none.
export const NOISE = 0.01;

/** The capture reproduces the live preview: aligned and the same by eye. */
export const matches = (g: Summary) => aligned(g) && g.diff < SAME;

/**
 * A real capture shot before its images arrived: it matches the preview
 * with every image failed (`bare`) better than the full one. J9vFS4nm_LGl on
 * Proton: 0.057 bare against 0.165 full; checked by eye on the fidelity board
 * (2026-11-06, 4 of 4 flags right). A half-drawn image aligns with neither.
 */
export const imagesMissing = (full: Summary, bare: Summary) =>
  aligned(bare) && bare.diff + NOISE < full.diff;
