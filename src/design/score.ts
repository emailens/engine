// A client's score once the render counts (docs/fidelity/score-from-render.md):
// a deduction is as strong as our evidence that readers see the problem.
// Pure.

import type { Kept, Verdict } from "./kept";

/**
 * Clients whose preview is proven against the real client: held-out 10/10
 * each (docs/fidelity/agreement-heldout-2026-10-31.md), Gmail Android 24/24
 * on the device. A client joins when a new held-out run proves it.
 */
export const PROVEN = new Set([
  "gmail-web",
  "gmail-android",
  "yahoo-mail",
  "protonmail",
  "apple-mail-macos",
  "outlook-macos",
]);

/** A broken design where the preview is proven: Broken. */
const PROVEN_CAP = 49;
/** Where it is not: Needs work, to confirm on a real device. */
const UNPROVEN_CAP = 79;
/** An image every reader sees as an empty box: as much as an engine error. */
export const DEAD_IMAGE = 10;

export function renderScores(
  engine: Record<string, number>,
  verdicts: Record<string, Verdict>,
  deadImages: number,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(engine).map(([client, score]) => {
      const s = Math.max(0, score - DEAD_IMAGE * deadImages);
      if (verdicts[client] !== "broken") return [client, s];
      return [
        client,
        Math.min(s, PROVEN.has(client) ? PROVEN_CAP : UNPROVEN_CAP),
      ];
    }),
  );
}
