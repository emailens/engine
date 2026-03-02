/**
 * DNS-based email deliverability checker.
 *
 * Validates SPF, DKIM, DMARC, MX, and BIMI records for a domain
 * using node:dns/promises. No external dependencies.
 */

import { promises as defaultDns } from "node:dns";
import type { DeliverabilityCheck, DeliverabilityReport, DeliverabilityIssue } from "./types";

/** DNS resolver interface — injectable for testing. */
export interface DnsResolver {
  resolveMx: typeof defaultDns.resolveMx;
  resolveTxt: typeof defaultDns.resolveTxt;
}

/** Common DKIM selectors to probe (we can't know the real selector). */
const DKIM_SELECTORS = [
  "google", "selector1", "selector2", "default", "dkim",
  "k1", "k2", "k3", "mail", "s1", "s2",
  "mandrill", "pm", "protonmail", "smtp",
];

const DNS_TIMEOUT_MS = 5_000;

/**
 * Race a DNS call against a timeout. Node's DNS API has no signal support,
 * so we use Promise.race — the underlying query may continue in the background
 * but we stop waiting.
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = DNS_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = Object.assign(new Error(`DNS timeout after ${timeoutMs}ms`), { code: "ABORT_ERR" });
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Safe DNS TXT lookup — returns empty array on ENOTFOUND/ENODATA.
 */
async function resolveTxtSafe(domain: string, dns: DnsResolver): Promise<string[]> {
  try {
    const records = await withTimeout(() => dns.resolveTxt(domain));
    return records.map((chunks) => chunks.join(""));
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ETIMEOUT" || code === "ABORT_ERR"
      || code === "ESERVFAIL" || code === "ECONNREFUSED" || code === "EAI_AGAIN" || code === "ECANCELLED") {
      return [];
    }
    throw err;
  }
}

// ── Individual checks ────────────────────────────────────────────────────────

async function checkMX(domain: string, dns: DnsResolver): Promise<DeliverabilityCheck> {
  try {
    const records = await withTimeout(() => dns.resolveMx(domain));
    if (records.length === 0) {
      return {
        name: "mx",
        status: "fail",
        message: "No MX records found — domain cannot receive email.",
      };
    }
    const sorted = records.sort((a, b) => a.priority - b.priority);
    return {
      name: "mx",
      status: "pass",
      message: `${records.length} MX record(s) found.`,
      detail: sorted.map((r) => `${r.priority} ${r.exchange}`).join(", "),
    };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return {
        name: "mx",
        status: "fail",
        message: "No MX records found — domain cannot receive email.",
      };
    }
    // Gracefully handle all DNS failures (ESERVFAIL, ECONNREFUSED, timeouts, etc.)
    return {
      name: "mx",
      status: "skip",
      message: `MX lookup failed: ${(err as Error).message}`,
    };
  }
}

async function checkSPF(domain: string, dns: DnsResolver): Promise<DeliverabilityCheck> {
  const records = await resolveTxtSafe(domain, dns);
  const spfRecord = records.find((r) => r.startsWith("v=spf1"));

  if (!spfRecord) {
    return {
      name: "spf",
      status: "fail",
      message: "No SPF record found — receiving servers can't verify authorized senders.",
      detail: 'Add a TXT record starting with "v=spf1" to your domain.',
    };
  }

  // Detect dangerous +all (allows any server to send as your domain)
  if (spfRecord.includes("+all")) {
    return {
      name: "spf",
      status: "fail",
      message: "SPF record uses +all — this allows any server to send as your domain.",
      record: spfRecord,
      detail: "Replace +all with -all (hard fail) or ~all (soft fail) to restrict authorized senders.",
    };
  }

  // Validate syntax
  if (!spfRecord.includes("~all") && !spfRecord.includes("-all") && !spfRecord.includes("?all")) {
    return {
      name: "spf",
      status: "warn",
      message: "SPF record found but missing enforcement mechanism (~all or -all).",
      record: spfRecord,
      detail: "Add ~all (soft fail) or -all (hard fail) to the end of your SPF record.",
    };
  }

  if (spfRecord.includes("~all")) {
    return {
      name: "spf",
      status: "warn",
      message: "SPF record uses ~all (soft fail) — consider upgrading to -all (hard fail) for stronger protection.",
      record: spfRecord,
    };
  }

  return {
    name: "spf",
    status: "pass",
    message: "SPF record found with -all enforcement.",
    record: spfRecord,
  };
}

async function checkDKIM(domain: string, dns: DnsResolver): Promise<DeliverabilityCheck> {
  // Probe common selectors in parallel
  const results = await Promise.allSettled(
    DKIM_SELECTORS.map(async (selector) => {
      const records = await resolveTxtSafe(`${selector}._domainkey.${domain}`, dns);
      const dkimRecord = records.find((r) => r.includes("v=DKIM1") || r.includes("p="));
      if (dkimRecord) {
        return { selector, record: dkimRecord };
      }
      return null;
    }),
  );

  const matches = results
    .filter((r): r is PromiseFulfilledResult<{ selector: string; record: string } | null> =>
      r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value!);

  if (matches.length > 0) {
    return {
      name: "dkim",
      status: "pass",
      message: `DKIM record(s) found for selector(s): ${matches.map((m) => m.selector).join(", ")}.`,
      record: matches[0].record,
    };
  }

  return {
    name: "dkim",
    status: "warn",
    message: `No DKIM records found for ${DKIM_SELECTORS.length} common selectors — DKIM may use a custom selector we didn't probe.`,
    detail: "This doesn't mean DKIM is missing; the actual selector may differ from the common ones we checked.",
  };
}

async function checkDMARC(domain: string, dns: DnsResolver): Promise<DeliverabilityCheck> {
  const records = await resolveTxtSafe(`_dmarc.${domain}`, dns);
  const dmarcRecord = records.find((r) => r.startsWith("v=DMARC1"));

  if (!dmarcRecord) {
    return {
      name: "dmarc",
      status: "fail",
      message: "No DMARC record found — inbox providers may reject or quarantine your emails.",
      detail: 'Add a TXT record at _dmarc.yourdomain.com starting with "v=DMARC1".',
    };
  }

  const policyMatch = dmarcRecord.match(/(?:^|;)\s*p=(\w+)/);
  const policy = policyMatch?.[1]?.toLowerCase();

  if (policy === "none") {
    return {
      name: "dmarc",
      status: "warn",
      message: 'DMARC record found with p=none (monitoring only) — consider upgrading to p=quarantine or p=reject.',
      record: dmarcRecord,
    };
  }

  return {
    name: "dmarc",
    status: "pass",
    message: `DMARC record found with p=${policy || "unknown"}.`,
    record: dmarcRecord,
  };
}

async function checkBIMI(domain: string, dns: DnsResolver): Promise<DeliverabilityCheck> {
  const records = await resolveTxtSafe(`default._bimi.${domain}`, dns);
  const bimiRecord = records.find((r) => r.startsWith("v=BIMI1"));

  if (!bimiRecord) {
    return {
      name: "bimi",
      status: "skip",
      message: "No BIMI record found — optional brand indicator (logo in inbox).",
      detail: "BIMI is a nice-to-have. It displays your brand logo next to emails in supported clients.",
    };
  }

  return {
    name: "bimi",
    status: "pass",
    message: "BIMI record found — your brand logo may appear in supported email clients.",
    record: bimiRecord,
  };
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Check email deliverability for a domain.
 *
 * Validates MX, SPF, DKIM, DMARC, and BIMI DNS records.
 * All DNS queries have a 5-second timeout.
 *
 * @example
 * ```ts
 * const report = await checkDeliverability("example.com");
 * console.log(report.score); // 0-100
 * console.log(report.checks); // individual check results
 * ```
 */
export async function checkDeliverability(
  domain: string,
  options?: { _resolver?: DnsResolver },
): Promise<DeliverabilityReport> {
  const dns: DnsResolver = options?._resolver ?? defaultDns;

  // Normalize domain — strip protocol, path, and port
  const cleanDomain = domain.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");

  if (!cleanDomain || !cleanDomain.includes(".")) {
    return {
      domain: cleanDomain,
      checks: [],
      score: 0,
      issues: [{
        rule: "invalid-domain",
        severity: "error",
        message: `Invalid domain: "${cleanDomain}"`,
      }],
    };
  }

  // Run all checks in parallel — use allSettled so one failure can't crash the rest
  const checkNames: DeliverabilityCheck["name"][] = ["mx", "spf", "dkim", "dmarc", "bimi"];
  const settled = await Promise.allSettled([
    checkMX(cleanDomain, dns),
    checkSPF(cleanDomain, dns),
    checkDKIM(cleanDomain, dns),
    checkDMARC(cleanDomain, dns),
    checkBIMI(cleanDomain, dns),
  ]);

  const checks: DeliverabilityCheck[] = settled.map((result, i) =>
    result.status === "fulfilled"
      ? result.value
      : { name: checkNames[i], status: "skip" as const, message: `Check failed: ${result.reason?.message ?? "unknown error"}` },
  );

  // Calculate score — skip checks are excluded from the denominator
  const weights: Record<string, number> = {
    mx: 25,
    spf: 25,
    dkim: 20,
    dmarc: 20,
    bimi: 10,
  };

  let totalWeight = 0;
  let earnedScore = 0;
  for (const check of checks) {
    const weight = weights[check.name] || 0;
    if (check.status === "skip") continue; // exclude from denominator
    totalWeight += weight;
    if (check.status === "pass") earnedScore += weight;
    else if (check.status === "warn") earnedScore += weight * 0.5;
    // "fail" = 0 points
  }

  let score = totalWeight > 0 ? Math.round((earnedScore / totalWeight) * 100) : 0;
  score = Math.max(0, Math.min(100, score));

  // Build issues list
  const issues: DeliverabilityIssue[] = [];
  for (const check of checks) {
    if (check.status === "fail") {
      issues.push({
        rule: check.name,
        severity: "error",
        message: check.message,
        detail: check.detail,
      });
    } else if (check.status === "warn") {
      issues.push({
        rule: check.name,
        severity: "warning",
        message: check.message,
        detail: check.detail,
      });
    }
  }

  return { domain: cleanDomain, checks, score, issues };
}
