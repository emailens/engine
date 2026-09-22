#!/usr/bin/env bun
/**
 * Fetches targeting techniques from howtotarget.email/api.json and writes
 * src/rules/targeting-hacks.generated.ts (id, status, notes, snippet only).
 *
 * Engine matchers live in src/rules/targeting-matchers.ts. This script fails
 * if a matcher.upstreamKey is missing after dedupe.
 */

import * as fs from "fs";
import * as path from "path";
import { matcherUpstreamKeys } from "../src/rules/targeting-matchers";
import { targetingUpstreamKey } from "../src/rules/targeting-key";

const API_URL = "https://howtotarget.email/api.json";
const OUT_FILE = path.resolve(import.meta.dir, "../src/rules/targeting-hacks.generated.ts");

interface ApiHack {
  client: string;
  version: string | null;
  platform: string | null;
  status: "Working" | "Deprecated" | string;
  description: string;
}

interface ApiResponse {
  meta: { version: string };
  hacks: ApiHack[];
}

function parseMarkdownDescription(desc: string): { code: string; notes: string } {
  const codeBlockMatch = desc.match(/```(?:css|html)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return {
      code: codeBlockMatch[1].trim(),
      notes: desc.replace(codeBlockMatch[0], "").replace(/^\s*\n+/g, "").trim(),
    };
  }
  return { code: desc.trim(), notes: "" };
}

async function main() {
  console.log(`Fetching ${API_URL}...`);
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch from howtotarget.email: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as ApiResponse;
  const byKey = new Map<string, {
    key: string;
    client: string;
    status: "working" | "deprecated";
    code: string;
    notes: string;
  }>();

  for (const h of data.hacks) {
    const { code, notes } = parseMarkdownDescription(h.description);
    const key = targetingUpstreamKey(h.client, code);
    const status = h.status.toLowerCase() === "deprecated" ? "deprecated" as const : "working" as const;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { key, client: h.client, status, code, notes });
      continue;
    }
    if (status === "deprecated") existing.status = "deprecated";
    if (notes && !existing.notes.includes(notes)) {
      existing.notes = [existing.notes, notes].filter(Boolean).join("\n");
    }
  }

  const targetingHacks = [...byKey.values()];
  const catalogKeys = new Set(targetingHacks.map((h) => h.key));
  const missing = matcherUpstreamKeys().filter((key) => !catalogKeys.has(key));
  if (missing.length > 0) {
    throw new Error(
      `targeting-matchers.ts references upstream keys missing from howtotarget.email:\n  ${missing.join("\n  ")}\nRe-key the matcher; do not drop engine regexes from this sync.`,
    );
  }

  const timestamp = new Date().toISOString();
  const file = `// Auto-generated targeting catalog from howtotarget.email (Parcel/Customer.io)
// Last synced: ${timestamp}
// Total hacks: ${targetingHacks.length}
//
// DO NOT EDIT. Engine matchers: src/rules/targeting-matchers.ts
// Regenerate with: bun run sync:howtotarget

export type HackStatus = "working" | "deprecated";

export interface TargetingHack {
  key: string;
  client: string;
  status: HackStatus;
  code: string;
  notes: string;
}

export const TARGETING_HACKS: TargetingHack[] = ${JSON.stringify(targetingHacks, null, 2)};
`;

  fs.writeFileSync(OUT_FILE, file, "utf8");
  console.log(`Wrote ${OUT_FILE} with ${targetingHacks.length} hacks.`);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
