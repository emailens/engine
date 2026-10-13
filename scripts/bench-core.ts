#!/usr/bin/env bun
/**
 * Benchmark deterministic Emailens compatibility-core stages on scrubbed,
 * production-shaped HTML fixtures. This is a profiling aid, not a CI test.
 *
 * Run: bun run bench:core
 * The default measures 100 and 1,000 messages for expensive stages, then
 * projects 10,000 from the 1,000-message rate. Cheap stages run all 3 sizes.
 * Pass --full to actually run every stage at 10,000 messages (several minutes).
 * Reports wall time, per-message latency, throughput, sampled peak heap/RSS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeDocument, generateCompatibilityScore } from "../src/analyze";
import { auditEmail } from "../src/audit";
import { loadHtml } from "../src/parse-html";
import { transformForAllClients } from "../src/transform";
import { loadFrameworkFixtures } from "./framework-fixtures";

const WORKLOADS = [100, 1_000, 10_000] as const;
const FIXTURE_DIR = join(import.meta.dir, "..", "src", "__tests__", "fixtures");
const FULL_SCALE = process.argv.includes("--full");
const PROJECTED_STAGES = new Set([
  "compatibility rules (pre-parsed DOM)",
  "full audit (parse + analyzers + report)",
  "all-client transforms",
]);

const provenance = JSON.parse(readFileSync(join(FIXTURE_DIR, "open-source", "provenance.json"), "utf8")) as {
  fixtures: Array<{ file: string }>;
};
const sourceCorpus = provenance.fixtures
  .filter(({ file }) => file.endsWith(".html"))
  .map(({ file }) => ({ name: `open-source/${file}`, html: readFileSync(join(FIXTURE_DIR, "open-source", file), "utf8") }));
const syntheticProvenance = JSON.parse(readFileSync(join(FIXTURE_DIR, "synthetic", "provenance.json"), "utf8")) as {
  fixtures: Array<{ file: string }>;
};
sourceCorpus.push(...syntheticProvenance.fixtures.map(({ file }) => ({
  name: `synthetic/${file}`,
  html: readFileSync(join(FIXTURE_DIR, "synthetic", file), "utf8"),
})));
const frameworkCorpus = await loadFrameworkFixtures();
const corpus = [
  ...[
    "client-campaign.html",
    "abandoned-cart-warm.html",
    "shipping-luxe.html",
    "mjml-newsletter.html",
  ].map((name) => ({ name, html: readFileSync(join(FIXTURE_DIR, name), "utf8") })),
  ...sourceCorpus,
  ...frameworkCorpus,
];
const prepared = corpus.map(({ html }) => ({ html, dom: loadHtml(html) }));
const warnings = prepared.map(({ html, dom }) => analyzeDocument(dom, html).warnings);
const reports = corpus.map(({ html }) => auditEmail(html));

const stages: Array<{ name: string; run: (index: number) => number }> = [
  {
    name: "HTML parse",
    run: (i) => loadHtml(corpus[i % corpus.length].html).root().children().length,
  },
  {
    name: "compatibility rules (pre-parsed DOM)",
    run: (i) => {
      const { html, dom } = prepared[i % prepared.length];
      return analyzeDocument(dom, html).warnings.length;
    },
  },
  {
    name: "scoring",
    run: (i) => Object.keys(generateCompatibilityScore(warnings[i % warnings.length])).length,
  },
  {
    name: "full audit (parse + analyzers + report)",
    run: (i) => {
      const report = auditEmail(corpus[i % corpus.length].html);
      return report.compatibility.warnings.length + report.links.totalLinks + report.images.total;
    },
  },
  {
    name: "all-client transforms",
    run: (i) => transformForAllClients(corpus[i % corpus.length].html)
      .reduce((total, result) => total + result.html.length + result.warnings.length, 0),
  },
  {
    name: "report JSON serialization",
    run: (i) => JSON.stringify(reports[i % reports.length]).length,
  },
];

function memory() {
  const usage = process.memoryUsage();
  return { heap: usage.heapUsed, rss: usage.rss };
}

function runBatch(run: (index: number) => number, count: number) {
  const sampleEvery = Math.max(1, Math.floor(count / 100));
  const startMemory = memory();
  let peakHeap = startMemory.heap;
  let peakRss = startMemory.rss;
  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    sink += run(i);
    if (i % sampleEvery === 0 || i === count - 1) {
      const current = memory();
      peakHeap = Math.max(peakHeap, current.heap);
      peakRss = Math.max(peakRss, current.rss);
    }
  }

  const elapsedMs = performance.now() - start;
  return {
    elapsedMs,
    sink,
    peakHeapDelta: Math.max(0, peakHeap - startMemory.heap),
    peakRssDelta: Math.max(0, peakRss - startMemory.rss),
  };
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log("Emailens compatibility-core benchmark (Bun)");
console.log(`Fixtures: ${corpus.map(({ name }) => name).join(", ")}`);
console.log(`Fixture sizes: ${corpus.map(({ name, html }) => `${name}=${(Buffer.byteLength(html) / 1024).toFixed(1)}KB`).join(", ")}`);
console.log(FULL_SCALE
  ? "Full scale enabled: all stages run 100, 1,000 and 10,000 messages.\n"
  : "Memory deltas are sampled process heap/RSS growth, not allocation profiles. Expensive 10k rows are projected from measured 1k rate; pass --full for actual runs.\n");

for (const stage of stages) {
  console.log(`\n${stage.name}`);
  console.log("emails  total       per email   emails/sec   peak heap Δ   peak RSS Δ");
  let lastMeasuredPerEmail = 0;
  for (const requestedCount of WORKLOADS) {
    if (
      requestedCount === 10_000 &&
      !FULL_SCALE &&
      PROJECTED_STAGES.has(stage.name)
    ) {
      const estimateMs = lastMeasuredPerEmail * requestedCount;
      console.log(
        ` 10000*  ~${`${estimateMs.toFixed(0)} ms`.padStart(8)}  ` +
        `${`${lastMeasuredPerEmail.toFixed(3)} ms`.padStart(10)}  ${"estimated".padStart(10)}  ` +
        `${"n/a".padStart(11)}  ${"n/a".padStart(10)}`,
      );
      continue;
    }

    const warmupCount = Math.min(20, Math.max(4, Math.floor(requestedCount * 0.02)));
    runBatch(stage.run, warmupCount);
    const result = runBatch(stage.run, requestedCount);
    const perEmail = result.elapsedMs / requestedCount;
    lastMeasuredPerEmail = perEmail;
    const throughput = requestedCount / (result.elapsedMs / 1000);
    console.log(
      `${String(requestedCount).padStart(6)}  ${`${result.elapsedMs.toFixed(0)} ms`.padStart(9)}  ` +
      `${`${perEmail.toFixed(3)} ms`.padStart(10)}  ${throughput.toFixed(0).padStart(10)}  ` +
      `${mb(result.peakHeapDelta).padStart(11)}  ${mb(result.peakRssDelta).padStart(10)}`,
    );
    if (!Number.isFinite(result.sink)) throw new Error(`Invalid benchmark sink for ${stage.name}`);
  }
}
