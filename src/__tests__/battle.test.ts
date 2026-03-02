/**
 * Battle tests — comprehensive edge-case coverage for all critical/important fixes.
 *
 * Tests are grouped by the issue they validate:
 * - DNS timeout handling
 * - Pseudo-selector/element detection
 * - CSS function false positives
 * - GMAIL_STRIPPED_PROPERTIES consistency
 * - Deliverability score calculation
 * - SPF +all detection
 * - Domain normalization
 * - DMARC regex edge cases
 * - CSS property expansion (right/top/bottom)
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { analyzeEmail, CSS_SUPPORT } from "../index";
import { GMAIL_STRIPPED_PROPERTIES } from "../rules/css-support";
import { checkDeliverability } from "../deliverability-checker";
import type { DnsResolver } from "../deliverability-checker";

// ============================================================================
// Helpers
// ============================================================================

function createMockResolver(overrides?: Partial<Record<string, () => Promise<unknown>>>) {
  const resolveMx = mock((_domain: string) =>
    Promise.resolve([{ priority: 10, exchange: "mx.example.com" }]),
  );
  const resolveTxt = mock((domain: string): Promise<string[][]> => {
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
    const err = new Error("queryTxt ENOTFOUND") as NodeJS.ErrnoException;
    err.code = "ENOTFOUND";
    return Promise.reject(err);
  });

  return { resolveMx, resolveTxt, ...overrides } as unknown as DnsResolver & {
    resolveMx: ReturnType<typeof mock>;
    resolveTxt: ReturnType<typeof mock>;
  };
}

// ============================================================================
// Issue #1: DNS timeout — withTimeout must use Promise.race
// ============================================================================

describe("DNS timeout handling", () => {
  it("resolves within timeout when DNS hangs", async () => {
    const hangingResolver: DnsResolver = {
      resolveMx: () => new Promise(() => {}), // never resolves
      resolveTxt: () => new Promise(() => {}), // never resolves
    } as unknown as DnsResolver;

    const start = Date.now();
    const report = await checkDeliverability("example.com", { _resolver: hangingResolver });
    const elapsed = Date.now() - start;

    // Should complete within DNS_TIMEOUT_MS (5s) + some buffer, not hang indefinitely
    expect(elapsed).toBeLessThan(8_000);
    // All checks should be skip/fail (not pass)
    expect(report.checks.every((c) => c.status !== "pass")).toBe(true);
  }, 15_000);

  it("handles partial timeout (some checks succeed, some hang)", async () => {
    let callCount = 0;
    const partialResolver: DnsResolver = {
      resolveMx: () => Promise.resolve([{ priority: 10, exchange: "mx.example.com" }]),
      resolveTxt: (domain: string) => {
        callCount++;
        // SPF succeeds, everything else hangs
        if (domain === "example.com") {
          return Promise.resolve([["v=spf1 -all"]]);
        }
        return new Promise(() => {}); // hang
      },
    } as unknown as DnsResolver;

    const report = await checkDeliverability("example.com", { _resolver: partialResolver });

    // MX should pass (resolveMx works), SPF should pass
    const mx = report.checks.find((c) => c.name === "mx");
    const spf = report.checks.find((c) => c.name === "spf");
    expect(mx?.status).toBe("pass");
    expect(spf?.status).toBe("pass");

    // Score should be > 0 (at least MX + SPF contribute)
    expect(report.score).toBeGreaterThan(0);
  }, 15_000);
});

// ============================================================================
// Issue #2: CSS function false positives (min/max substring matching)
// ============================================================================

describe("CSS function false positive prevention", () => {
  it("does NOT flag 'min' when it's a substring (font-family: Minion)", () => {
    const html = `<html><body><p style="font-family: 'Minion Pro', serif;">Text</p></body></html>`;
    const warnings = analyzeEmail(html);
    const minWarnings = warnings.filter((w) => w.property === "min");
    expect(minWarnings).toHaveLength(0);
  });

  it("does NOT flag 'max' when it's a substring (animation-name: maxFade)", () => {
    const html = `<html><head><style>.el { animation-name: maxFade; }</style></head><body><div class="el">X</div></body></html>`;
    const warnings = analyzeEmail(html);
    const maxWarnings = warnings.filter((w) => w.property === "max");
    expect(maxWarnings).toHaveLength(0);
  });

  it("does NOT flag 'calc' when it's a substring in font-family", () => {
    const html = `<html><body><p style="font-family: 'calculator-mono', monospace;">Text</p></body></html>`;
    const warnings = analyzeEmail(html);
    const calcWarnings = warnings.filter((w) => w.property === "calc");
    expect(calcWarnings).toHaveLength(0);
  });

  it("DOES flag actual min() function usage", () => {
    const html = `<html><body><div style="width: min(100%, 600px);">Content</div></body></html>`;
    const warnings = analyzeEmail(html);
    const minWarnings = warnings.filter((w) => w.property === "min");
    // min() has limited email client support — should produce at least one warning
    expect(minWarnings.length).toBeGreaterThan(0);
  });

  it("DOES flag actual calc() function usage in <style>", () => {
    const html = `<html><head><style>.el { width: calc(100% - 20px); }</style></head><body><div class="el">X</div></body></html>`;
    const warnings = analyzeEmail(html);
    const calcWarnings = warnings.filter((w) => w.property === "calc");
    expect(calcWarnings.length).toBeGreaterThan(0);
  });

  it("DOES flag linear-gradient() in inline styles", () => {
    const html = `<html><body><div style="background: linear-gradient(to right, red, blue);">X</div></body></html>`;
    const warnings = analyzeEmail(html);
    const gradWarnings = warnings.filter((w) => w.property === "linear-gradient");
    expect(gradWarnings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Issue #3: Pseudo-selector/element detection in <style> blocks
// ============================================================================

describe("pseudo-selector and pseudo-element detection", () => {
  it("detects :hover in <style> blocks", () => {
    const html = `<html><head><style>a:hover { color: red; }</style></head><body><a href="#">Link</a></body></html>`;
    const warnings = analyzeEmail(html);
    const hoverWarnings = warnings.filter((w) => w.property === ":hover");
    // :hover has limited support in email — at least one client should warn
    if (CSS_SUPPORT[":hover"]) {
      const unsupportedClients = Object.entries(CSS_SUPPORT[":hover"]).filter(([, v]) => v === "unsupported");
      if (unsupportedClients.length > 0) {
        expect(hoverWarnings.length).toBeGreaterThan(0);
      }
    }
  });

  it("detects ::before in <style> blocks", () => {
    const html = `<html><head><style>p::before { content: "→ "; }</style></head><body><p>Text</p></body></html>`;
    const warnings = analyzeEmail(html);
    const beforeWarnings = warnings.filter((w) => w.property === "::before");
    if (CSS_SUPPORT["::before"]) {
      const unsupportedClients = Object.entries(CSS_SUPPORT["::before"]).filter(([, v]) => v === "unsupported");
      if (unsupportedClients.length > 0) {
        expect(beforeWarnings.length).toBeGreaterThan(0);
      }
    }
  });

  it("detects :nth-child in <style> blocks", () => {
    const html = `<html><head><style>tr:nth-child(odd) { background: #f0f0f0; }</style></head><body><table><tr><td>A</td></tr><tr><td>B</td></tr></table></body></html>`;
    const warnings = analyzeEmail(html);
    const nthWarnings = warnings.filter((w) => w.property === ":nth-child");
    if (CSS_SUPPORT[":nth-child"]) {
      const unsupportedClients = Object.entries(CSS_SUPPORT[":nth-child"]).filter(([, v]) => v === "unsupported");
      if (unsupportedClients.length > 0) {
        expect(nthWarnings.length).toBeGreaterThan(0);
      }
    }
  });

  it("does NOT produce pseudo warnings when no pseudo-selectors are used", () => {
    const html = `<html><head><style>.red { color: red; }</style></head><body><p class="red">Text</p></body></html>`;
    const warnings = analyzeEmail(html);
    const pseudoWarnings = warnings.filter(
      (w) => w.property.startsWith(":") || w.property.startsWith("::"),
    );
    expect(pseudoWarnings).toHaveLength(0);
  });
});

// ============================================================================
// Issue #6: GMAIL_STRIPPED_PROPERTIES consistency with CSS_SUPPORT matrix
// ============================================================================

describe("GMAIL_STRIPPED_PROPERTIES consistency", () => {
  it("no property marked 'supported' in gmail-web should be in GMAIL_STRIPPED", () => {
    for (const prop of GMAIL_STRIPPED_PROPERTIES) {
      const level = CSS_SUPPORT[prop]?.["gmail-web"];
      if (level === "supported") {
        throw new Error(
          `"${prop}" is in GMAIL_STRIPPED_PROPERTIES but CSS_SUPPORT says gmail-web: supported`,
        );
      }
    }
  });

  it("opacity is NOT in GMAIL_STRIPPED_PROPERTIES (caniemail says supported)", () => {
    expect(GMAIL_STRIPPED_PROPERTIES.has("opacity")).toBe(false);
  });
});

// ============================================================================
// Issue #7: CSS property expansion (right, top, bottom)
// ============================================================================

describe("CSS property expansion from left/right/top/bottom", () => {
  it("has support data for 'right'", () => {
    expect(CSS_SUPPORT["right"]).toBeDefined();
    expect(Object.keys(CSS_SUPPORT["right"]).length).toBe(12);
  });

  it("has support data for 'top'", () => {
    expect(CSS_SUPPORT["top"]).toBeDefined();
    expect(Object.keys(CSS_SUPPORT["top"]).length).toBe(12);
  });

  it("has support data for 'bottom'", () => {
    expect(CSS_SUPPORT["bottom"]).toBeDefined();
    expect(Object.keys(CSS_SUPPORT["bottom"]).length).toBe(12);
  });

  it("right/top/bottom have same support data as left", () => {
    for (const prop of ["right", "top", "bottom"]) {
      for (const clientId of Object.keys(CSS_SUPPORT["left"])) {
        expect(CSS_SUPPORT[prop][clientId]).toBe(CSS_SUPPORT["left"][clientId]);
      }
    }
  });

  it("detects unsupported 'right' in inline styles", () => {
    const html = `<html><body><div style="position: absolute; right: 0;">X</div></body></html>`;
    const warnings = analyzeEmail(html);
    const rightWarnings = warnings.filter((w) => w.property === "right");
    // right should have warnings for clients that don't support it
    const unsupportedClients = Object.entries(CSS_SUPPORT["right"]).filter(([, v]) => v === "unsupported");
    if (unsupportedClients.length > 0) {
      expect(rightWarnings.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Issue #8: SPF +all detection
// ============================================================================

describe("SPF +all detection", () => {
  it("fails on SPF with +all", async () => {
    const resolver = createMockResolver();
    resolver.resolveTxt.mockImplementation((domain: string) => {
      if (domain === "example.com") {
        return Promise.resolve([["v=spf1 +all"]]);
      }
      if (domain === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=reject"]]);
      }
      if (domain.endsWith("._domainkey.example.com")) {
        return Promise.resolve([["v=DKIM1; p=abc"]]);
      }
      const err = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return Promise.reject(err);
    });

    const report = await checkDeliverability("example.com", { _resolver: resolver });
    const spf = report.checks.find((c) => c.name === "spf");
    expect(spf?.status).toBe("fail");
    expect(spf?.message).toContain("+all");
  });
});

// ============================================================================
// Issue #9: Domain normalization (port stripping)
// ============================================================================

describe("domain normalization", () => {
  it("strips port from domain", async () => {
    const resolver = createMockResolver();
    const report = await checkDeliverability("https://example.com:8080/path", { _resolver: resolver });
    expect(report.domain).toBe("example.com");
  });

  it("handles bare domain", async () => {
    const resolver = createMockResolver();
    const report = await checkDeliverability("example.com", { _resolver: resolver });
    expect(report.domain).toBe("example.com");
  });

  it("strips trailing slash", async () => {
    const resolver = createMockResolver();
    const report = await checkDeliverability("example.com/", { _resolver: resolver });
    expect(report.domain).toBe("example.com");
  });
});

// ============================================================================
// Issue #16: Score calculation — skip checks excluded from denominator
// ============================================================================

describe("deliverability score calculation", () => {
  it("domain with all 5 checks passing scores 100", async () => {
    const resolver = createMockResolver();
    const report = await checkDeliverability("example.com", { _resolver: resolver });
    expect(report.score).toBe(100);
  });

  it("domain with BIMI skip still reaches 100 if others pass", async () => {
    const resolver = createMockResolver();
    // Override BIMI to return nothing (skip)
    resolver.resolveTxt.mockImplementation((domain: string) => {
      if (domain === "example.com") {
        return Promise.resolve([["v=spf1 -all"]]);
      }
      if (domain === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=reject"]]);
      }
      if (domain.endsWith("._domainkey.example.com")) {
        return Promise.resolve([["v=DKIM1; p=abc"]]);
      }
      // No BIMI record
      const err = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return Promise.reject(err);
    });

    const report = await checkDeliverability("example.com", { _resolver: resolver });
    const bimi = report.checks.find((c) => c.name === "bimi");
    expect(bimi?.status).toBe("skip");
    // Score should be 100 — BIMI skip is excluded from denominator
    expect(report.score).toBe(100);
  });

  it("MX fail tanks the score", async () => {
    const resolver = createMockResolver();
    resolver.resolveMx.mockImplementation(() => {
      const err = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return Promise.reject(err);
    });

    const report = await checkDeliverability("example.com", { _resolver: resolver });
    // MX is 25 weight out of ~90 evaluated (100 - 10 bimi skip)
    expect(report.score).toBeLessThan(100);
    const mx = report.checks.find((c) => c.name === "mx");
    expect(mx?.status).toBe("fail");
  });

  it("SPF ~all produces warn (half credit)", async () => {
    const resolver = createMockResolver();
    resolver.resolveTxt.mockImplementation((domain: string) => {
      if (domain === "example.com") {
        return Promise.resolve([["v=spf1 include:_spf.google.com ~all"]]);
      }
      if (domain === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=reject"]]);
      }
      if (domain.endsWith("._domainkey.example.com")) {
        return Promise.resolve([["v=DKIM1; p=abc"]]);
      }
      const err = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return Promise.reject(err);
    });

    const report = await checkDeliverability("example.com", { _resolver: resolver });
    const spf = report.checks.find((c) => c.name === "spf");
    expect(spf?.status).toBe("warn");
    // Score should be less than 100 (SPF gets half credit)
    expect(report.score).toBeLessThan(100);
    expect(report.score).toBeGreaterThan(50);
  });

  it("invalid domain returns score 0", async () => {
    const resolver = createMockResolver();
    const report = await checkDeliverability("notadomain", { _resolver: resolver });
    expect(report.score).toBe(0);
  });
});

// ============================================================================
// Issue #17: DMARC regex edge cases
// ============================================================================

describe("DMARC policy parsing", () => {
  it("parses p=reject with semicolon-no-space", async () => {
    const resolver = createMockResolver();
    resolver.resolveTxt.mockImplementation((domain: string) => {
      if (domain === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1;p=reject;rua=mailto:dmarc@example.com"]]);
      }
      if (domain === "example.com") {
        return Promise.resolve([["v=spf1 -all"]]);
      }
      if (domain.endsWith("._domainkey.example.com")) {
        return Promise.resolve([["v=DKIM1; p=abc"]]);
      }
      const err = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return Promise.reject(err);
    });

    const report = await checkDeliverability("example.com", { _resolver: resolver });
    const dmarc = report.checks.find((c) => c.name === "dmarc");
    expect(dmarc?.status).toBe("pass");
    expect(dmarc?.message).toContain("p=reject");
  });

  it("detects p=none as warning", async () => {
    const resolver = createMockResolver();
    resolver.resolveTxt.mockImplementation((domain: string) => {
      if (domain === "_dmarc.example.com") {
        return Promise.resolve([["v=DMARC1; p=none; rua=mailto:dmarc@example.com"]]);
      }
      if (domain === "example.com") {
        return Promise.resolve([["v=spf1 -all"]]);
      }
      const err = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return Promise.reject(err);
    });

    const report = await checkDeliverability("example.com", { _resolver: resolver });
    const dmarc = report.checks.find((c) => c.name === "dmarc");
    expect(dmarc?.status).toBe("warn");
  });
});

// ============================================================================
// Issue #14: Superhuman transition should not be unsupported
// ============================================================================

describe("Superhuman transition override", () => {
  it("transition is not unsupported for Superhuman", () => {
    const level = CSS_SUPPORT["transition"]?.["superhuman"];
    expect(level).not.toBe("unsupported");
  });
});

// ============================================================================
// Compound value detection correctness
// ============================================================================

describe("compound value detection in inline styles", () => {
  it("detects display:flex in inline styles", () => {
    const html = `<html><body><div style="display: flex;">X</div></body></html>`;
    const warnings = analyzeEmail(html);
    const flexWarnings = warnings.filter((w) => w.property === "display:flex");
    expect(flexWarnings.length).toBeGreaterThan(0);
  });

  it("detects display:grid in <style> blocks", () => {
    const html = `<html><head><style>.grid { display: grid; }</style></head><body><div class="grid">X</div></body></html>`;
    const warnings = analyzeEmail(html);
    const gridWarnings = warnings.filter((w) => w.property === "display:grid");
    expect(gridWarnings.length).toBeGreaterThan(0);
  });

  it("does not flag display:block as display:flex", () => {
    const html = `<html><body><div style="display: block;">X</div></body></html>`;
    const warnings = analyzeEmail(html);
    const flexWarnings = warnings.filter((w) => w.property === "display:flex");
    expect(flexWarnings).toHaveLength(0);
  });
});

// ============================================================================
// Property count validation
// ============================================================================

describe("CSS_SUPPORT matrix integrity (post-fix)", () => {
  it("has at least 250 properties", () => {
    expect(Object.keys(CSS_SUPPORT).length).toBeGreaterThanOrEqual(250);
  });

  it("every property has all 12 client IDs", () => {
    const expectedClients = [
      "gmail-web", "gmail-android", "gmail-ios",
      "outlook-web", "outlook-windows",
      "apple-mail-macos", "apple-mail-ios",
      "yahoo-mail", "samsung-mail", "thunderbird",
      "hey-mail", "superhuman",
    ];
    for (const [key, support] of Object.entries(CSS_SUPPORT)) {
      for (const clientId of expectedClients) {
        expect(support[clientId]).toBeDefined();
        expect(["supported", "partial", "unsupported", "unknown"]).toContain(support[clientId]);
      }
    }
  });
});
