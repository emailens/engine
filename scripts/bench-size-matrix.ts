#!/usr/bin/env bun
/**
 * Controlled input-size benchmark. Unlike bench:core, each row uses one email
 * padded with a text node to a fixed HTML character size, isolating size growth
 * from template diversity/node-count changes.
 *
 * Run: bun run bench:sizes [--quick] [--stages=parse,compatibility,audit,transforms]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeDocument } from "../src/analyze";
import { auditEmail } from "../src/audit";
import { loadHtml } from "../src/parse-html";
import { transformForAllClients } from "../src/transform";

const FIXTURE_DIR = join(import.meta.dir, "..", "src", "__tests__", "fixtures");
const BASE_HTML = readFileSync(join(FIXTURE_DIR, "shipping-luxe.html"), "utf8");
const QUICK = process.argv.includes("--quick");
const INCLUDE_NEAR_LIMIT = process.argv.includes("--near-limit");
const singleSizeKb = Number(process.argv.find((arg) => arg.startsWith("--size-kb="))?.slice(10));
const stagesArg = process.argv.find((arg) => arg.startsWith("--stages="))?.slice(9);
const stages = new Set((stagesArg ?? "parse,compatibility,audit,transforms").split(","));
const sizes = Number.isFinite(singleSizeKb) && singleSizeKb > 0
  ? [singleSizeKb * 1024]
  : QUICK
    ? [10 * 1024, 50 * 1024]
    : [10 * 1024, 50 * 1024, 250 * 1024, ...(INCLUDE_NEAR_LIMIT ? [1024 * 1024, 1900 * 1024] : [])];
const validStages = new Set(["parse", "compatibility", "audit", "transforms"]);
for (const stage of stages) if (!validStages.has(stage)) throw new Error(`Unknown stage: ${stage}`);

function sizedEmail(target: number): string {
  const marker = "<p class=\"benchmark-copy\">";
  const textLength = Math.max(0, target - BASE_HTML.length - marker.length - 6);
  const html = BASE_HTML.replace("</body>", `${marker}${"x".repeat(textLength)}</p></body>`);
  if (html.length > target + 16) throw new Error(`Cannot construct ${target}-character fixture`);
  return html;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

function measure(name: string, html: string, run: (html: string) => number, repeats: number) {
  const warmups = repeats >= 5 ? 2 : repeats >= 3 ? 1 : 0;
  for (let i = 0; i < warmups; i++) run(html);
  const samples: number[] = [];
  let sink = 0;
  let maxHeapDelta = 0;
  let maxRssDelta = 0;
  for (let i = 0; i < repeats; i++) {
    Bun.gc(true);
    const before = process.memoryUsage();
    const start = performance.now();
    sink += run(html);
    samples.push(performance.now() - start);
    const after = process.memoryUsage();
    maxHeapDelta = Math.max(maxHeapDelta, Math.max(0, after.heapUsed - before.heapUsed));
    maxRssDelta = Math.max(maxRssDelta, Math.max(0, after.rss - before.rss));
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    stage: name,
    repeats,
    warmups,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxSampleHeapGrowthBytes: maxHeapDelta,
    maxSampleRssGrowthBytes: maxRssDelta,
    sink,
  };
}

const countFor = (size: number) =>
  size <= 50 * 1024 ? (QUICK ? 2 : 10) : size <= 250 * 1024 ? 5 : INCLUDE_NEAR_LIMIT || Number.isFinite(singleSizeKb) ? 3 : 1;
console.log(JSON.stringify({ benchmark: "controlled-size-matrix", runtime: Bun.version, quick: QUICK, sizeUnit: "HTML UTF-16 characters", stages: [...stages] }));

for (const target of sizes) {
  const html = sizedEmail(target);
  const dom = loadHtml(html);
  const results: unknown[] = [];
  const repeats = countFor(target);
  if (stages.has("parse")) results.push(measure("parse", html, (input) => loadHtml(input).root().children().length, repeats));
  if (stages.has("compatibility")) results.push(measure("compatibility-preparsed", html, (input) => analyzeDocument(dom, input).warnings.length, repeats));
  if (stages.has("audit")) results.push(measure("full-audit", html, (input) => {
    const result = auditEmail(input);
    return result.compatibility.warnings.length + result.links.totalLinks + result.images.total;
  }, repeats));
  if (stages.has("transforms")) results.push(measure("all-client-transforms", html, (input) => transformForAllClients(input)
    .reduce((sum, item) => sum + item.html.length + item.warnings.length, 0), repeats));
  console.log(JSON.stringify({ targetChars: target, actualChars: html.length, inputBytes: Buffer.byteLength(html), results }));
}
