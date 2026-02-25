import type { CSSWarning } from "./types";
import { getClient, EMAIL_CLIENTS } from "./clients";

export type ExportScope = "all" | "current";

export interface ExportPromptOptions {
  originalHtml: string;
  warnings: CSSWarning[];
  scores: Record<
    string,
    { score: number; errors: number; warnings: number; info: number }
  >;
  scope: ExportScope;
  selectedClientId?: string;
  format?: "html" | "jsx" | "mjml" | "maizzle";
}

export function generateFixPrompt(options: ExportPromptOptions): string {
  const {
    originalHtml,
    warnings,
    scores,
    scope,
    selectedClientId,
    format = "html",
  } = options;

  const filteredWarnings =
    scope === "current" && selectedClientId
      ? warnings.filter((w) => w.client === selectedClientId)
      : warnings;

  const filteredScores =
    scope === "current" && selectedClientId
      ? { [selectedClientId]: scores[selectedClientId] }
      : scores;

  const clientCount = Object.keys(filteredScores).length;
  const errorCount = filteredWarnings.filter(
    (w) => w.severity === "error"
  ).length;
  const warnCount = filteredWarnings.filter(
    (w) => w.severity === "warning"
  ).length;
  const infoCount = filteredWarnings.filter(
    (w) => w.severity === "info"
  ).length;

  const clientLabel =
    scope === "current" && selectedClientId
      ? getClient(selectedClientId)?.name ?? selectedClientId
      : `${clientCount} email clients`;

  const sections: string[] = [];

  // 1. Context
  sections.push(
    `# Email Compatibility Fix Request\n\n` +
      `- **Format:** ${format.toUpperCase()}\n` +
      `- **Scope:** ${clientLabel}\n` +
      `- **Issues found:** ${errorCount} error${errorCount !== 1 ? "s" : ""}, ` +
      `${warnCount} warning${warnCount !== 1 ? "s" : ""}, ` +
      `${infoCount} info`
  );

  // 2. Original email code
  sections.push(
    `## Original Email Code\n\n` + `\`\`\`${format}\n${originalHtml}\n\`\`\``
  );

  // 3. Compatibility scores table
  const scoreEntries = Object.entries(filteredScores).filter(
    ([, v]) => v != null
  );
  if (scoreEntries.length > 0) {
    let table = `## Compatibility Scores\n\n`;
    table += `| Client | Score | Errors | Warnings | Info |\n`;
    table += `|--------|------:|-------:|---------:|-----:|\n`;
    for (const [clientId, data] of scoreEntries) {
      const name = getClient(clientId)?.name ?? clientId;
      table += `| ${name} | ${data.score} | ${data.errors} | ${data.warnings} | ${data.info} |\n`;
    }
    sections.push(table.trimEnd());
  }

  // 4. Detected issues grouped by severity
  if (filteredWarnings.length > 0) {
    let issueSection = `## Detected Issues\n`;

    const groups: [string, CSSWarning[]][] = [
      ["Errors", filteredWarnings.filter((w) => w.severity === "error")],
      ["Warnings", filteredWarnings.filter((w) => w.severity === "warning")],
      ["Info", filteredWarnings.filter((w) => w.severity === "info")],
    ];

    for (const [label, group] of groups) {
      if (group.length === 0) continue;
      issueSection += `\n### ${label}\n`;

      for (const w of group) {
        const clientName = getClient(w.client)?.name ?? w.client;
        issueSection += `\n- **${w.property}** (${clientName}): ${w.message}`;
        if (w.suggestion) {
          issueSection += `\n  - Suggestion: ${w.suggestion}`;
        }
        if (w.fix) {
          const fixLabel = w.fixIsGenericFallback && format !== "html"
            ? `Fix (generic HTML — adapt to ${format.toUpperCase()} syntax)`
            : "Fix";
          issueSection += `\n  - ${fixLabel}:`;
          issueSection += `\n  - Before: \`${w.fix.before}\``;
          issueSection += `\n  - After: \`${w.fix.after}\``;
        }
      }
    }

    sections.push(issueSection);
  }

  // 5. Instructions
  const formatInstructions: Record<string, string> = {
    jsx:
      `Apply all the fixes listed above to the original email code. ` +
      `Return complete fixed JSX code using @react-email/components. ` +
      `Use Row, Column, Container, Font, Img, Head, and Link components from ` +
      `@react-email/components wherever the fix suggests them. ` +
      `Keep all style values as camelCase JavaScript object properties (e.g. { backgroundColor: "#fff" }). ` +
      `Ensure the result is compatible with ${clientLabel}. ` +
      `Do not remove any content — only modify the JSX structure and style props needed to fix the issues.`,
    mjml:
      `Apply all the fixes listed above to the original email code. ` +
      `Return complete fixed MJML markup. ` +
      `Use MJML-native elements (mj-section, mj-column, mj-text, mj-button, mj-font, mj-style, mj-raw) ` +
      `as indicated in the fixes. ` +
      `Ensure the result is valid MJML that compiles without errors. ` +
      `Ensure the result is compatible with ${clientLabel}. ` +
      `Do not remove any content — only modify the MJML structure and attributes needed to fix the issues.`,
    maizzle:
      `Apply all the fixes listed above to the original email code. ` +
      `Return the complete fixed Maizzle template. ` +
      `Use Tailwind CSS utility classes and Maizzle config settings as indicated in the fixes. ` +
      `Add MSO conditional comment table wrappers where needed for Outlook compatibility. ` +
      `Ensure the result is compatible with ${clientLabel}. ` +
      `Do not remove any content — only modify the Tailwind classes and HTML structure needed to fix the issues.`,
    html:
      `Apply all the fixes listed above to the original email code. ` +
      `Return the complete fixed HTML code. ` +
      `Ensure the result is compatible with ${clientLabel}. ` +
      `Do not remove any content — only modify the CSS and HTML attributes needed to fix the issues.`,
  };

  sections.push(
    `## Instructions\n\n` + (formatInstructions[format] ?? formatInstructions.html)
  );

  return sections.join("\n\n");
}
