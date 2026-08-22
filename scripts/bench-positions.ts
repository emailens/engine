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

function bench(run: () => void): number {
  for (let i = 0; i < WARMUP; i++) run();
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) run();
  return (performance.now() - start) / ITERATIONS;
}

function delta(off: number, on: number): string {
  const pct = (on / off - 1) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

console.log(`mean of ${ITERATIONS} runs — parse only, then a full auditEmail()\n`);
console.log(
  "fixture                        size   parse off   parse on   audit off   audit on   delta",
);
console.log("─".repeat(94));

for (const name of FIXTURES) {
  const html = readFileSync(
    join(import.meta.dir, "..", "src", "__tests__", "fixtures", name),
    "utf8",
  );
  const parseOff = bench(() => loadHtml(html));
  const parseOn = bench(() => loadHtml(html, { positions: true }));
  const auditOff = bench(() => auditEmail(html));
  const auditOn = bench(() => auditEmail(html, { positions: true }));

  const ms = (n: number) => `${n.toFixed(2)}ms`.padStart(10);
  console.log(
    `${name.padEnd(30)} ${`${Math.round(html.length / 1024)}KB`.padStart(5)} ` +
      `${ms(parseOff)} ${ms(parseOn)} ${ms(auditOff)} ${ms(auditOn)} ` +
      `${delta(auditOff, auditOn).padStart(7)}`,
  );
}
