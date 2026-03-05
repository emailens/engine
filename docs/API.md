# API Reference

> [Back to README](../README.md)

## Table of Contents

- [Core](#core)
  - [`auditEmail`](#auditemailhtml-string-options-auditoptions-auditreport)
  - [`createSession`](#createsessionhtml-string-options-createsessionoptions-emailsession)
- [Standalone Analysis](#standalone-analysis)
  - [`analyzeEmail`](#analyzeemailhtml-string-framework-framework-csswarning)
  - [`generateCompatibilityScore`](#generatecompatibilityscorewarnings-recordstring-clientscore)
  - [`warningsForClient`](#warningsforclientwarnings-clientid-csswarning)
  - [`errorWarnings`](#errorwarningswarnings-csswarning)
  - [`structuralWarnings`](#structuralwarningswarnings-csswarning)
- [Spam & Deliverability](#spam--deliverability)
  - [`analyzeSpam`](#analyzespamhtml-string-options-spamanalysisoptions-spamreport)
  - [`checkDeliverability`](#checkdeliverabilitydomain-options-promisedeliverabilityreport)
  - [`checkSpamAssassin`](#checkspamassassininput-options-promisespamassassinresult--null)
- [Content Analysis](#content-analysis)
  - [`validateLinks`](#validatelinkshtml-string-linkreport)
  - [`checkAccessibility`](#checkaccessibilityhtml-string-accessibilityreport)
  - [`analyzeImages`](#analyzeimageshtml-string-imagereport)
  - [`extractInboxPreview`](#extractinboxpreviewhtml-string-inboxpreview)
  - [`checkSize`](#checksizehtml-string-sizereport)
  - [`checkTemplateVariables`](#checktemplatevariableshtml-string-templatereport)
- [Transforms & Dark Mode](#transforms--dark-mode)
  - [`transformForClient`](#transformforclienthtml-clientid-framework-transformresult)
  - [`transformForAllClients`](#transformforallclientshtml-framework-transformresult)
  - [`simulateDarkMode`](#simulatedarkmodehtml-clientid--html-warnings-)
  - [`getCodeFix`](#getcodefixproperty-clientid-framework-codefix--undefined)
  - [`diffResults`](#diffresultsbefore-after-diffresult)
- [Compile Module](#compile-module)
  - [`compile`](#compilesource-format-filepath-promisestring)
  - [`compileReactEmail`](#compilereactemailsource-options-promisestring)
  - [`compileMjml`](#compilemjmlsource-promisestring)
  - [`compileMaizzle`](#compilemaizzlesource-promisestring)
  - [`detectFormat`](#detectformatfilepath-inputformat)
  - [`CompileError`](#compileerror)
- [AI-Powered Fixes](#ai-powered-fixes)
  - [`generateAiFix`](#generateaifixoptions-promiseaifixresult)
  - [`estimateAiFixTokens`](#estimateaifixtokensoptions-promisetokenestimate)
  - [`heuristicTokenCount`](#heuristictokencounttext-number)
- [Performance](#performance)
- [Security Considerations](#security-considerations)
- [Types](#types)

---

## Core

### `auditEmail(html: string, options?: AuditOptions): AuditReport`

**Unified API** — runs all 8 email analysis checks in a single call. Returns compatibility warnings + scores, spam analysis, link validation, accessibility audit, image analysis, inbox preview extraction, size checking, and template variable detection.

Internally parses the HTML once and shares the DOM across all analyzers.

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
// report.inboxPreview            — InboxPreview
// report.size                    — SizeReport
// report.templateVariables       — TemplateReport
```

**`AuditOptions`:**
- `framework?: "jsx" | "mjml" | "maizzle"` — attach framework-specific fix snippets
- `spam?: SpamAnalysisOptions` — options for spam analysis
- `skip?: Array<"spam" | "links" | "accessibility" | "images" | "compatibility" | "inboxPreview" | "size" | "templateVariables">` — skip specific checks

---

### `createSession(html: string, options?: CreateSessionOptions): EmailSession`

**Session API** — pre-parses the HTML once and exposes all analysis methods on the shared DOM. Use this when you need to call multiple analysis functions on the same HTML to avoid redundant parsing.

```typescript
import { createSession } from "@emailens/engine";

const session = createSession(html, { framework: "jsx" });

// All analysis methods share a single DOM parse:
const warnings = session.analyze();
const scores = session.score(warnings);
const spam = session.analyzeSpam();
const links = session.validateLinks();
const a11y = session.checkAccessibility();
const images = session.analyzeImages();
const preview = session.extractInboxPreview();
const size = session.checkSize();
const templates = session.checkTemplateVariables();

// Or run everything at once:
const report = session.audit();

// Transforms and dark mode still work (parse internally per client):
const transforms = session.transformForAllClients();
const darkMode = session.simulateDarkMode("gmail-web");
```

**`CreateSessionOptions`:**
- `framework?: "jsx" | "mjml" | "maizzle"` — framework for fix snippets (applies to all session methods)

**`EmailSession` methods:**

| Method | Shares DOM | Description |
|---|---|---|
| `audit(options?)` | Yes | Run all checks (equivalent to `auditEmail`) |
| `analyze()` | Yes | CSS compatibility warnings |
| `score(warnings)` | — | Generate per-client scores |
| `analyzeSpam(options?)` | Yes | Spam indicator analysis |
| `validateLinks()` | Yes | Link validation |
| `checkAccessibility()` | Yes | Accessibility audit |
| `analyzeImages()` | Yes | Image analysis |
| `extractInboxPreview()` | Yes | Subject line and preheader extraction |
| `checkSize()` | Yes | Gmail clipping size check |
| `checkTemplateVariables()` | Yes | Unresolved template variable detection |
| `checkDeliverability(domain)` | — | DNS deliverability check (async, SPF/DKIM/DMARC/MX/BIMI) |
| `transformForClient(clientId)` | No | Transform for one client |
| `transformForAllClients()` | No | Transform for all 13 clients |
| `simulateDarkMode(clientId)` | No | Dark mode simulation |

**When to use sessions vs standalone functions:**

- **Multiple analysis calls on the same HTML** → use `createSession()` to avoid redundant parsing
- **Single analysis call** → use standalone functions (`auditEmail`, `analyzeEmail`, etc.)
- **Server-side batch processing** → use `createSession()` per email for best throughput

---

## Standalone Analysis

### `analyzeEmail(html: string, framework?: Framework): CSSWarning[]`

Analyzes an HTML email and returns CSS compatibility warnings for all 13 email clients. Detects `<style>`, `<link>`, `<svg>`, `<video>`, `<form>`, inline CSS properties, `@font-face`, `@media` queries, gradients, flexbox/grid, and more.

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

## Spam & Deliverability

### `analyzeSpam(html: string, options?: SpamAnalysisOptions): SpamReport`

Analyzes an HTML email for spam scoring issues. Returns a 0–100 score (100 = clean) and an array of issues. Uses heuristic rules modeled after SpamAssassin, CAN-SPAM, and GDPR.

> **Note:** Spam scoring heuristics — not a real spam filter. This checks for common anti-patterns that trigger spam filters but cannot predict actual inbox placement. For real spam testing, use the `checkSpamAssassin()` integration or a dedicated service.

```typescript
import { analyzeSpam } from "@emailens/engine";

const report = analyzeSpam(html, {
  emailType: "transactional",       // skip unsubscribe check
  listUnsubscribeHeader: "...",     // satisfies unsubscribe requirement
});
// { score: 95, level: "low", issues: [...] }
```

**Checks:** caps ratio, excessive punctuation, spam trigger phrases, missing unsubscribe link (with transactional email exemption), hidden text, URL shorteners, image-to-text ratio, deceptive links (with ESP tracking domain allowlist), all-caps subject.

### `checkDeliverability(domain, options?): Promise<DeliverabilityReport>`

Validates email deliverability for a domain by checking MX, SPF, DKIM, DMARC, and BIMI DNS records. All DNS queries have a 5-second timeout. No external dependencies — uses `node:dns/promises`.

```typescript
import { checkDeliverability } from "@emailens/engine";

const report = await checkDeliverability("example.com");
console.log(report.score);   // 0-100
console.log(report.checks);  // individual check results
console.log(report.issues);  // actionable issues
```

**Checks:**
- **MX** — domain can receive email
- **SPF** — authorized senders (`v=spf1`), flags dangerous `+all`
- **DKIM** — probes 15 common selectors (`google`, `selector1`, `default`, `dkim`, etc.)
- **DMARC** — policy enforcement (`v=DMARC1`), warns on `p=none`
- **BIMI** — brand indicator (optional, nice-to-have)

Also available as a session method: `session.checkDeliverability("example.com")`.

> **Note:** This is standalone async — not wired into the synchronous `auditEmail()` pipeline.

### `checkSpamAssassin(input, options?): Promise<SpamAssassinResult | null>`

Opt-in integration with a local SpamAssassin installation. Shells out to `spamc` (daemon) or `spamassassin` (standalone) via `execFile`. Returns `null` if SpamAssassin is not installed.

```typescript
import { checkSpamAssassin } from "@emailens/engine";

const result = await checkSpamAssassin(rawRfc2822Message);
if (result) {
  console.log(result.score);      // e.g. 3.2
  console.log(result.isSpam);     // true if score >= threshold
  console.log(result.rules);      // matched SpamAssassin rules
}
```

> **Note:** Requires a full RFC 2822 message (headers + body), not just HTML.

---

## Content Analysis

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

### `extractInboxPreview(html: string): InboxPreview`

Extracts subject line (from `<title>`) and preheader text from the email HTML. Returns per-client truncation data showing how subject and preheader will appear across 8 email clients.

```typescript
import { extractInboxPreview } from "@emailens/engine";

const preview = extractInboxPreview(html);
// { subject: "Newsletter", preheader: "This week's highlights...",
//   subjectLength: 10, preheaderLength: 28,
//   truncation: [...], issues: [...] }
```

**Checks:** missing `<title>`, subject too long, missing preheader, preheader too short/long, `&zwnj;&nbsp;` padding hack, emoji in subject.

### `checkSize(html: string): SizeReport`

Checks email HTML byte size for Gmail clipping issues. Gmail clips messages larger than ~102KB, hiding content behind a "View entire message" link.

```typescript
import { checkSize } from "@emailens/engine";

const report = checkSize(html);
// { htmlBytes: 45230, humanSize: "44.2 KB", clipped: false, issues: [] }
```

**Checks:** Gmail clipping threshold (102KB), approaching clip threshold warning (90KB).

### `checkTemplateVariables(html: string): TemplateReport`

Scans email HTML for unresolved template/merge variables in text content and key attributes (`href`, `src`, `alt`).

```typescript
import { checkTemplateVariables } from "@emailens/engine";

const report = checkTemplateVariables(html);
// { unresolvedCount: 0, issues: [] }
```

**Detects:** `{{var}}` (Handlebars/Mustache), `${var}` (ES template literals), `<%= %>` (ERB/EJS), `*|TAG|*` (Mailchimp), `%%tag%%` (Salesforce), `{merge_field}` (single-brace).

---

## Transforms & Dark Mode

### `transformForClient(html, clientId, framework?): TransformResult`

Transforms HTML for a specific email client — strips unsupported CSS, inlines `<style>` blocks (for Gmail), removes unsupported elements.

### `transformForAllClients(html, framework?): TransformResult[]`

Transforms HTML for all 13 email clients at once.

### `simulateDarkMode(html, clientId): { html, warnings }`

Simulates how an email client applies dark mode using luminance-based color detection.

- **Full inversion** (Gmail Android, Samsung Mail): inverts all light backgrounds and dark text
- **Partial inversion** (Gmail Web, Apple Mail, Yahoo, Outlook.com, HEY, Superhuman): only inverts very light/dark colors
- **No dark mode** (Thunderbird)
- **Full inversion** also applies to Outlook Classic (Word engine, EOL Oct 2026)

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

## Performance

### Shared DOM parsing

The engine internally parses HTML using [Cheerio](https://cheerio.js.org/). For a typical 50–100KB email, each `cheerio.load()` call takes 5–15ms. Without optimization, calling multiple analysis functions on the same HTML would parse it repeatedly.

**`auditEmail()`** parses the HTML once and shares the DOM across all 8 analyzers (compatibility, spam, links, accessibility, images, inbox preview, size, template variables). Previously each analyzer parsed independently — this eliminates ~80% of parsing overhead in the audit path.

**`createSession()`** extends this optimization to any combination of calls. When you need to call `analyzeEmail()` + `analyzeSpam()` + `validateLinks()` + other checks on the same HTML, a session shares a single parse across all of them.

### Typical performance characteristics

| Operation | Complexity | Notes |
|---|---|---|
| `auditEmail()` | 1 parse + 8 analyses | Shared DOM, most efficient for full reports |
| `createSession()` | 1 parse upfront | Amortized across all subsequent analysis calls |
| `analyzeEmail()` | 1 parse + CSS property scan | Scans `<style>` blocks + inline styles × 13 clients |
| `transformForAllClients()` | 12 parses (1 per client) | Each client mutates its own DOM copy |
| `simulateDarkMode()` | 1 parse per call | Mutates DOM for color inversion |

### Optimization tips for consumers

```typescript
// Instead of this (6 separate HTML parses):
const warnings = analyzeEmail(html, "jsx");
const scores = generateCompatibilityScore(warnings);
const spam = analyzeSpam(html);
const links = validateLinks(html);
const a11y = checkAccessibility(html);
const images = analyzeImages(html);

// Do this (1 HTML parse):
const report = auditEmail(html, { framework: "jsx" });

// Or for selective analysis (1 HTML parse):
const session = createSession(html, { framework: "jsx" });
const warnings = session.analyze();
const scores = session.score(warnings);
const spam = session.analyzeSpam();
// ... pick only what you need
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
  inboxPreview: InboxPreview;
  size: SizeReport;
  templateVariables: TemplateReport;
}

interface EmailSession {
  readonly html: string;
  readonly framework: Framework | undefined;
  audit(options?): AuditReport;
  analyze(): CSSWarning[];
  score(warnings): Record<string, ClientScore>;
  analyzeSpam(options?): SpamReport;
  validateLinks(): LinkReport;
  checkAccessibility(): AccessibilityReport;
  analyzeImages(): ImageReport;
  extractInboxPreview(): InboxPreview;
  checkSize(): SizeReport;
  checkTemplateVariables(): TemplateReport;
  transformForClient(clientId): TransformResult;
  transformForAllClients(): TransformResult[];
  simulateDarkMode(clientId): { html; warnings };
}

interface InboxPreview {
  subject: string | null;
  preheader: string | null;
  subjectLength: number;
  preheaderLength: number;
  truncation: ClientTruncation[];
  issues: InboxPreviewIssue[];
}

interface SizeReport {
  htmlBytes: number;
  humanSize: string;
  clipped: boolean;
  issues: SizeIssue[];
}

interface TemplateReport {
  unresolvedCount: number;
  issues: TemplateIssue[];
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

interface DeliverabilityReport {
  domain: string;
  checks: DeliverabilityCheck[];
  score: number;       // 0-100
  issues: DeliverabilityIssue[];
}

interface DeliverabilityCheck {
  name: "spf" | "dkim" | "dmarc" | "mx" | "bimi";
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  detail?: string;
  record?: string;
}

interface SpamAssassinResult {
  score: number;
  threshold: number;
  isSpam: boolean;
  rules: Array<{ name: string; score: number; description: string }>;
  rawOutput: string;
}
```
