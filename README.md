# @emailens/engine

Email compatibility engine that transforms CSS per email client, analyzes compatibility, scores results, simulates dark mode, provides framework-aware fix snippets, and runs spam, accessibility, link, and image quality analysis.

Supports **12 email clients**: Gmail (Web, Android, iOS), Outlook (365, Windows), Apple Mail (macOS, iOS), Yahoo Mail, Samsung Mail, Thunderbird, HEY Mail, and Superhuman.

## Install

```bash
npm install @emailens/engine
# or
bun add @emailens/engine
```

Requires Node.js >= 18.

## Quick Start

```typescript
import { auditEmail } from "@emailens/engine";

const html = `<html lang="en">
<head><title>Newsletter</title>
  <style>.card { border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }</style>
</head>
<body>
  <div class="card" style="display: flex; gap: 16px;">
    <div>Column A</div>
    <div>Column B</div>
  </div>
  <a href="https://example.com/unsubscribe">Unsubscribe</a>
</body>
</html>`;

// Run all checks in one call
const report = auditEmail(html, { framework: "jsx" });

console.log(report.compatibility.scores["gmail-web"]);
// { score: 75, errors: 0, warnings: 5, info: 0 }

console.log(report.spam);
// { score: 100, level: "low", issues: [] }

console.log(report.accessibility.score);
// 88

console.log(report.links.totalLinks);
// 1

console.log(report.images.total);
// 0
```

## API Reference

### `auditEmail(html: string, options?: AuditOptions): AuditReport`

**Unified API** — runs all email analysis checks in a single call. Returns compatibility warnings + scores, spam analysis, link validation, accessibility audit, and image analysis.

```typescript
import { auditEmail } from "@emailens/engine";

const report = auditEmail(html, {
  framework: "jsx",         // attach framework-specific fix snippets
  spam: { emailType: "transactional" },  // skip unsubscribe check
  skip: ["images"],         // skip specific checks
});

// report.compatibility.warnings  — CSSWarning[]
// report.compatibility.scores    — Record<string, ClientScore>
// report.spam                    — SpamReport
// report.links                   — LinkReport
// report.accessibility           — AccessibilityReport
// report.images                  — ImageReport
```

**`AuditOptions`:**
- `framework?: "jsx" | "mjml" | "maizzle"` — attach framework-specific fix snippets
- `spam?: SpamAnalysisOptions` — options for spam analysis
- `skip?: Array<"spam" | "links" | "accessibility" | "images" | "compatibility">` — skip specific checks

---

### `analyzeEmail(html: string, framework?: Framework): CSSWarning[]`

Analyzes an HTML email and returns CSS compatibility warnings for all 12 email clients. Detects `<style>`, `<link>`, `<svg>`, `<video>`, `<form>`, inline CSS properties, `@font-face`, `@media` queries, gradients, flexbox/grid, and more.

The optional `framework` parameter controls which fix snippets are attached to warnings. Analysis always runs on compiled HTML.

```typescript
const warnings = analyzeEmail(html);          // Plain HTML
const warnings = analyzeEmail(html, "jsx");   // React Email fixes
const warnings = analyzeEmail(html, "mjml");  // MJML fixes
```

### `generateCompatibilityScore(warnings): Record<string, ClientScore>`

Generates a 0–100 compatibility score per email client. Formula: `100 - (errors × 15) - (warnings × 5) - (info × 1)`.

### `warningsForClient(warnings, clientId): CSSWarning[]`

Filter warnings for a specific client.

### `errorWarnings(warnings): CSSWarning[]`

Get only error-severity warnings.

### `structuralWarnings(warnings): CSSWarning[]`

Get only warnings that require HTML restructuring (`fixType: "structural"`).

---

### `analyzeSpam(html: string, options?: SpamAnalysisOptions): SpamReport`

Analyzes an HTML email for spam indicators. Returns a 0–100 score (100 = clean) and an array of issues. Uses heuristic rules modeled after SpamAssassin, CAN-SPAM, and GDPR.

```typescript
import { analyzeSpam } from "@emailens/engine";

const report = analyzeSpam(html, {
  emailType: "transactional",       // skip unsubscribe check
  listUnsubscribeHeader: "...",     // satisfies unsubscribe requirement
});
// { score: 95, level: "low", issues: [...] }
```

**Checks:** caps ratio, excessive punctuation, spam trigger phrases, missing unsubscribe link (with transactional email exemption), hidden text, URL shorteners, image-to-text ratio, deceptive links (with ESP tracking domain allowlist), all-caps subject.

### `validateLinks(html: string): LinkReport`

Static analysis of all links in an HTML email. No network requests.

```typescript
import { validateLinks } from "@emailens/engine";

const report = validateLinks(html);
// { totalLinks: 12, issues: [...], breakdown: { https: 10, http: 1, mailto: 1, ... } }
```

**Checks:** empty/placeholder hrefs, `javascript:` protocol, insecure HTTP, generic link text, missing accessible names, empty mailto/tel, very long URLs, duplicate links.

### `checkAccessibility(html: string): AccessibilityReport`

Audits an HTML email for accessibility issues. Returns a 0–100 score and detailed issues.

```typescript
import { checkAccessibility } from "@emailens/engine";

const report = checkAccessibility(html);
// { score: 88, issues: [...] }
```

**Checks:** missing `lang` attribute, missing `<title>`, image alt text, link accessibility, layout table roles, small text, color contrast (WCAG 2.1), heading hierarchy.

### `analyzeImages(html: string): ImageReport`

Analyzes images for email best practices.

```typescript
import { analyzeImages } from "@emailens/engine";

const report = analyzeImages(html);
// { total: 5, totalDataUriBytes: 0, issues: [...], images: [...] }
```

**Checks:** missing dimensions, oversized data URIs, missing alt, WebP/SVG format, missing `display:block`, tracking pixels, high image count.

---

### `transformForClient(html, clientId, framework?): TransformResult`

Transforms HTML for a specific email client — strips unsupported CSS, inlines `<style>` blocks (for Gmail), removes unsupported elements.

### `transformForAllClients(html, framework?): TransformResult[]`

Transforms HTML for all 12 email clients at once.

### `simulateDarkMode(html, clientId): { html, warnings }`

Simulates how an email client applies dark mode using luminance-based color detection.

- **Full inversion** (Gmail Android, Samsung Mail): inverts all light backgrounds and dark text
- **Partial inversion** (Gmail Web, Apple Mail, Yahoo, Outlook.com, HEY, Superhuman): only inverts very light/dark colors
- **No dark mode** (Outlook Windows, Thunderbird)

### `getCodeFix(property, clientId, framework?): CodeFix | undefined`

Returns a paste-ready code fix for a CSS property + client combination. Fixes are tiered:

1. **Framework + client specific** (e.g., `border-radius` + Outlook + JSX → VML component)
2. **Framework specific** (e.g., `@font-face` + MJML → `<mj-font>`)
3. **Client specific** (e.g., `border-radius` + Outlook → VML roundrect)
4. **Generic HTML fallback**

### `diffResults(before, after): DiffResult[]`

Compares two sets of analysis results to show what improved, regressed, or stayed the same.

---

## Compile Module

Compile email templates from JSX, MJML, or Maizzle to HTML.

```typescript
import { compile, detectFormat, CompileError } from "@emailens/engine/compile";

// Auto-detect format and compile
const format = detectFormat("email.tsx");  // "jsx"
const html = await compile(source, format);

// Or use specific compilers
import { compileReactEmail, compileMjml, compileMaizzle } from "@emailens/engine/compile";
```

### `compile(source, format, filePath?): Promise<string>`

Compile source to HTML based on format. Lazily imports per-format compilers.

### `compileReactEmail(source, options?): Promise<string>`

Compile React Email JSX/TSX to HTML. Pipeline: validate → transpile (sucrase) → sandbox execute → render.

```typescript
import { compileReactEmail } from "@emailens/engine/compile";

const html = await compileReactEmail(jsxSource, {
  sandbox: "isolated-vm",  // "vm" | "isolated-vm" | "quickjs"
});
```

**Sandbox strategies:**
- `"isolated-vm"` (default) — Separate V8 isolate. True heap isolation. Requires `isolated-vm` native addon.
- `"vm"` — `node:vm` with hardened globals. Fast, zero-dependency, but NOT a true security boundary. Suitable for CLI/local use.
- `"quickjs"` — Validates code in WASM sandbox, then executes in `node:vm`. Security is equivalent to `"vm"`. No native addons needed.

**Peer dependencies:** `sucrase`, `react`, `@react-email/components`, `@react-email/render`. Plus `isolated-vm` or `quickjs-emscripten` depending on sandbox strategy.

### `compileMjml(source): Promise<string>`

Compile MJML to HTML. **Peer dependency:** `mjml`.

### `compileMaizzle(source): Promise<string>`

Compile Maizzle template to HTML. **Peer dependency:** `@maizzle/framework`.

**Security:** PostHTML file-system directives (`<extends>`, `<component>`, `<fetch>`, `<include>`, `<module>`, `<slot>`, `<fill>`, `<raw>`, `<block>`, `<yield>`) are rejected at validation time to prevent server-side file reads.

### `detectFormat(filePath): InputFormat`

Auto-detect input format from file extension (`.tsx`/`.jsx` → `"jsx"`, `.mjml` → `"mjml"`, `.html` → `"html"`).

### `CompileError`

Unified error class for all compilation failures. Available from both `@emailens/engine` and `@emailens/engine/compile`.

```typescript
import { CompileError } from "@emailens/engine";

try {
  await compile(source, "jsx");
} catch (err) {
  if (err instanceof CompileError) {
    console.log(err.format);  // "jsx" | "mjml" | "maizzle"
    console.log(err.phase);   // "validation" | "transpile" | "execution" | "render" | "compile"
  }
}
```

---

## Security Considerations

### Input Size Limits

All public functions enforce a 2MB (`MAX_HTML_SIZE`) input limit. Inputs exceeding this limit throw immediately. The limit is exported so consumers can check before calling:

```typescript
import { MAX_HTML_SIZE } from "@emailens/engine";
if (html.length > MAX_HTML_SIZE) {
  // handle oversized input
}
```

### Compile Module Security

- **React Email JSX**: User code runs in a sandboxed environment. The `"isolated-vm"` strategy provides true heap isolation. The `"vm"` and `"quickjs"` strategies use `node:vm` which is NOT a security boundary — suitable for CLI use where users run their own code. For server deployments accepting untrusted input, use `"isolated-vm"`.
- **Maizzle**: PostHTML directives that access the filesystem (`<extends>`, `<fetch>`, `<include>`, `<raw>`, `<block>`, `<yield>`, etc.) are rejected at validation time.
- **MJML**: Compiled through the `mjml` package with default settings.

---

## AI-Powered Fixes

The engine classifies every warning as either `css` (CSS-only swap) or `structural` (requires HTML restructuring). For structural issues, the engine can generate a prompt and delegate to an LLM.

### `generateAiFix(options): Promise<AiFixResult>`

```typescript
import { generateAiFix, AI_FIX_SYSTEM_PROMPT } from "@emailens/engine";

const result = await generateAiFix({
  originalHtml: html,
  warnings,
  scores,
  scope: "all",
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
```

### `estimateAiFixTokens(options): Promise<TokenEstimate>`

Estimate tokens before making an API call.

### `heuristicTokenCount(text): number`

Instant synchronous token estimate (~3.5 chars/token).

---

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

## Types

```typescript
type SupportLevel = "supported" | "partial" | "unsupported" | "unknown";
type Framework = "jsx" | "mjml" | "maizzle";
type InputFormat = "html" | Framework;
type FixType = "css" | "structural";

interface CSSWarning {
  severity: "error" | "warning" | "info";
  client: string;
  property: string;
  message: string;
  suggestion?: string;
  fix?: CodeFix;
  fixType?: FixType;
  line?: number;       // line number in <style> block
  selector?: string;   // element selector for inline styles
}

interface AuditReport {
  compatibility: {
    warnings: CSSWarning[];
    scores: Record<string, { score: number; errors: number; warnings: number; info: number }>;
  };
  spam: SpamReport;
  links: LinkReport;
  accessibility: AccessibilityReport;
  images: ImageReport;
}

interface SpamReport {
  score: number;       // 0–100 (100 = clean)
  level: "low" | "medium" | "high";
  issues: SpamIssue[];
}

interface LinkReport {
  totalLinks: number;
  issues: LinkIssue[];
  breakdown: { https: number; http: number; mailto: number; tel: number; ... };
}

interface AccessibilityReport {
  score: number;       // 0–100
  issues: AccessibilityIssue[];
}

interface ImageReport {
  total: number;
  totalDataUriBytes: number;
  issues: ImageIssue[];
  images: ImageInfo[];
}
```

## Testing

```bash
bun test
```

449 tests covering analysis, transformation, dark mode simulation, framework-aware fixes, AI fix generation, token estimation, spam scoring, link validation, accessibility checking, image analysis, security hardening, integration pipelines, and accuracy benchmarks.

## License

MIT
