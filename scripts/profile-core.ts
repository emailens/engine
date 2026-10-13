#!/usr/bin/env bun
/**
 * Run one hot engine stage for an external V8 CPU profile.
 *
 * Usage:
 *   bun --cpu-prof-md --cpu-prof-name=compatibility run scripts/profile-core.ts compatibility 1000
 *   bun --cpu-prof-md --cpu-prof-name=transforms run scripts/profile-core.ts transforms 1000
 *
 * The profiler captures the process, but the measured loop dominates samples.
 * Framework source compilation and DOM preparation happen before the loop.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeDocument } from "../src/analyze";
import { loadHtml } from "../src/parse-html";
import { transformForAllClients } from "../src/transform";
import { loadFrameworkFixtures } from "./framework-fixtures";

const stage = process.argv[2];
const count = Number(process.argv[3] ?? 1_000);
if (stage !== "compatibility" && stage !== "transforms") {
  throw new Error("Choose one profile: compatibility | transforms [iterations]");
}
if (!Number.isInteger(count) || count < 1) throw new Error("Iterations must be a positive integer.");

const fixtureDir = join(import.meta.dir, "..", "src", "__tests__", "fixtures");
const provenance = JSON.parse(readFileSync(join(fixtureDir, "open-source", "provenance.json"), "utf8")) as {
  fixtures: Array<{ file: string }>;
};
const synthetic = JSON.parse(readFileSync(join(fixtureDir, "synthetic", "provenance.json"), "utf8")) as {
  fixtures: Array<{ file: string }>;
};
const htmlFixtures = [
  ...["client-campaign.html", "abandoned-cart-warm.html", "shipping-luxe.html", "mjml-newsletter.html"]
    .map((name) => ({ name, html: readFileSync(join(fixtureDir, name), "utf8") })),
  ...provenance.fixtures.filter(({ file }) => file.endsWith(".html"))
    .map(({ file }) => ({ name: `open-source/${file}`, html: readFileSync(join(fixtureDir, "open-source", file), "utf8") })),
  ...synthetic.fixtures.map(({ file }) => ({ name: `synthetic/${file}`, html: readFileSync(join(fixtureDir, "synthetic", file), "utf8") })),
  ...await loadFrameworkFixtures(),
];
const prepared = htmlFixtures.map(({ name, html }) => ({ name, html, dom: loadHtml(html) }));
const progressEvery = Math.max(1, Math.ceil(count / 10));
let sink = 0;
const start = performance.now();

for (let i = 0; i < count; i++) {
  const { html, dom } = prepared[i % prepared.length];
  if (stage === "compatibility") sink += analyzeDocument(dom, html).warnings.length;
  else sink += transformForAllClients(html).reduce((sum, result) => sum + result.html.length + result.warnings.length, 0);
  if ((i + 1) % progressEvery === 0 || i === count - 1) {
    console.log(`${stage}: ${i + 1}/${count}`);
  }
}

console.log(JSON.stringify({ stage, count, corpusSize: prepared.length, elapsedMs: performance.now() - start, sink }));
