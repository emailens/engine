import { describe, expect, it, mock, beforeEach } from "bun:test";
import { checkDeliverability } from "../deliverability-checker";
import type { DnsResolver } from "../deliverability-checker";

// Build a mock DNS resolver via dependency injection (more reliable than mock.module for built-ins)
function createMockResolver() {
  const resolveMx = mock((_domain: string) =>
    Promise.resolve([{ priority: 10, exchange: "mx.example.com" }]),
  );

  const resolveTxt = mock((domain: string) => {
    if (domain === "example.com") {
      return Promise.resolve([["v=spf1 include:_spf.google.com -all"]]);
    }
    if (domain === "_dmarc.example.com") {
      return Promise.resolve([["v=DMARC1; p=reject; rua=mailto:dmarc@example.com"]]);
    }
    if (domain === "google._domainkey.example.com") {
      return Promise.resolve([["v=DKIM1; k=rsa; p=MIGfMA0G..."]]);
    }
    if (domain === "default._bimi.example.com") {
      return Promise.resolve([["v=BIMI1; l=https://example.com/logo.svg"]]);
    }
    // All other subdomains return ENOTFOUND
    const err = new Error("queryTxt ENOTFOUND") as NodeJS.ErrnoException;
    err.code = "ENOTFOUND";
    return Promise.reject(err);
  });

  return { resolveMx, resolveTxt } as unknown as DnsResolver & {
    resolveMx: ReturnType<typeof mock>;
    resolveTxt: ReturnType<typeof mock>;
  };
}

describe("checkDeliverability", () => {
  let resolver: ReturnType<typeof createMockResolver>;

  beforeEach(() => {
    resolver = createMockResolver();
  });

  it("returns all 5 checks for a valid domain", async () => {
    const report = await checkDeliverability("example.com", { _resolver: resolver });

    expect(report.domain).toBe("example.com");
    expect(report.checks).toHaveLength(5);

    const checkNames = report.checks.map((c) => c.name);
    expect(checkNames).toContain("mx");
    expect(checkNames).toContain("spf");
    expect(checkNames).toContain("dkim");
    expect(checkNames).toContain("dmarc");
    expect(checkNames).toContain("bimi");
  });

  it("score is between 0 and 100", async () => {
    const report = await checkDeliverability("example.com", { _resolver: resolver });
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it("handles invalid domain", async () => {
    const report = await checkDeliverability("notadomain", { _resolver: resolver });
    expect(report.score).toBe(0);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].rule).toBe("invalid-domain");
  });

  it("normalizes domain input (strips protocol/path)", async () => {
    const report = await checkDeliverability("https://example.com/path", { _resolver: resolver });
    expect(report.domain).toBe("example.com");
  });

  it("reports issues for failed checks", async () => {
    // Mock MX failure
    resolver.resolveMx.mockImplementationOnce(() => {
      const err = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return Promise.reject(err);
    });

    const report = await checkDeliverability("example.com", { _resolver: resolver });
    const mxCheck = report.checks.find((c) => c.name === "mx");
    expect(mxCheck?.status).toBe("fail");
  });

  it("passes all checks with full DNS configuration", async () => {
    const report = await checkDeliverability("example.com", { _resolver: resolver });

    const mx = report.checks.find((c) => c.name === "mx");
    const spf = report.checks.find((c) => c.name === "spf");
    const dmarc = report.checks.find((c) => c.name === "dmarc");
    const dkim = report.checks.find((c) => c.name === "dkim");
    const bimi = report.checks.find((c) => c.name === "bimi");

    expect(mx?.status).toBe("pass");
    expect(spf?.status).toBe("pass");
    expect(dmarc?.status).toBe("pass");
    expect(dkim?.status).toBe("pass");
    expect(bimi?.status).toBe("pass");
  });
});
