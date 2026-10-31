<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/wordmark-dark.svg">
  <img src="./docs/wordmark-light.svg" alt="emailens / engine" width="515">
</picture>

**The rendering linter for email**

[![CI](https://github.com/emailens/engine/actions/workflows/ci.yml/badge.svg)](https://github.com/emailens/engine/actions/workflows/ci.yml)
[![npm](https://badgen.net/npm/v/@emailens/engine)](https://www.npmjs.com/package/@emailens/engine)
[![license](https://badgen.net/badge/license/MIT/green)](./LICENSE)
[![tests](https://badgen.net/badge/tests/1684%20passing/brightgreen)]()
[![node](https://badgen.net/badge/node/%3E%3D18/brightgreen)](https://nodejs.org/)
[![MCP](https://badgen.net/badge/MCP/Server/blue)](https://github.com/emailens/mcp)
[![GitHub stars](https://badgen.net/github/stars/emailens/engine)](https://github.com/emailens/engine/stargazers)

[Quick Start](#quick-start) · [What It Catches](#what-it-catches) · [Why Emailens](#why-emailens) · [Supported Clients](#supported-email-clients) · [API Docs](./docs/API.md)

</div>

**Your email looks perfect in Apple Mail. Gmail strips half the CSS. Outlook renders it in Word.**

`@emailens/engine` analyzes HTML, React Email, MJML, and Maizzle against 21 email clients and scores compatibility before your email goes out. It catches the issues in the engine, in the terminal, in CI, and inside AI coding workflows.

If you want the fastest path to trying it locally, start with the CLI:

```bash
npx @emailens/cli lint email.html
```

The CLI is the recommended entry point for open-source usage. The engine is the lower-level library for builders, tools, and custom integrations.

> [emailens.dev](https://emailens.dev) is the hosted SaaS for shared previews, screenshots, visual diffs, and team workflows. The open-source packages are the local developer tooling.

## Quick Start

### Option 1: Try the CLI first

```bash
npx @emailens/cli lint email.html
```

### Option 2: Use the engine as a library

```bash
npm install @emailens/engine
```

```typescript
import { auditEmail } from "@emailens/engine";

const html = `<html><body><div style="display:flex; gap: 12px;">...</div></body></html>`;
const report = auditEmail(html, { framework: "jsx" });

console.log(report.compatibility.scores["outlook-windows"]);
```

The main entry runs in the browser as well as in Node, and a test keeps it that
way. The Node-only parts live in subpaths: `@emailens/engine/compile` (React
Email, MJML and Maizzle compilers) and `@emailens/engine/server` (DNS and
SpamAssassin checks).

## What It Catches

- **CSS compatibility** across 21 clients
- **Spam scoring** and content hygiene signals
- **Accessibility** checks for contrast and semantics
- **Image and link validation**
- **Inbox preview** and client-specific rendering issues
- **Template variable** and overflow problems
- **AI fix generation** for structural issues

Every finding may include source positions, so a result can be pointed at, annotated, or fixed in place.

## Why Emailens?

- **Offline-first**: runs locally with no account required
- **Unified audit**: a single tool checks CSS, spam, accessibility, links, images, and more
- **Framework-aware**: works with raw HTML, React Email, MJML, and Maizzle
- **AI-ready**: structural fixes can be generated with any model provider
- **Programmable**: use it in CI, editors, scripts, or custom tooling

## Supported Email Clients

Each client links to its support page on emailens.dev, built from this package's data. Every feature across all 21 clients: [emailens.dev/email-css](https://emailens.dev/email-css).

| Client | ID |
|---|---|
| [Gmail](https://emailens.dev/email-css/clients/gmail-web) | `gmail-web` |
| [Gmail Android](https://emailens.dev/email-css/clients/gmail-android) | `gmail-android` |
| [Gmail iOS](https://emailens.dev/email-css/clients/gmail-ios) | `gmail-ios` |
| [Outlook 365](https://emailens.dev/email-css/clients/outlook-web) | `outlook-web` |
| [Outlook (New)](https://emailens.dev/email-css/clients/outlook-windows) | `outlook-windows` |
| [Outlook Classic](https://emailens.dev/email-css/clients/outlook-windows-legacy) | `outlook-windows-legacy` |
| [Outlook iOS](https://emailens.dev/email-css/clients/outlook-ios) | `outlook-ios` |
| [Outlook Android](https://emailens.dev/email-css/clients/outlook-android) | `outlook-android` |
| [Outlook for Mac](https://emailens.dev/email-css/clients/outlook-macos) | `outlook-macos` |
| [Apple Mail](https://emailens.dev/email-css/clients/apple-mail-macos) | `apple-mail-macos` |
| [Apple Mail iOS](https://emailens.dev/email-css/clients/apple-mail-ios) | `apple-mail-ios` |
| [Yahoo Mail](https://emailens.dev/email-css/clients/yahoo-mail) | `yahoo-mail` |
| [Yahoo Mail Android](https://emailens.dev/email-css/clients/yahoo-mail-android) | `yahoo-mail-android` |
| [Yahoo Mail iOS](https://emailens.dev/email-css/clients/yahoo-mail-ios) | `yahoo-mail-ios` |
| [Samsung Mail](https://emailens.dev/email-css/clients/samsung-mail) | `samsung-mail` |
| [Thunderbird](https://emailens.dev/email-css/clients/thunderbird) | `thunderbird` |
| [HEY Mail](https://emailens.dev/email-css/clients/hey-mail) | `hey-mail` |
| [Proton Mail](https://emailens.dev/email-css/clients/protonmail) | `protonmail` |
| [AOL Mail](https://emailens.dev/email-css/clients/aol) | `aol` |
| [Fastmail](https://emailens.dev/email-css/clients/fastmail) | `fastmail` |
| [Superhuman](https://emailens.dev/email-css/clients/superhuman) | `superhuman` |

## Ecosystem

| Package | Use it for |
|---|---|
| [@emailens/engine](https://github.com/emailens/engine) | Core library and analysis API |
| [@emailens/cli](https://github.com/emailens/cli) | Lint locally and in CI |
| [@emailens/mcp](https://github.com/emailens/mcp) | AI agent access to email QA |
| [emailens/action](https://github.com/emailens/action) | GitHub Action quality gate |
| [emailens/vscode](https://github.com/emailens/vscode) | VS Code linting and preview |
| [emailens.dev](https://emailens.dev) | Hosted previews and team workflows |

## License

MIT, Copyright 2025 Emailens

---

If this saved you from an Outlook surprise, [a star](https://github.com/emailens/engine) helps other email developers find it.

