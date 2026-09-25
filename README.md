<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/wordmark-dark.svg">
  <img src="./docs/wordmark-light.svg" alt="emailens / engine" width="515">
</picture>

**The rendering linter for email**

[![CI](https://github.com/emailens/engine/actions/workflows/ci.yml/badge.svg)](https://github.com/emailens/engine/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@emailens/engine)](https://www.npmjs.com/package/@emailens/engine)
[![license](https://img.shields.io/npm/l/@emailens/engine)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-1288%20passing-brightgreen)]()
[![node](https://img.shields.io/node/v/@emailens/engine)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://github.com/emailens/mcp)
[![GitHub stars](https://img.shields.io/github/stars/emailens/engine?style=flat)](https://github.com/emailens/engine/stargazers)

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

| Client | ID |
|---|---|
| Gmail | `gmail-web` |
| Gmail Android | `gmail-android` |
| Gmail iOS | `gmail-ios` |
| Outlook 365 | `outlook-web` |
| Outlook (New) | `outlook-windows` |
| Outlook Classic | `outlook-windows-legacy` |
| Outlook iOS | `outlook-ios` |
| Outlook Android | `outlook-android` |
| Outlook for Mac | `outlook-macos` |
| Apple Mail | `apple-mail-macos` |
| Apple Mail iOS | `apple-mail-ios` |
| Yahoo Mail | `yahoo-mail` |
| Yahoo Mail Android | `yahoo-mail-android` |
| Yahoo Mail iOS | `yahoo-mail-ios` |
| Samsung Mail | `samsung-mail` |
| Thunderbird | `thunderbird` |
| HEY Mail | `hey-mail` |
| Proton Mail | `protonmail` |
| AOL Mail | `aol` |
| Fastmail | `fastmail` |
| Superhuman | `superhuman` |

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

