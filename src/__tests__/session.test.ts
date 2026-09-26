import { describe, test, expect } from "bun:test";
import { createSession } from "../session";
import { auditEmail } from "../audit";
import { analyzeEmail } from "../analyze";
import { analyzeSpam } from "../spam-scorer";
import { validateLinks } from "../link-validator";
import { checkAccessibility } from "../accessibility-checker";
import { analyzeImages } from "../image-analyzer";
import { extractInboxPreview } from "../inbox-preview";
import { checkSize } from "../size-checker";
import { checkTemplateVariables } from "../template-checker";
import { checkTargetingHacks } from "../targeting-checker";

const SAMPLE_HTML = `
<html lang="en">
<head><title>Test Email</title>
  <style>.card { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }</style>
</head>
<body>
  <table role="presentation">
    <tr>
      <td style="color: #000000; background-color: #ffffff; font-size: 14px; display: flex; gap: 16px;">
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

describe("createSession", () => {
  test("session.audit() matches standalone auditEmail()", () => {
    const session = createSession(SAMPLE_HTML, { framework: "jsx" });
    const sessionReport = session.audit();
    const standaloneReport = auditEmail(SAMPLE_HTML, { framework: "jsx" });

    expect(sessionReport.compatibility.warnings).toEqual(standaloneReport.compatibility.warnings);
    expect(sessionReport.compatibility.scores).toEqual(standaloneReport.compatibility.scores);
    expect(sessionReport.spam).toEqual(standaloneReport.spam);
    expect(sessionReport.links).toEqual(standaloneReport.links);
    expect(sessionReport.accessibility).toEqual(standaloneReport.accessibility);
    expect(sessionReport.images).toEqual(standaloneReport.images);
    expect(sessionReport.inboxPreview).toEqual(standaloneReport.inboxPreview);
    expect(sessionReport.size).toEqual(standaloneReport.size);
    expect(sessionReport.templateVariables).toEqual(standaloneReport.templateVariables);
  });

  test("session.audit() reuses the cached analyzeDocument pass", () => {
    const session = createSession(SAMPLE_HTML);
    const warnings = session.analyze();
    const targeting = session.checkTargeting();
    const report = session.audit();
    expect(report.compatibility.warnings).toBe(warnings);
    expect(report.targeting).toBe(targeting);
  });

  test("session.analyze() matches standalone analyzeEmail()", () => {
    const session = createSession(SAMPLE_HTML, { framework: "jsx" });
    const sessionWarnings = session.analyze();
    const standaloneWarnings = analyzeEmail(SAMPLE_HTML, "jsx");

    expect(sessionWarnings).toEqual(standaloneWarnings);
  });

  test("session.analyzeSpam() matches standalone analyzeSpam()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.analyzeSpam();
    const standaloneResult = analyzeSpam(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.validateLinks() matches standalone validateLinks()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.validateLinks();
    const standaloneResult = validateLinks(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.checkAccessibility() matches standalone checkAccessibility()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.checkAccessibility();
    const standaloneResult = checkAccessibility(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.analyzeImages() matches standalone analyzeImages()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.analyzeImages();
    const standaloneResult = analyzeImages(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.extractInboxPreview() matches standalone extractInboxPreview()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.extractInboxPreview();
    const standaloneResult = extractInboxPreview(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.checkSize() matches standalone checkSize()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.checkSize();
    const standaloneResult = checkSize(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.checkTemplateVariables() matches standalone checkTemplateVariables()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.checkTemplateVariables();
    const standaloneResult = checkTemplateVariables(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.checkTargeting() matches standalone checkTargetingHacks()", () => {
    const session = createSession(SAMPLE_HTML);
    const sessionResult = session.checkTargeting();
    const standaloneResult = checkTargetingHacks(SAMPLE_HTML);

    expect(sessionResult).toEqual(standaloneResult);
  });

  test("session.audit() skip option works", () => {
    const session = createSession(SAMPLE_HTML);
    const report = session.audit({ skip: ["spam", "links", "images", "inboxPreview", "size", "templateVariables"] });

    expect(report.spam.score).toBe(100);
    expect(report.spam.issues).toHaveLength(0);
    expect(report.links.totalLinks).toBe(0);
    expect(report.images.total).toBe(0);
    expect(report.inboxPreview.subject).toBeNull();
    expect(report.inboxPreview.issues).toHaveLength(0);
    expect(report.size.htmlBytes).toBe(0);
    expect(report.size.issues).toHaveLength(0);
    expect(report.templateVariables.unresolvedCount).toBe(0);
    expect(report.templateVariables.issues).toHaveLength(0);
    expect(report.compatibility.warnings.length).toBeGreaterThan(0);
    expect(report.accessibility.score).toBeDefined();
  });

  test("empty HTML returns clean session", () => {
    const session = createSession("");
    expect(session.html).toBe("");
    expect(session.framework).toBeUndefined();
    expect(session.analyze()).toEqual([]);
    expect(session.analyzeSpam().score).toBe(100);
    expect(session.validateLinks().totalLinks).toBe(0);
    expect(session.checkAccessibility().score).toBe(100);
    expect(session.analyzeImages().total).toBe(0);
    expect(session.extractInboxPreview().subject).toBeNull();
    expect(session.checkSize().htmlBytes).toBe(0);
    expect(session.checkTemplateVariables().unresolvedCount).toBe(0);
    expect(session.audit().spam.score).toBe(100);
  });

  test("whitespace-only HTML returns clean session", () => {
    const session = createSession("  \n\t  ");
    expect(session.analyze()).toEqual([]);
    expect(session.analyzeSpam().score).toBe(100);
  });

  test("session stores framework", () => {
    const session = createSession(SAMPLE_HTML, { framework: "mjml" });
    expect(session.framework).toBe("mjml");
  });

  test("session stores html", () => {
    const session = createSession(SAMPLE_HTML);
    expect(session.html).toBe(SAMPLE_HTML);
  });

  test("oversized HTML throws", () => {
    const huge = "<html>" + "x".repeat(2 * 1024 * 1024 + 1) + "</html>";
    expect(() => createSession(huge)).toThrow(/exceeds/);
  });

  test("multiple analysis calls on same session produce consistent results", () => {
    const session = createSession(SAMPLE_HTML);

    const spam1 = session.analyzeSpam();
    const spam2 = session.analyzeSpam();
    expect(spam1).toEqual(spam2);

    const links1 = session.validateLinks();
    const links2 = session.validateLinks();
    expect(links1).toEqual(links2);

    const a11y1 = session.checkAccessibility();
    const a11y2 = session.checkAccessibility();
    expect(a11y1).toEqual(a11y2);
  });

  test("session.analyzeSpam() with options", () => {
    const html = `<html><body><p>Test content with enough text to be analyzed properly here.</p></body></html>`;
    const session = createSession(html);
    const report = session.analyzeSpam({ emailType: "transactional" });
    const unsubIssue = report.issues.find(i => i.rule === "missing-unsubscribe");
    expect(unsubIssue === undefined || unsubIssue.severity === "info").toBe(true);
  });
});
