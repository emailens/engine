import { createHash } from "node:crypto";

/** Normalize a HowToTarget snippet so whitespace drift does not change the key. */
export function normalizeTargetingSnippet(code: string): string {
  return code.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

/**
 * Stable join between the HowToTarget catalog and engine matchers.
 * Client is the upstream name, not an engine client id.
 * Duplicate (client, snippet) rows collapse to one catalog entry on sync.
 */
export function targetingUpstreamKey(client: string, code: string): string {
  const payload = `${client.trim().toLowerCase()}\n${normalizeTargetingSnippet(code)}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
