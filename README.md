# @emailens/engine

Email compatibility engine that transforms CSS per email client, analyzes compatibility, scores results, simulates dark mode, and provides framework-aware fix snippets.

Supports **12 email clients**: Gmail (Web, Android, iOS), Outlook (365, Windows), Apple Mail (macOS, iOS), Yahoo Mail, Samsung Mail, Thunderbird, HEY Mail, and Superhuman.

## Install

```bash
npm install @emailens/engine
# or
bun add @emailens/engine
```

## Quick Start

```typescript
import {
  analyzeEmail,
  generateCompatibilityScore,
  transformForAllClients,
  simulateDarkMode,
} from "@emailens/engine";

const html = `
<html>
<head>
  <style>
    .card { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="card" style="display: flex; gap: 16px;">
    <div>Column A</div>
    <div>Column B</div>
  </div>
</body>
</html>
`;

// 1. Analyze CSS compatibility across all clients
const warnings = analyzeEmail(html);
console.log(`Found ${warnings.length} warnings`);

// 2. Generate per-client scores (0–100)
const scores = generateCompatibilityScore(warnings);
console.log(scores["gmail-web"]); // { score: 75, errors: 0, warnings: 5, info: 0 }
console.log(scores["outlook-windows"]); // { score: 40, errors: 1, warnings: 8, info: 2 }

// 3. Transform HTML per client (strips unsupported CSS, inlines styles)
const transforms = transformForAllClients(html);
for (const t of transforms) {
  console.log(`${t.clientId}: ${t.warnings.length} warnings`);
}

// 4. Simulate dark mode for a specific client
const darkMode = simulateDarkMode(html, "gmail-android");
console.log(darkMode.warnings); // Warns about transparent PNGs, missing prefers-color-scheme, etc.
```

## API Reference

### `analyzeEmail(html: string, framework?: Framework): CSSWarning[]`

Analyzes an HTML email and returns CSS compatibility warnings for all 12 email clients. Detects usage of `<style>`, `<link>`, `<svg>`, `<video>`, `<form>`, inline CSS properties, `@font-face`, `@media` queries, gradients, flexbox/grid, and more.

The optional `framework` parameter (`"jsx"` | `"mjml"` | `"maizzle"`) controls which fix snippets are attached to warnings. Analysis always runs on compiled HTML — fix snippets reference source-level constructs so you know how to modify your framework source code.

```typescript
// Plain HTML analysis
const warnings = analyzeEmail(html);

// Framework-aware: fixes reference React Email components
const warnings = analyzeEmail(html, "jsx");

// Framework-aware: fixes reference MJML elements
const warnings = analyzeEmail(html, "mjml");

// Framework-aware: fixes reference Maizzle/Tailwind classes
const warnings = analyzeEmail(html, "maizzle");
```

### `generateCompatibilityScore(warnings: CSSWarning[]): Record<string, ClientScore>`

Generates a 0–100 compatibility score per email client from a set of warnings.

**Scoring formula:** `score = 100 - (errors × 15) - (warnings × 5) - (info × 1)`, clamped to 0–100.

```typescript
const scores = generateCompatibilityScore(warnings);
// {
//   "gmail-web": { score: 75, errors: 0, warnings: 5, info: 0 },
//   "outlook-windows": { score: 40, errors: 1, warnings: 8, info: 2 },
//   "apple-mail-macos": { score: 100, errors: 0, warnings: 0, info: 0 },
//   ...
// }
```

### `transformForClient(html: string, clientId: string, framework?: Framework): TransformResult`

Transforms HTML for a specific email client. Strips unsupported CSS, inlines `<style>` blocks (for Gmail), removes unsupported elements, and generates per-client warnings.

```typescript
const result = transformForClient(html, "gmail-web");
console.log(result.html);      // Transformed HTML
console.log(result.warnings);  // Client-specific warnings
console.log(result.clientId);  // "gmail-web"
```

### `transformForAllClients(html: string, framework?: Framework): TransformResult[]`

Transforms HTML for all 12 email clients at once.

```typescript
const results = transformForAllClients(html);
for (const r of results) {
  console.log(`${r.clientId}: ${r.warnings.length} issues`);
}
```

### `simulateDarkMode(html: string, clientId: string): { html: string; warnings: CSSWarning[] }`

Simulates how an email client applies dark mode. Different clients use different strategies:

- **Full inversion** (Gmail Android, Samsung Mail): swaps all light backgrounds to dark
- **Partial inversion** (Gmail Web, Apple Mail, Yahoo, Outlook.com, HEY, Superhuman): only inverts white backgrounds
- **No dark mode** (Outlook Windows, Thunderbird): no transformation

```typescript
const { html: darkHtml, warnings } = simulateDarkMode(html, "gmail-android");
```

### `getCodeFix(property: string, clientId: string, framework?: Framework): CodeFix | undefined`

Returns a paste-ready code fix for a specific CSS property + client combination. Fixes are tiered:

1. **Framework + client specific** (e.g., `border-radius` + Outlook + JSX → VML roundrect component)
2. **Framework specific** (e.g., `@font-face` + MJML → `<mj-font>`)
3. **Generic HTML fallback** (e.g., `display:flex` + Outlook → HTML table with MSO conditionals)

```typescript
const fix = getCodeFix("display:flex", "outlook-windows", "jsx");
// {
//   language: "jsx",
//   description: "Use Row and Column from @react-email/components",
//   before: "<div style={{ display: 'flex' }}>...",
//   after: "<Row><Column>..."
// }
```

### `getSuggestion(property: string, clientId: string, framework?: Framework): { text: string; isGenericFallback?: boolean }`

Returns a human-readable suggestion for fixing a compatibility issue. Lighter than `getCodeFix` — returns a text description rather than before/after code.

### `diffResults(before, after): DiffResult[]`

Compares two sets of analysis results (before and after a fix). Shows what improved, regressed, or stayed the same per client.

```typescript
const before = { scores: generateCompatibilityScore(warningsBefore), warnings: warningsBefore };
const after = { scores: generateCompatibilityScore(warningsAfter), warnings: warningsAfter };
const diffs = diffResults(before, after);

for (const d of diffs) {
  console.log(`${d.clientId}: ${d.scoreBefore} → ${d.scoreAfter} (${d.scoreDelta > 0 ? "+" : ""}${d.scoreDelta})`);
  console.log(`  Fixed: ${d.fixed.length}, Introduced: ${d.introduced.length}`);
}
```

### `generateFixPrompt(options: ExportPromptOptions): string`

Generates a markdown prompt suitable for passing to an AI assistant to fix compatibility issues. Includes the original HTML, compatibility scores table, all detected issues with fix suggestions, and format-specific instructions.

```typescript
const prompt = generateFixPrompt({
  originalHtml: html,
  warnings,
  scores,
  scope: "all",           // or "current" with selectedClientId
  format: "jsx",           // "html" | "jsx" | "mjml" | "maizzle"
});
```

### `EMAIL_CLIENTS: EmailClient[]`

Array of all 12 supported email client definitions.

```typescript
import { EMAIL_CLIENTS } from "@emailens/engine";

for (const client of EMAIL_CLIENTS) {
  console.log(`${client.name} (${client.category}) — ${client.engine}`);
}
// Gmail (webmail) — Gmail Web
// Outlook Windows (desktop) — Microsoft Word
// Apple Mail (desktop) — WebKit
// ...
```

### `getClient(id: string): EmailClient | undefined`

Look up a client by ID.

## Supported Email Clients

| Client | ID | Category | Engine | Dark Mode |
|---|---|---|---|---|
| Gmail | `gmail-web` | Webmail | Gmail Web | Yes |
| Gmail Android | `gmail-android` | Mobile | Gmail Mobile | Yes |
| Gmail iOS | `gmail-ios` | Mobile | Gmail Mobile | Yes |
| Outlook 365 | `outlook-web` | Webmail | Outlook Web | Yes |
| Outlook Windows | `outlook-windows` | Desktop | Microsoft Word | No |
| Apple Mail | `apple-mail-macos` | Desktop | WebKit | Yes |
| Apple Mail iOS | `apple-mail-ios` | Mobile | WebKit | Yes |
| Yahoo Mail | `yahoo-mail` | Webmail | Yahoo | Yes |
| Samsung Mail | `samsung-mail` | Mobile | Samsung | Yes |
| Thunderbird | `thunderbird` | Desktop | Gecko | No |
| HEY Mail | `hey-mail` | Webmail | WebKit | Yes |
| Superhuman | `superhuman` | Desktop | Blink | Yes |

## AI-Powered Fixes (v0.2.0)

The engine classifies every warning as either `css` (CSS-only swap) or `structural` (requires HTML restructuring — tables, VML, conditionals). For structural issues that static snippets can't solve, the engine can generate a structured prompt and delegate to an LLM.

The engine is **provider-agnostic** — you bring your own AI provider via a simple callback.

### `generateAiFix(options): Promise<AiFixResult>`

Builds a fix prompt from the engine's analysis, sends it to your AI provider, and extracts the fixed code.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import {
  analyzeEmail,
  generateCompatibilityScore,
  generateAiFix,
  AI_FIX_SYSTEM_PROMPT,
} from "@emailens/engine";

const anthropic = new Anthropic();
const warnings = analyzeEmail(html, "jsx");
const scores = generateCompatibilityScore(warnings);

const result = await generateAiFix({
  originalHtml: html,
  warnings,
  scores,
  scope: "all",        // or "current" with selectedClientId
  format: "jsx",
  provider: async (prompt) => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: AI_FIX_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text : "";
  },
});

console.log(result.code);              // Fixed email code
console.log(result.targetedWarnings);  // 23
console.log(result.structuralCount);   // 5
```

### `estimateAiFixTokens(options): Promise<TokenEstimate>`

Estimate tokens **before** making an API call. Use for cost estimates, limit checks, and UI feedback.

```typescript
import { estimateAiFixTokens } from "@emailens/engine";

const estimate = await estimateAiFixTokens({
  originalHtml: html,
  warnings,
  scores,
  scope: "all",
  format: "jsx",
  maxInputTokens: 16000,  // optional, triggers smart truncation
});

console.log(`~${estimate.inputTokens} input tokens`);
console.log(`~${estimate.estimatedOutputTokens} output tokens`);
console.log(`${estimate.warningCount} warnings (${estimate.structuralCount} structural)`);
console.log(`Truncated: ${estimate.truncated}`);
```

**Smart truncation** kicks in when the prompt exceeds `maxInputTokens`:
1. Deduplicates warnings (same property × severity)
2. Removes `info`-level warnings
3. Removes CSS-only warnings (keeps structural + errors)
4. Trims long fix snippets

### `heuristicTokenCount(text): number`

Instant synchronous token estimate (~3.5 chars/token). Within ~10-15% of real Claude tokenizer for HTML/CSS.

```typescript
import { heuristicTokenCount } from "@emailens/engine";
const tokens = heuristicTokenCount(html); // instant, no deps
```

### `AI_FIX_SYSTEM_PROMPT`

Expert system prompt for email compatibility fixes. Pass as the `system` parameter to your LLM call for best results. Includes structural fix patterns (table layouts, VML, MSO conditionals).

### `STRUCTURAL_FIX_PROPERTIES`

`Set<string>` of CSS properties that require HTML restructuring (not just CSS swaps). Includes `display:flex`, `display:grid`, `word-break`, `position`, `border-radius` (Outlook), `background-image` (Outlook), and more.

```typescript
import { STRUCTURAL_FIX_PROPERTIES } from "@emailens/engine";
STRUCTURAL_FIX_PROPERTIES.has("word-break"); // true
STRUCTURAL_FIX_PROPERTIES.has("color");      // false
```

## CSS Support Matrix

The engine includes a comprehensive CSS support matrix (`src/rules/css-support.ts`) covering 45+ CSS properties and HTML elements across all 12 clients. Data sourced from [caniemail.com](https://www.caniemail.com/) with inferred values for HEY Mail and Superhuman based on their rendering engines.

Properties added in v0.2.0: `word-break`, `overflow-wrap`, `white-space`, `text-overflow`, `vertical-align`, `border-spacing`, `min-width`, `min-height`, `max-height`, `text-shadow`, `background-size`, `background-position`.

## Types

```typescript
type SupportLevel = "supported" | "partial" | "unsupported" | "unknown";
type Framework = "jsx" | "mjml" | "maizzle";
type InputFormat = "html" | Framework;
type FixType = "css" | "structural";
type AiProvider = (prompt: string) => Promise<string>;

interface EmailClient {
  id: string;
  name: string;
  category: "webmail" | "desktop" | "mobile";
  engine: string;
  darkModeSupport: boolean;
  icon: string;
}

interface CSSWarning {
  severity: "error" | "warning" | "info";
  client: string;
  property: string;
  message: string;
  suggestion?: string;
  fix?: CodeFix;
  fixIsGenericFallback?: boolean;
  fixType?: FixType;           // "css" or "structural" (v0.2.0)
}

interface CodeFix {
  before: string;
  after: string;
  language: "html" | "css" | "jsx" | "mjml" | "maizzle";
  description: string;
}

interface AiFixResult {
  code: string;
  prompt: string;
  targetedWarnings: number;
  structuralCount: number;
  tokenEstimate: TokenEstimate;
}

interface TokenEstimate {
  inputTokens: number;
  estimatedOutputTokens: number;
  promptCharacters: number;
  htmlCharacters: number;
  warningCount: number;
  structuralCount: number;
  truncated: boolean;
  warningsRemoved: number;
}

interface TransformResult {
  clientId: string;
  html: string;
  warnings: CSSWarning[];
}

interface DiffResult {
  clientId: string;
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  fixed: CSSWarning[];
  introduced: CSSWarning[];
  unchanged: CSSWarning[];
}
```

## Testing

```bash
bun test
```

166 tests covering analysis, transformation, dark mode simulation, framework-aware fixes, AI fix generation, token estimation, smart truncation, fixType classification, and accuracy benchmarks against real-world email templates.

## License

MIT
