import { describe, test, expect } from "bun:test";
import { auditEmail } from "../audit";
import type { AuditReport } from "../audit";

const SIMPLE_HTML = `
<html lang="en">
<head><title>Test Email</title></head>
<body>
  <table role="presentation">
    <tr>
      <td style="color: #000000; background-color: #ffffff; font-size: 14px;">
        <h1>Hello World</h1>
        <p>This is a test email with an
          <a href="https://example.com">example link</a>.
        </p>
        <img src="https://example.com/logo.png" alt="Logo" width="200" height="50" style="display:block;" />
        <a href="https://example.com/unsubscribe">Unsubscribe</a>
      </td>
    </tr>
  </table>
</body>
</html>`;

describe("auditEmail", () => {
  test("returns all report sections", () => {
    const report = auditEmail(SIMPLE_HTML);

    expect(report).toHaveProperty("compatibility");
    expect(report).toHaveProperty("spam");
    expect(report).toHaveProperty("links");
    expect(report).toHaveProperty("accessibility");
    expect(report).toHaveProperty("images");

    expect(report.compatibility).toHaveProperty("warnings");
    expect(report.compatibility).toHaveProperty("scores");
    expect(Array.isArray(report.compatibility.warnings)).toBe(true);
    expect(typeof report.compatibility.scores).toBe("object");

    expect(report.spam).toHaveProperty("score");
    expect(report.spam).toHaveProperty("level");
    expect(report.spam).toHaveProperty("issues");

    expect(report.links).toHaveProperty("totalLinks");
    expect(report.links).toHaveProperty("issues");
    expect(report.links).toHaveProperty("breakdown");

    expect(report.accessibility).toHaveProperty("score");
    expect(report.accessibility).toHaveProperty("issues");

    expect(report.images).toHaveProperty("total");
    expect(report.images).toHaveProperty("issues");
    expect(report.images).toHaveProperty("images");
  });

  test("skip option works for individual checks", () => {
    const report = auditEmail(SIMPLE_HTML, {
      skip: ["spam", "links", "images"],
    });

    // Skipped checks should return defaults
    expect(report.spam.score).toBe(100);
    expect(report.spam.issues).toHaveLength(0);
    expect(report.links.totalLinks).toBe(0);
    expect(report.links.issues).toHaveLength(0);
    expect(report.images.total).toBe(0);

    // Non-skipped checks should still run
    expect(report.compatibility.warnings.length).toBeGreaterThan(0);
    expect(report.accessibility.score).toBeDefined();
  });

  test("skip compatibility", () => {
    const report = auditEmail(SIMPLE_HTML, { skip: ["compatibility"] });
    expect(report.compatibility.warnings).toHaveLength(0);
    expect(Object.keys(report.compatibility.scores)).toHaveLength(0);
  });

  test("framework option propagates to compatibility", () => {
    const withFramework = auditEmail(SIMPLE_HTML, { framework: "jsx" });
    const without = auditEmail(SIMPLE_HTML);

    // Both should have warnings, but framework version may have different fix snippets
    expect(withFramework.compatibility.warnings.length).toBeGreaterThan(0);
    expect(without.compatibility.warnings.length).toBeGreaterThan(0);
  });

  test("empty HTML returns clean report", () => {
    const report = auditEmail("");

    expect(report.compatibility.warnings).toHaveLength(0);
    expect(Object.keys(report.compatibility.scores)).toHaveLength(0);
    expect(report.spam.score).toBe(100);
    expect(report.links.totalLinks).toBe(0);
    expect(report.accessibility.score).toBe(100);
    expect(report.images.total).toBe(0);
  });

  test("whitespace-only HTML returns clean report", () => {
    const report = auditEmail("   \n\t  ");
    expect(report.compatibility.warnings).toHaveLength(0);
    expect(report.spam.score).toBe(100);
  });

  test("spam options propagate", () => {
    const html = `<html><body><p>Test content with enough text to be analyzed.</p></body></html>`;
    const report = auditEmail(html, {
      spam: { emailType: "transactional" },
    });
    // Transactional emails are exempt from unsubscribe requirement
    const unsubIssue = report.spam.issues.find(i => i.rule === "missing-unsubscribe");
    expect(unsubIssue === undefined || unsubIssue.severity === "info").toBe(true);
  });

  test("scores contain all client IDs", () => {
    const report = auditEmail(SIMPLE_HTML);
    const clientIds = Object.keys(report.compatibility.scores);
    expect(clientIds.length).toBeGreaterThanOrEqual(10);
    expect(clientIds).toContain("gmail-web");
    expect(clientIds).toContain("outlook-windows");
    expect(clientIds).toContain("apple-mail-macos");
  });
});
