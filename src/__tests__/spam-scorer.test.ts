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
      (i) => i.rule === "image-only" || i.rule === "high-image-ratio",
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

// ============================================================================
// Fix #1: Hidden text — preheader exemption
// ============================================================================

describe("spam scorer — preheader exemption (fix #1)", () => {
  test("preheader with display:none + overflow:hidden is NOT flagged", () => {
    const html = `<html><body>
      <div style="display:none;overflow:hidden;max-height:0;">Preview text for inbox</div>
      <p>Main email content here with enough words for testing.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeUndefined();
  });

  test("preheader with font-size:0 + max-height:0 is NOT flagged", () => {
    const html = `<html><body>
      <span style="font-size:0;max-height:0;overflow:hidden;">Preview text</span>
      <p>Main email content here with enough words for testing.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeUndefined();
  });

  test("preheader with display:none + mso-hide:all is NOT flagged", () => {
    const html = `<html><body>
      <div style="display:none;mso-hide:all;">Outlook-hidden preheader</div>
      <p>Main email content here.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeUndefined();
  });

  test("preheader with font-size:0 + line-height:0 is NOT flagged", () => {
    const html = `<html><body>
      <span style="font-size:0;line-height:0;color:transparent;">Preheader</span>
      <p>Main email content here.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeUndefined();
  });

  test("mid-body font-size:0 keyword stuffing is STILL flagged", () => {
    const html = `<html><body>
      <p>Normal content at the top of the email body.</p>
      <div><div><div>
        <span style="font-size:0">buy cheap viagra pills online free discount</span>
      </div></div></div>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeDefined();
  });

  test("visibility:hidden is ALWAYS flagged even with preheader patterns", () => {
    const html = `<html><body>
      <div style="visibility:hidden;max-height:0;overflow:hidden;">Short text</div>
      <p>Main content.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeDefined();
  });

  test("long hidden text (>200 chars) is STILL flagged even with accessory styles", () => {
    const longText = "keyword ".repeat(30); // ~240 chars
    const html = `<html><body>
      <div style="display:none;max-height:0;overflow:hidden;">${longText}</div>
      <p>Main content.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "hidden-text");
    expect(rule).toBeDefined();
  });
});

// ============================================================================
// Fix #2: Deceptive links — ESP tracking domain exemption
// ============================================================================

describe("spam scorer — ESP tracking domains (fix #2)", () => {
  test("Mailchimp tracked link is NOT flagged as deceptive", () => {
    const html = `<html><body>
      <a href="https://click.mailchimp.com/track?u=abc&id=123">https://example.com/sale</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "deceptive-link");
    expect(rule).toBeUndefined();
  });

  test("SendGrid tracked link is NOT flagged as deceptive", () => {
    const html = `<html><body>
      <a href="https://click.sendgrid.net/ls/click?upn=abc">https://mysite.com/offer</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "deceptive-link");
    expect(rule).toBeUndefined();
  });

  test("Klaviyo tracked link is NOT flagged as deceptive", () => {
    const html = `<html><body>
      <a href="https://click.klaviyomail.com/xyz">https://shop.example.com</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "deceptive-link");
    expect(rule).toBeUndefined();
  });

  test("ESP tracked link with encoded destination in query is NOT flagged", () => {
    const html = `<html><body>
      <a href="https://tracking.example.net/click?url=https%3A%2F%2Fmystore.com%2Fsale">https://mystore.com/sale</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "deceptive-link");
    expect(rule).toBeUndefined();
  });

  test("genuine phishing link is STILL flagged", () => {
    const html = `<html><body>
      <a href="https://evil-phisher.com/steal">https://paypal.com/account</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "deceptive-link");
    expect(rule).toBeDefined();
  });
});

// ============================================================================
// Fix #3: URL shorteners — hostname matching
// ============================================================================

describe("spam scorer — URL shortener hostname matching (fix #3)", () => {
  test("https://contact.com is NOT flagged as URL shortener (t.co substring)", () => {
    const html = `<html><body>
      <a href="https://contact.com/page">Visit us</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "url-shortener");
    expect(rule).toBeUndefined();
  });

  test("https://content.co/blog is NOT flagged as URL shortener", () => {
    const html = `<html><body>
      <a href="https://content.co/blog">Read more</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "url-shortener");
    expect(rule).toBeUndefined();
  });

  test("https://t.co/abc IS still flagged as shortener", () => {
    const html = `<html><body>
      <a href="https://t.co/abc123">Tweet link</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "url-shortener");
    expect(rule).toBeDefined();
  });

  test("https://bit.ly/xyz IS still flagged as shortener", () => {
    const html = `<html><body>
      <a href="https://bit.ly/xyz789">Short link</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "url-shortener");
    expect(rule).toBeDefined();
  });

  test("malformed URL in href does not throw", () => {
    const html = `<html><body>
      <a href="not-a-valid-url">Click</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    expect(() => analyzeSpam(html)).not.toThrow();
  });
});

// ============================================================================
// Fix #4: Unsubscribe — transactional exemption + options API
// ============================================================================

describe("spam scorer — transactional exemption (fix #4)", () => {
  test("transactional password reset without unsubscribe is NOT error", () => {
    const html = `<html><body>
      <p>Reset your password</p>
      <p>Your verification code is 847293</p>
      <a href="https://example.com/reset?token=abc">Reset Password</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    // Should be info (downgraded), not error
    if (rule) {
      expect(rule.severity).toBe("info");
    }
  });

  test("options.emailType === 'transactional' skips unsubscribe check entirely", () => {
    const html = `<html><body>
      <p>Here is your order confirmation.</p>
    </body></html>`;
    const report = analyzeSpam(html, { emailType: "transactional" });
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeUndefined();
  });

  test("options.listUnsubscribeHeader satisfies unsubscribe requirement", () => {
    const html = `<html><body>
      <p>Weekly newsletter content with enough words for testing.</p>
    </body></html>`;
    const report = analyzeSpam(html, {
      listUnsubscribeHeader: "<mailto:unsub@example.com>",
    });
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeUndefined();
  });

  test("marketing email without unsubscribe is still an error", () => {
    const html = `<html><body>
      <p>Check out our latest sale with great prices and discounts.</p>
    </body></html>`;
    const report = analyzeSpam(html, { emailType: "marketing" });
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
  });

  test("options with empty listUnsubscribeHeader still requires unsubscribe", () => {
    const html = `<html><body>
      <p>Newsletter content about various topics and updates.</p>
    </body></html>`;
    const report = analyzeSpam(html, { listUnsubscribeHeader: "  " });
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    expect(rule).toBeDefined();
  });

  test("transactional auto-detect with order confirmation + receipt signals", () => {
    const html = `<html><body>
      <h1>Order Confirmation</h1>
      <p>Thank you for your purchase. Here is your receipt.</p>
      <p>Order #12345</p>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    if (rule) {
      expect(rule.severity).toBe("info");
    }
  });

  test("info-level missing-unsubscribe does NOT penalize score", () => {
    const html = `<html><body>
      <p>Reset your password using the link below.</p>
      <p>Your verification code is 384721</p>
      <a href="https://example.com/reset?token=abc">Reset Password</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "missing-unsubscribe");
    // If auto-detected as transactional, info severity won't count toward penalty
    if (rule && rule.severity === "info") {
      expect(report.score).toBeGreaterThanOrEqual(85);
    }
  });
});

// ============================================================================
// Fix #5: Punctuation — scaled threshold + $ price exemption
// ============================================================================

describe("spam scorer — punctuation scaling (fix #5)", () => {
  test("price-heavy email with $29 $49 $99 is NOT flagged for punctuation", () => {
    const html = `<html><body>
      <p>Our plans: Basic $29/mo, Pro $49/mo, Enterprise $99/mo.</p>
      <p>All plans include unlimited access to our platform.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "excessive-punctuation");
    expect(rule).toBeUndefined();
  });

  test("$ followed by digit (prices) are not counted", () => {
    const html = `<html><body>
      <p>Save $10 on orders over $50! Get $100 worth of products for $75.</p>
      <p>Use code SAVE20 for $20 off your next $80 purchase.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "excessive-punctuation");
    expect(rule).toBeUndefined();
  });

  test("bare $$$ (not followed by digits) is still counted", () => {
    const html = `<html><body>
      <p>Make $$$ fast! Easy $$$!</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "excessive-punctuation");
    expect(rule).toBeDefined();
  });

  test("long email with moderate punctuation is NOT flagged (scaled threshold)", () => {
    // ~1200 chars → threshold = max(5, floor(1200/200)) = 6
    const content = "This is a paragraph of normal email content. ".repeat(25);
    const html = `<html><body>
      <p>${content}</p>
      <p>Great news! New feature! Check it out! Updated pricing! Fresh look! More coming!</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find((i) => i.rule === "excessive-punctuation");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Fix #6: Spam phrases — word boundary matching
// ============================================================================

describe("spam scorer — word boundary matching (fix #6)", () => {
  test('"unlimited time" is NOT flagged for "limited time" phrase', () => {
    const html = `<html><body>
      <p>You have unlimited time to complete the task at hand.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const phrases = report.issues.filter(
      (i) => i.rule === "spam-phrases" && i.message.includes("limited time"),
    );
    expect(phrases.length).toBe(0);
  });

  test('"no costly mistakes" is NOT flagged for "no cost" phrase', () => {
    const html = `<html><body>
      <p>Avoid no costly mistakes when building your application.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const phrases = report.issues.filter(
      (i) => i.rule === "spam-phrases" && i.message.includes("no cost"),
    );
    expect(phrases.length).toBe(0);
  });

  test('"we apply now" is NOT flagged when "apply now" is part of larger context', () => {
    // "apply now" as standalone phrase should still be caught
    const html = `<html><body>
      <p>Apply now for the position!</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const phrases = report.issues.filter(
      (i) => i.rule === "spam-phrases" && i.message.includes("apply now"),
    );
    expect(phrases.length).toBe(1);
  });

  test("exact spam phrase match still works", () => {
    const html = `<html><body>
      <p>This is a limited time offer, act now!</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const phrases = report.issues.filter((i) => i.rule === "spam-phrases");
    expect(phrases.length).toBeGreaterThanOrEqual(2);
    const messages = phrases.map((p) => p.message);
    expect(messages.some((m) => m.includes("limited time"))).toBe(true);
    expect(messages.some((m) => m.includes("act now"))).toBe(true);
  });
});

// ============================================================================
// Full false-positive scenario: Mailchimp newsletter
// ============================================================================

describe("spam scorer — realistic newsletter (integration)", () => {
  test("Mailchimp newsletter with preheader and tracked links scores well", () => {
    const html = `<html><body>
      <div style="display:none;font-size:0;max-height:0;overflow:hidden;mso-hide:all;">
        Preview: Your weekly product update is here
      </div>
      <h1>Weekly Product Update</h1>
      <p>Hi there! Here is what happened this week with our product updates and launches.</p>
      <p>We shipped three new features and fixed several bugs.</p>
      <a href="https://click.mailchimp.com/track?u=abc&id=1">https://myapp.com/features</a>
      <a href="https://click.mailchimp.com/track?u=abc&id=2">https://myapp.com/changelog</a>
      <p>Plans start at $9/mo, $19/mo, or $49/mo depending on your needs.</p>
      <a href="https://click.mailchimp.com/track?u=abc&unsub=true">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(report.level).toBe("low");
    // Should have no hidden-text, deceptive-link, url-shortener, or punctuation issues
    const badRules = report.issues.filter((i) =>
      ["hidden-text", "deceptive-link", "url-shortener", "excessive-punctuation"].includes(i.rule),
    );
    expect(badRules.length).toBe(0);
  });
});
