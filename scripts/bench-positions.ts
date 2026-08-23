#!/usr/bin/env bun
/**
 * bench-positions.ts — What does `positions: true` cost?
 *
 * Source positions ask parse5 for a location record per node and per
 * attribute, so the option is opt-in. This measures the overhead of a full
 * `auditEmail()` with and without it, across the repo's real-world fixtures,
 * so the default stays an informed choice rather than a guess.
 *
 * Usage:
 *   bun run bench:positions           # or: bun run scripts/bench-positions.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditEmail } from "../src/index";
import { loadHtml } from "../src/parse-html";

const FIXTURES = [
  "cerberus-newsletter.html",
  "leemunroe-responsive.html",
  "receipt-notification.html",
];

const ITERATIONS = 200;
const WARMUP = 20;

/**
 * Cost is not flat in document size — the fixtures are ~10KB, which is typical
 * for an email (Gmail clips at ~102KB), but an editor will occasionally be
 * pointed at something much larger. These sizes bracket that.
 */
const SCALED_KB = [100, 450];
const SCALED_ITERATIONS = 5;

function bench(run: () => void, iterations = ITERATIONS): number {
  for (let i = 0; i < Math.min(WARMUP, iterations); i++) run();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) run();
  return (performance.now() - start) / iterations;
}

function delta(off: number, on: number): string {
  const pct = (on / off - 1) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

console.log(`parse only, then a full auditEmail() — mean of ${ITERATIONS} runs (${SCALED_ITERATIONS} for the scaled sizes)\n`);
console.log(
  "fixture                        size   parse off   parse on   audit off   audit on   delta",
);
console.log("─".repeat(94));

const fixtures: Array<{ name: string; html: string; iterations: number }> = [];
for (const name of FIXTURES) {
  fixtures.push({
    name,
    html: readFileSync(join(import.meta.dir, "..", "src", "__tests__", "fixtures", name), "utf8"),
    iterations: ITERATIONS,
  });
}

// Scaled-up copies of the largest fixture, to show how the cost grows.
const largest = fixtures.reduce((a, b) => (a.html.length > b.html.length ? a : b));
for (const kb of SCALED_KB) {
  const copies = Math.max(1, Math.round((kb * 1024) / largest.html.length));
  fixtures.push({
    name: `${largest.name} ×${copies}`,
    html: largest.html.repeat(copies),
    iterations: SCALED_ITERATIONS,
  });
}

for (const { name, html, iterations } of fixtures) {
  const runs = iterations;
  const parseOff = bench(() => loadHtml(html), runs);
  const parseOn = bench(() => loadHtml(html, { positions: true }), runs);
  const auditOff = bench(() => auditEmail(html), runs);
  const auditOn = bench(() => auditEmail(html, { positions: true }), runs);

  const ms = (n: number) => `${n.toFixed(2)}ms`.padStart(10);
  console.log(
    `${name.padEnd(30).slice(0, 30)} ${`${Math.round(html.length / 1024)}KB`.padStart(5)} ` +
      `${ms(parseOff)} ${ms(parseOn)} ${ms(auditOff)} ${ms(auditOn)} ` +
      `${delta(auditOff, auditOn).padStart(7)}`,
  );
}
