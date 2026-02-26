import { describe, test, expect } from "bun:test";
import { analyzeSpam } from "../index";

// ============================================================================
// Showcase email — the same HTML used in the landing-page demo + pipeline tests
// ============================================================================

const SHOWCASE_EMAIL = `<!DOCTYPE html>
<html>
<head><title>Meridian 3.0</title></head>
<body style="margin:0;padding:32px 16px;background-color:#f4f2ed;font-family:Georgia,serif;">
  <div style="max-width:540px;margin:0 auto;">
    <a href="#" style="color:#8a8681;font-size:11px;text-decoration:none;">Changelog</a>
    <a href="#" style="color:#8a8681;font-size:11px;text-decoration:none;">Docs</a>
    <h1 style="color:#f0ece4;font-size:26px;">Meridian 3.0</h1>
    <p style="color:rgba(240,236,228,0.55);font-size:14px;">Faster queries. Smarter alerts. A completely redesigned dashboard.</p>
    <p style="font-size:15px;color:#1a1714;">We've been quiet for three months. Here's why: we rewrote the query engine from scratch.</p>
    <a href="https://example.com/dashboard" style="color:#f0ece4;text-decoration:none;">Open Dashboard</a>
    <a href="https://example.com/unsubscribe" style="color:#8a8681;font-size:11px;">Unsubscribe</a>
  </div>
</body>
</html>`;

// ============================================================================
// Clean emails — should score high
// ============================================================================

describe("spam scorer — clean emails", () => {
  test("showcase email scores well (has unsubscribe)", () => {
    const report = analyzeSpam(SHOWCASE_EMAIL);
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(report.level).toBe("low");
  });

  test("minimal clean email", () => {
    const html = `<html><body>
      <p>Hello, this is a normal business email with regular content.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.level).toBe("low");
  });

  test("empty HTML returns perfect score", () => {
    const report = analyzeSpam("");
    expect(report.score).toBe(100);
    expect(report.level).toBe("low");
    expect(report.issues).toEqual([]);
  });

  test("whitespace-only HTML returns perfect score", () => {
    const report = analyzeSpam("   \n\t  ");
    expect(report.score).toBe(100);
  });
});

// ============================================================================
// Spammy emails — should score low
// ============================================================================

describe("spam scorer — spammy emails", () => {
  test("classic spam email scores very low", () => {
    const html = `<html><body>
      <h1>CONGRATULATIONS YOU'VE WON!!!</h1>
      <p>ACT NOW! LIMITED TIME OFFER! FREE GIFT!!!</p>
      <p>CLICK HERE to claim your CASH BONUS!</p>
      <p>BUY NOW and DOUBLE YOUR MONEY! $$$</p>
      <a href="https://bit.ly/scam">Click here</a>
    </body></html>`;
    const report = analyzeSpam(html);
    expect(report.score).toBeLessThan(40);
    expect(report.level).toBe("high");
    expect(report.issues.length).toBeGreaterThan(3);
  });

  test("email with multiple spam indicators", () => {
    const html = `<html><body>
      <p>FREE FREE FREE! Act now! Limited time!</p>
      <p>You've been selected as the winner!</p>
      <a href="http://bit.ly/prize">Click here</a>
    </body></html>`;
    const report = analyzeSpam(html);
    expect(report.score).toBeLessThan(60);
    expect(report.issues.length).toBeGreaterThan(2);
  });
});

// ============================================================================
// Individual rule detection
// ============================================================================

describe("spam scorer — individual rules", () => {
  test("detects missing unsubscribe link", () => {
    const html = `<html><body>
      <p>Hello, this is a newsletter with lots of content for testing.</p>
      <a href="https://example.com">Visit us</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("finds unsubscribe in href", () => {
    const html = `<html><body>
      <p>Hello world, this is content for a testing email message.</p>
      <a href="https://example.com/unsubscribe?token=abc">Manage preferences</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeUndefined();
  });

  test("finds unsubscribe in text", () => {
    const html = `<html><body>
      <p>Hello world, this is content for a test email message here.</p>
      <a href="https://example.com/prefs">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeUndefined();
  });

  test("finds opt-out link as unsubscribe", () => {
    const html = `<html><body>
      <p>Hello world, this is content for a test email message here.</p>
      <a href="https://example.com/opt-out">Opt out</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeUndefined();
  });

  test("detects ALL CAPS content", () => {
    const html = `<html><body>
      <p>THIS IS ALL CAPS AND VERY LOUD ATTENTION GRABBING TEXT THAT GOES ON AND ON</p>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "caps-ratio");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("does not flag normal capitalization", () => {
    const html = `<html><body>
      <p>This is a normal sentence with proper capitalization and enough words to test.</p>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "caps-ratio");
    expect(rule).toBeUndefined();
  });

  test("detects excessive punctuation", () => {
    const html = `<html><body>
      <p>Amazing deal!!! Don't miss out!!! $$$$ Save big!!!</p>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "excessive-punctuation");
    expect(rule).toBeDefined();
  });

  test("detects spam trigger phrases", () => {
    const html = `<html><body><p>Act now before this limited time offer expires!</p></body></html>`;
    const report = analyzeSpam(html);
    const phrases = report.issues.filter((i) => i.rule === "spam-phrases");
    expect(phrases.length).toBeGreaterThan(0);
    const messages = phrases.map((p) => p.message.toLowerCase());
    expect(messages.some((m) => m.includes("act now"))).toBe(true);
  });

  test("detects hidden text via font-size:0", () => {
    const html = `<html><body>
      <p>Normal text.</p>
      <span style="font-size:0">hidden keyword stuffing here</span>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("detects hidden text via visibility:hidden", () => {
    const html = `<html><body>
      <p>Normal text.</p>
      <div style="visibility:hidden">sneaky hidden text</div>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeDefined();
  });

  test("detects hidden text via display:none", () => {
    const html = `<html><body>
      <p>Normal text.</p>
      <div style="display:none">hidden content</div>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeDefined();
  });

  test("detects URL shorteners", () => {
    const html = `<html><body>
      <a href="https://bit.ly/abc123">Click</a>
      <a href="https://t.co/xyz">Tweet</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rules = report.issues.filter((i) => i.rule === "url-shortener");
    expect(rules.length).toBeGreaterThanOrEqual(2);
  });

  test("detects image-only email", () => {
    const html = `<html><body>
      <img src="banner.jpg" alt="Banner">
      <img src="footer.jpg" alt="Footer">
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find(
      (i) => i.rule === "image-only" || i.rule === "high-image-ratio"
    );
    expect(rule).toBeDefined();
  });

  test("detects deceptive link text", () => {
    const html = `<html><body>
      <a href="https://malicious-site.com/steal">https://paypal.com/account</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "deceptive-link");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("does not flag matching link text and href", () => {
    const html = `<html><body>
      <a href="https://example.com/page">https://example.com/page</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "deceptive-link");
    expect(rule).toBeUndefined();
  });

  test("detects ALL CAPS title", () => {
    const html = `<html><head><title>AMAZING SALE TODAY ONLY</title></head><body><p>content</p></body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "all-caps-subject");
    expect(rule).toBeDefined();
  });
});

// ============================================================================
// Score boundaries and edge cases
// ============================================================================

describe("spam scorer — score calculation", () => {
  test("score is always between 0 and 100", () => {
    const spammy = `<html><body>
      <h1>FREE!!! ACT NOW!!! BUY NOW!!! WINNER!!!</h1>
      <p>CONGRATULATIONS! CLICK HERE! LIMITED TIME! $$$</p>
      <span style="font-size:0">hidden spam keywords here</span>
      <a href="https://bit.ly/scam">https://paypal.com</a>
    </body></html>`;
    const report = analyzeSpam(spammy);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  test("level is 'low' when score >= 70", () => {
    const report = analyzeSpam(SHOWCASE_EMAIL);
    if (report.score >= 70) {
      expect(report.level).toBe("low");
    }
  });

  test("per-phrase penalty is capped (not infinite for many phrases)", () => {
    const html = `<html><body>
      <p>Act now, limited time, click here, buy now, order now,
      don't miss, urgent, congratulations, you've been selected,
      free gift, risk free, no obligation, no cost, 100% free,
      double your money, earn extra cash, make money, cash bonus,
      incredible deal, lowest price, special promotion, apply now</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThan(80);
  });
});

// ============================================================================
// Resilience
// ============================================================================

describe("spam scorer — resilience", () => {
  test("handles HTML with no body", () => {
    const html = `<html><head><title>Test</title></head></html>`;
    expect(() => analyzeSpam(html)).not.toThrow();
  });

  test("handles malformed HTML", () => {
    const html = `<html><body><p>unclosed <div style="color:red">broken`;
    expect(() => analyzeSpam(html)).not.toThrow();
  });

  test("handles HTML with only whitespace text", () => {
    const html = `<html><body>   \n\t   </body></html>`;
    expect(() => analyzeSpam(html)).not.toThrow();
  });

  test("handles HTML with script tags", () => {
    const html = `<html><body><script>alert('test')</script><p>Hello world</p></body></html>`;
    expect(() => analyzeSpam(html)).not.toThrow();
  });

  test("handles extremely long HTML", () => {
    const html = `<html><body><p>${"word ".repeat(10000)}</p></body></html>`;
    expect(() => analyzeSpam(html)).not.toThrow();
  });
});
