import { describe, test, expect } from "bun:test";
import { checkTemplateVariables } from "../template-checker";

describe("template-checker", () => {
  test("clean email returns no issues", () => {
    const html = `<html><body><p>Hello John, welcome!</p></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  test("empty HTML returns no issues", () => {
    const report = checkTemplateVariables("");
    expect(report.unresolvedCount).toBe(0);
  });

  test("detects Handlebars/Mustache {{var}}", () => {
    const html = `<html><body><p>Hello {{first_name}}, your order is ready.</p></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(1);
    const issue = report.issues.find(i => i.variable === "{{first_name}}");
    expect(issue).toBeDefined();
    expect(issue!.location).toBe("text");
    expect(issue!.severity).toBe("error");
  });

  test("detects Mailchimp *|TAG|* merge tags", () => {
    const html = `<html><body><p>Hi *|FNAME|*, check out *|COMPANY|*</p></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(2);
    expect(report.issues.some(i => i.variable === "*|FNAME|*")).toBe(true);
    expect(report.issues.some(i => i.variable === "*|COMPANY|*")).toBe(true);
  });

  test("detects ERB/EJS <%= %> tags", () => {
    const html = `<html><body><p>Hello <%= user.name %></p></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(1);
    expect(report.issues.some(i => i.variable.includes("user.name"))).toBe(true);
  });

  test("detects Salesforce %%tag%% variables", () => {
    const html = `<html><body><p>Hi %%first_name%%, welcome to %%company%%</p></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(2);
  });

  test("detects single-brace {merge_field} with 3+ char names", () => {
    const html = `<html><body><p>Hello {contact.first_name}</p></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(1);
  });

  test("detects template vars in href attributes", () => {
    const html = `<html><body><a href="https://example.com/unsubscribe?id={{subscriber_id}}">Unsub</a></body></html>`;
    const report = checkTemplateVariables(html);
    const attrIssue = report.issues.find(i => i.location === "attribute");
    expect(attrIssue).toBeDefined();
    expect(attrIssue!.variable).toBe("{{subscriber_id}}");
  });

  test("detects template vars in src attributes", () => {
    const html = `<html><body><img src="{{profile_image_url}}" alt="Photo"></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.issues.some(i => i.location === "attribute" && i.variable === "{{profile_image_url}}")).toBe(true);
  });

  test("does not false-positive on CSS/style content", () => {
    const html = `<html><head><style>.foo { color: red; }</style></head><body><p>Clean text</p></body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBe(0);
  });

  test("does not flag short single-brace tokens (< 3 chars)", () => {
    // {a} and {ab} should not match — too short, likely false positive
    const html = `<html><body><p>Test {a} and {ab} end</p></body></html>`;
    const report = checkTemplateVariables(html);
    const singleBraceIssues = report.issues.filter(i => i.variable === "{a}" || i.variable === "{ab}");
    expect(singleBraceIssues).toHaveLength(0);
  });

  test("multiple variable types in same email", () => {
    const html = `<html><body>
      <p>Hello {{name}}, your code is *|CODE|*</p>
      <a href="https://example.com?id=%%user_id%%">Link</a>
    </body></html>`;
    const report = checkTemplateVariables(html);
    expect(report.unresolvedCount).toBeGreaterThanOrEqual(3);
  });

  test("deduplicates same variable in text", () => {
    const html = `<html><body><p>{{name}} and again {{name}}</p></body></html>`;
    const report = checkTemplateVariables(html);
    // Same variable in text should only appear once
    const nameIssues = report.issues.filter(i => i.variable === "{{name}}" && i.location === "text");
    expect(nameIssues).toHaveLength(1);
  });
});
