#!/usr/bin/env bun
/**
 * check-data-freshness.ts — Flags manually-curated data that may be stale.
 *
 * The engine relies on factual data about email client behavior that can
 * become outdated as clients release updates. This script scans source files
 * for "Last verified: YYYY-MM-DD" date stamps and flags anything older than
 * 90 days.
 *
 * Tracked data sources:
 *   1. CSS support matrix — auto-synced from caniemail.com (reads "Last synced" date)
 *   2. Dark mode behavior — manually verified against Litmus/Can I Email
 *   3. Client display limits — manually verified against Email Tool Tester/Litmus
 *   4. Superhuman CSS overrides — manually tested (no public data source exists)
 *
 * Usage:
 *   bun run check:freshness           # or: bun run scripts/check-data-freshness.ts
 *
 * Exit codes:
 *   0 — all data sources are fresh
 *   1 — one or more sources are stale or missing a verification date
 *
 * Adding a new tracked source:
 *   1. Add a "Last verified: YYYY-MM-DD" comment to the source file
 *   2. Add a new check block below (follow the existing pattern)
 *   3. Document the source in CONTRIBUTING.md under "Data Sources and Freshness"
 */

import * as fs from "node:fs";
import * as path from "node:path";

const STALE_DAYS = 90; // flag data older than this

interface FreshnessCheck {
  name: string;
  file: string;
  lastVerified: string | null;
  stale: boolean;
  notes: string;
  verifyHow: string;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function extractDateComment(filePath: string, pattern: RegExp): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(pattern);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

const root = path.resolve(import.meta.dir, "..");

const checks: FreshnessCheck[] = [];

// 1. caniemail sync date
const cssSupportPath = path.join(root, "src/rules/css-support.ts");
const syncDate = extractDateComment(cssSupportPath, /Last synced:\s*(\d{4}-\d{2}-\d{2})/);
checks.push({
  name: "CSS Support Matrix (caniemail)",
  file: "src/rules/css-support.ts",
  lastVerified: syncDate,
  stale: syncDate ? daysSince(syncDate) > STALE_DAYS : true,
  notes: syncDate ? `Last synced ${daysSince(syncDate)} days ago` : "No sync date found",
  verifyHow: "Run: bun run sync:caniemail",
});

// 2. Dark mode behavior — track via a manually-updated date stamp
const darkModePath = path.join(root, "src/dark-mode.ts");
const darkModeDate = extractDateComment(darkModePath, /Last verified:\s*(\d{4}-\d{2}-\d{2})/);
checks.push({
  name: "Dark Mode Client Behavior",
  file: "src/dark-mode.ts",
  lastVerified: darkModeDate,
  stale: darkModeDate ? daysSince(darkModeDate) > STALE_DAYS : true,
  notes: darkModeDate
    ? `Last verified ${daysSince(darkModeDate)} days ago`
    : "No 'Last verified' date found — add a comment like: * Last verified: 2026-03-04",
  verifyHow: "Check Litmus dark mode guide (litmus.com/blog/the-ultimate-guide-to-dark-mode-for-email-marketers) and caniemail.com prefers-color-scheme data",
});

// 3. Client display limits
const constantsPath = path.join(root, "src/constants.ts");
const limitsDate = extractDateComment(constantsPath, /Display limits last verified:\s*(\d{4}-\d{2}-\d{2})/);
checks.push({
  name: "Client Display Limits (subject/preheader)",
  file: "src/constants.ts",
  lastVerified: limitsDate,
  stale: limitsDate ? daysSince(limitsDate) > STALE_DAYS : true,
  notes: limitsDate
    ? `Last verified ${daysSince(limitsDate)} days ago`
    : "No 'Display limits last verified' date found — add a comment above CLIENT_DISPLAY_LIMITS",
  verifyHow: "Check emailtooltester.com/en/blog/email-subject-lines-character-limit/ and litmus.com preview text guide",
});

// 4. Superhuman overrides
const superhumanPath = path.join(root, "scripts/superhuman-overrides.ts");
const superhumanDate = extractDateComment(superhumanPath, /Last verified:\s*(\d{4}-\d{2}-\d{2})/);
checks.push({
  name: "Superhuman CSS Overrides",
  file: "scripts/superhuman-overrides.ts",
  lastVerified: superhumanDate,
  stale: superhumanDate ? daysSince(superhumanDate) > STALE_DAYS : true,
  notes: superhumanDate
    ? `Last verified ${daysSince(superhumanDate)} days ago`
    : "No 'Last verified' date found — add a comment",
  verifyHow: "Manual testing in Superhuman app or checking for Superhuman engineering blog posts",
});

// Output
console.log("\n📋 Data Freshness Report\n");
console.log("=".repeat(70));

let hasStale = false;
for (const check of checks) {
  const status = check.stale ? "⚠️  STALE" : "✅ Fresh";
  console.log(`\n${status}  ${check.name}`);
  console.log(`  File: ${check.file}`);
  console.log(`  ${check.notes}`);
  if (check.stale) {
    console.log(`  How to verify: ${check.verifyHow}`);
    hasStale = true;
  }
}

console.log("\n" + "=".repeat(70));

if (hasStale) {
  console.log("\n⚠️  Some data sources are stale or missing verification dates.");
  console.log("   Review the items above before a release.\n");
  process.exit(1);
} else {
  console.log("\n✅ All data sources are fresh.\n");
}
