import { describe, test, expect } from "bun:test";
import { analyzeSpam } from "../spam-scorer";
import { validateLinks } from "../link-validator";
import { checkAccessibility } from "../accessibility-checker";
import { auditEmail } from "../audit";
import { createSession } from "../session";

// ============================================================================
// Gap 5: CAN-SPAM physical address
// ============================================================================

describe("spam scorer — physical address (gap 5)", () => {
  test("email without physical address gets warning", () => {
    const html = `<html><body>
      <p>Check out our latest products and deals.</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html, { emailType: "marketing" });
    const rule = report.issues.find(i => i.rule === "missing-physical-address");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("email with street address and ZIP passes", () => {
    const html = `<html><body>
      <p>Newsletter content here.</p>
      <p>123 Main Street, San Francisco, CA 94105</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find(i => i.rule === "missing-physical-address");
    expect(rule).toBeUndefined();
  });

  test("email with PO Box and ZIP passes", () => {
    const html = `<html><body>
      <p>Newsletter content here.</p>
      <p>P.O. Box 1234, New York, NY 10001</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find(i => i.rule === "missing-physical-address");
    expect(rule).toBeUndefined();
  });

  test("email with address class passes", () => {
    const html = `<html><body>
      <p>Newsletter content here.</p>
      <div class="footer-address">Company Inc., Some Address Info</div>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find(i => i.rule === "missing-physical-address");
    expect(rule).toBeUndefined();
  });

  test("email with <address> element passes", () => {
    const html = `<html><body>
      <p>Newsletter content here.</p>
      <address>Company Inc., 456 Oak Ave</address>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find(i => i.rule === "missing-physical-address");
    expect(rule).toBeUndefined();
  });

  test("transactional email is exempt from address check", () => {
    const html = `<html><body><p>Your order confirmation</p></body></html>`;
    const report = analyzeSpam(html, { emailType: "transactional" });
    const rule = report.issues.find(i => i.rule === "missing-physical-address");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Gap 10: One-click unsubscribe (RFC 8058)
// ============================================================================

describe("spam scorer — one-click unsubscribe (gap 10)", () => {
  test("List-Unsubscribe without List-Unsubscribe-Post gets warning", () => {
    const html = `<html><body><p>Newsletter content here</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html, {
      listUnsubscribeHeader: "<mailto:unsub@example.com>",
    });
    const rule = report.issues.find(i => i.rule === "missing-one-click-unsubscribe");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("both headers present — no issue", () => {
    const html = `<html><body><p>Newsletter content here</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html, {
      listUnsubscribeHeader: "<mailto:unsub@example.com>",
      listUnsubscribePostHeader: "List-Unsubscribe=One-Click",
    });
    const rule = report.issues.find(i => i.rule === "missing-one-click-unsubscribe");
    expect(rule).toBeUndefined();
  });

  test("no List-Unsubscribe header — skip one-click check", () => {
    const html = `<html><body><p>Newsletter content here</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = analyzeSpam(html);
    const rule = report.issues.find(i => i.rule === "missing-one-click-unsubscribe");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Gap 6: Broken anchor links
// ============================================================================

describe("link validator — broken anchors (gap 6)", () => {
  test("broken anchor #missing returns error", () => {
    const html = `<html><body>
      <a href="#missing">Go to section</a>
      <p>No element with id="missing" exists.</p>
    </body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find(i => i.rule === "broken-anchor");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
    expect(rule!.href).toBe("#missing");
  });

  test("valid anchor #section is not flagged", () => {
    const html = `<html><body>
      <a href="#section">Go to section</a>
      <div id="section"><p>Section content</p></div>
    </body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find(i => i.rule === "broken-anchor");
    expect(rule).toBeUndefined();
  });

  test("bare # is not checked as broken anchor (it's a placeholder)", () => {
    const html = `<html><body>
      <a href="#">Click here</a>
    </body></html>`;
    const report = validateLinks(html);
    const rule = report.issues.find(i => i.rule === "broken-anchor");
    expect(rule).toBeUndefined();
  });

  test("multiple broken anchors are all reported", () => {
    const html = `<html><body>
      <a href="#one">One</a>
      <a href="#two">Two</a>
    </body></html>`;
    const report = validateLinks(html);
    const broken = report.issues.filter(i => i.rule === "broken-anchor");
    expect(broken.length).toBe(2);
  });
});

// ============================================================================
// Gap 8: Charset encoding validation
// ============================================================================

describe("accessibility — charset check (gap 8)", () => {
  test("missing charset returns warning", () => {
    const html = `<html lang="en"><head><title>Test</title></head><body><p>Hello</p></body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find(i => i.rule === "missing-charset");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
  });

  test("<meta charset='utf-8'> passes", () => {
    const html = `<html lang="en"><head><meta charset="utf-8"><title>Test</title></head><body><p>Hello</p></body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find(i => i.rule === "missing-charset");
    expect(rule).toBeUndefined();
  });

  test("<meta http-equiv='Content-Type' content='...charset=utf-8'> passes", () => {
    const html = `<html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>Test</title></head><body><p>Hello</p></body></html>`;
    const report = checkAccessibility(html);
    const rule = report.issues.find(i => i.rule === "missing-charset");
    expect(rule).toBeUndefined();
  });
});

// ============================================================================
// Gap 1: Audit pipeline includes inbox preview, size, template variables
// ============================================================================

describe("audit — new fields (gap 1)", () => {
  const FULL_HTML = `<html lang="en">
    <head><meta charset="utf-8"><title>Newsletter</title></head>
    <body>
      <div style="display:none;max-height:0;overflow:hidden;">Preview text for the email inbox display</div>
      <table role="presentation"><tr><td style="color:#000;background-color:#fff;font-size:14px;">
        <h1>Hello</h1>
        <p>Content here with enough text to be meaningful.</p>
        <a href="https://example.com">Visit</a>
        <a href="https://example.com/unsubscribe">Unsubscribe</a>
        <img src="logo.png" alt="Logo" width="200" height="50" />
        <p>123 Main St, San Francisco, CA 94105</p>
      </td></tr></table>
    </body></html>`;

  test("auditEmail returns inboxPreview, size, templateVariables", () => {
    const report = auditEmail(FULL_HTML);
    expect(report).toHaveProperty("inboxPreview");
    expect(report).toHaveProperty("size");
    expect(report).toHaveProperty("templateVariables");

    expect(report.inboxPreview.subject).toBe("Newsletter");
    expect(report.inboxPreview.truncation.length).toBe(8);
    expect(report.size.htmlBytes).toBeGreaterThan(0);
    expect(report.size.clipped).toBe(false);
    expect(report.templateVariables.unresolvedCount).toBe(0);
  });

  test("session.audit() returns same shape as auditEmail()", () => {
    const session = createSession(FULL_HTML);
    const sessionReport = session.audit();
    const standaloneReport = auditEmail(FULL_HTML);

    expect(sessionReport.inboxPreview).toEqual(standaloneReport.inboxPreview);
    expect(sessionReport.size).toEqual(standaloneReport.size);
    expect(sessionReport.templateVariables).toEqual(standaloneReport.templateVariables);
  });

  test("empty HTML returns clean new fields", () => {
    const report = auditEmail("");
    expect(report.inboxPreview.subject).toBeNull();
    expect(report.inboxPreview.truncation).toEqual([]);
    expect(report.size.htmlBytes).toBe(0);
    expect(report.size.clipped).toBe(false);
    expect(report.templateVariables.unresolvedCount).toBe(0);
  });

  test("skip inboxPreview/size/templateVariables", () => {
    const report = auditEmail(FULL_HTML, {
      skip: ["inboxPreview", "size", "templateVariables"],
    });
    expect(report.inboxPreview.subject).toBeNull();
    expect(report.inboxPreview.truncation).toEqual([]);
    expect(report.size.htmlBytes).toBe(0);
    expect(report.templateVariables.unresolvedCount).toBe(0);
  });

  test("audit detects template variables", () => {
    const htmlWithTemplates = `<html><head><title>Test</title></head><body>
      <p>Hello {{name}}, your code is *|FNAME|*</p>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const report = auditEmail(htmlWithTemplates);
    expect(report.templateVariables.unresolvedCount).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Session — new methods
// ============================================================================

describe("session — new methods", () => {
  test("session.checkSize() works", () => {
    const html = `<html><body><p>Hello world</p></body></html>`;
    const session = createSession(html);
    const report = session.checkSize();
    expect(report.htmlBytes).toBeGreaterThan(0);
    expect(report.clipped).toBe(false);
  });

  test("session.checkTemplateVariables() works", () => {
    const html = `<html><body><p>Hello {{name}}</p></body></html>`;
    const session = createSession(html);
    const report = session.checkTemplateVariables();
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(1);
  });

  test("empty session returns clean new methods", () => {
    const session = createSession("");
    expect(session.checkSize().htmlBytes).toBe(0);
    expect(session.checkTemplateVariables().unresolvedCount).toBe(0);
    const report = session.audit();
    expect(report.inboxPreview.truncation).toEqual([]);
    expect(report.size.htmlBytes).toBe(0);
    expect(report.templateVariables.unresolvedCount).toBe(0);
  });
});
