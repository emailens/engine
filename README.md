<div align="center">

# @emailens/engine

**The rendering linter for email**

[![npm](https://img.shields.io/npm/v/@emailens/engine)](https://www.npmjs.com/package/@emailens/engine)
[![license](https://img.shields.io/npm/l/@emailens/engine)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-653%20passing-brightgreen)]()
[![node](https://img.shields.io/node/v/@emailens/engine)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://github.com/emailens/mcp)
[![GitHub stars](https://img.shields.io/github/stars/emailens/engine?style=flat)](https://github.com/emailens/engine/stargazers)

[Quick Start](#quick-start) · [What It Catches](#what-it-catches) · [Why Emailens](#why-emailens) · [Supported Clients](#supported-email-clients) · [API Docs](./docs/API.md) · [The State of Email CSS](https://emailens.dev/email-css/report)

</div>

**Your email looks perfect in Apple Mail. Gmail strips half the CSS. Outlook renders it in Word.**

`@emailens/engine` analyzes your HTML against 250+ CSS properties across 15 email clients, scores compatibility, and shows you exactly what to fix — before you hit send.

Our data says you need this: across the 251 CSS and HTML features we track, **only 6 are fully supported in every major email client**. See [The State of Email CSS](https://emailens.dev/email-css/report).

![emailens lint output showing errors and warnings across email clients](./docs/lint-demo.png)

> **[emailens.dev](https://emailens.dev)** — Try the hosted version. Paste HTML, get a full audit in seconds.

## Quick Start

No install, no project setup, lint any email right now:

```bash
npx @emailens/cli lint email.html
```

Or use the engine as a library:

```bash
npm install @emailens/engine
```

```typescript
import { auditEmail } from "@emailens/engine";

// Flexbox + gap + box-shadow — all Outlook killers
const html = `<html lang="en">
<head><title>Weekly Update</title>
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
</html>`;

const report = auditEmail(html, { framework: "jsx" });

console.log(report.compatibility.scores["outlook-windows"]);
// { score: 30, errors: 3, warnings: 3, info: 1 }
//  ↑ Outlook uses Word — flexbox, gap, box-shadow, border-radius all break

console.log(report.compatibility.scores["gmail-web"]);
// { score: 75, errors: 0, warnings: 5, info: 0 }

console.log(report.spam.score);        // 100 (clean)
console.log(report.accessibility.score); // 88
console.log(report.size.clipped);       // false (under Gmail's 102KB limit)
```

## Score too low? Fix it

Score too low? Fix it automatically:

```typescript
import { generateAiFix, AI_FIX_SYSTEM_PROMPT } from "@emailens/engine";

const { code } = await generateAiFix({
  originalHtml: html,
  warnings: report.compatibility.warnings,
  scores: report.compatibility.scores,
  scope: "outlook-windows",
  format: "jsx",
  provider: async (prompt) => {
    // Any LLM — Claude, GPT, etc.
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: AI_FIX_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text : "";
  },
});
// code → JSX with <Table> layout, VML roundrects, inline fallbacks
```

## What It Catches

8 analysis engines, one `auditEmail()` call.

- **CSS compatibility** — 250+ properties tested across 15 email clients, with fix snippets and AI-powered auto-fix
- **Spam scoring** — 45+ signals modeled after SpamAssassin, CAN-SPAM, and GDPR
- **Accessibility** — WCAG contrast ratios, alt text, semantic structure, heading hierarchy
- **Link validation** — broken hrefs, insecure HTTP, `javascript:` protocols, deceptive URLs
- **Image analysis** — missing dimensions, oversized data URIs, tracking pixels, WebP/SVG format
- **Inbox preview** — subject/preheader truncation per client, Gmail clipping detection
- **Domain authentication** — SPF, DKIM, DMARC, MX, and BIMI DNS record validation
- **Template variables** — unresolved merge tags across 6 template systems (Handlebars, ERB, Mailchimp, etc.)

## Installation

```bash
npm install @emailens/engine
```

Three entry points:

| Import | Description |
|---|---|
| `@emailens/engine` | Core analysis — CSS, spam, a11y, links, images, inbox preview, size, templates, AI fix |
| `@emailens/engine/compile` | JSX / MJML / Maizzle → HTML compilers |
| `@emailens/engine/server` | Node-only: DNS deliverability checks, SpamAssassin integration |

## Why Emailens?

- **Offline-first** — runs entirely locally, no network calls required (except DNS deliverability checks)
- **Unified audit** — one function call returns CSS compatibility, spam, accessibility, links, images, inbox preview, size, and template checks
- **Framework-aware** — fix snippets tailored to React Email (JSX), MJML, and Maizzle
- **AI-ready** — structural issues get LLM-powered auto-fix with any provider (Claude, GPT, etc.)
- **Programmable** — TypeScript API, not a GUI — integrate into CI, editors, or build pipelines

| | @emailens/engine | Litmus | Email on Acid | caniemail.com |
|---|---|---|---|---|
| Local/offline | Yes | No | No | Data only |
| Programmatic API | Yes | Limited | No | No |
| CSS + Spam + A11y | Yes | Separate tools | Separate tools | CSS only |
| AI auto-fix | Yes | No | No | No |
| Open source | MIT | No | No | Yes (data) |

### vs other email libraries

`@emailens/engine` sits in the **QA / lint / scoring** slot — it analyzes finished HTML. It's complementary to (not a replacement for) composition and inlining libraries.

| | @emailens/engine | [juice](https://github.com/automattic/juice) | [email-comb](https://github.com/codsen/email-comb) | [mjml](https://mjml.io/) | [maizzle](https://maizzle.com/) |
|---|---|---|---|---|---|
| Purpose | QA / lint / score | CSS inliner | Unused CSS pruner | MJML → HTML | Tailwind → HTML |
| Per-client compatibility scoring | Yes | No | No | No | No |
| Spam / a11y / link / image analysis | Yes | No | No | No | No |
| AI-powered fix generation | Yes | No | No | No | No |
| Compose emails | Reads only | Reads only | Reads only | Yes | Yes |
| CSS inlining | No (pair with juice) | Yes | No | Yes (built-in) | Yes (built-in) |

A typical pipeline: write in **mjml** or **maizzle** → inline with **juice** → audit with **@emailens/engine** → ship.

## Supported Email Clients

| Client | ID | Category | Engine | Dark Mode |
|---|---|---|---|---|
| Gmail | `gmail-web` | Webmail | Gmail Web | Yes |
| Gmail Android | `gmail-android` | Mobile | Gmail Mobile | Yes |
| Gmail iOS | `gmail-ios` | Mobile | Gmail Mobile | Yes |
| Outlook 365 | `outlook-web` | Webmail | Outlook Web | Yes |
| Outlook (New) | `outlook-windows` | Desktop | Outlook Web | Yes |
| Outlook Classic | `outlook-windows-legacy` | Desktop | Microsoft Word | Yes |
| Outlook iOS | `outlook-ios` | Mobile | Outlook Mobile | Yes |
| Outlook Android | `outlook-android` | Mobile | Outlook Mobile | Yes |
| Apple Mail | `apple-mail-macos` | Desktop | WebKit | Yes |
| Apple Mail iOS | `apple-mail-ios` | Mobile | WebKit | Yes |
| Yahoo Mail | `yahoo-mail` | Webmail | Yahoo | Yes |
| Samsung Mail | `samsung-mail` | Mobile | Samsung | Yes |
| Thunderbird | `thunderbird` | Desktop | Gecko | No |
| HEY Mail | `hey-mail` | Webmail | WebKit | Yes |
| Superhuman | `superhuman` | Desktop | Blink | Yes |

## API Documentation

Full API reference: **[docs/API.md](./docs/API.md)**

Covers:
- `auditEmail` and `createSession` — core analysis
- Standalone analyzers (CSS, spam, links, accessibility, images, inbox preview, size, templates)
- DNS deliverability and SpamAssassin integration
- Client transforms and dark mode simulation
- Compile module (JSX, MJML, Maizzle)
- AI-powered fixes and token estimation
- Performance optimization guide
- Security considerations
- Full TypeScript type definitions

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full picture (shipped items + items under consideration with rationale).

**Shipped:** automated caniemail.com data sync · GitHub Actions integration via `@emailens/cli` and the [Marketplace Action](https://github.com/marketplace/actions/emailens-email-preview-check) · AI-powered fix generation · compile module for JSX/MJML/Maizzle.

**Considering:** Outlook VML auto-generation · plugin system for custom analyzers · MJML/Maizzle source-level linting · ESLint plugin · spam corpus tuning · dark-mode accuracy tests.

Concrete bugs go in [Issues](https://github.com/emailens/engine/issues). Open-ended ideas live in the roadmap.

## Contributing

Contributions are welcome! See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for architecture overview, setup instructions, and PR guidelines.

```bash
bun install && bun test   # 653 tests
```

### Data Maintenance

CSS support data is auto-synced from [caniemail.com](https://www.caniemail.com/). Other data (dark mode behavior, display limits, Superhuman overrides) is manually curated and tracked with verification dates.

```bash
bun run sync:caniemail    # Refresh CSS support matrix from caniemail.com
bun run check:freshness   # Flag stale data sources (exits 1 if any overdue)
```

See [CONTRIBUTING.md](./CONTRIBUTING.md#data-sources-and-freshness) for full details on data sources and verification procedures.

## License

MIT — Copyright 2025 [Emailens](https://emailens.dev)

---

If this saved you from an Outlook surprise, [a star](https://github.com/emailens/engine) helps other email developers find it.
