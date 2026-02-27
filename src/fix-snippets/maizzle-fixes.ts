import type { CodeFix } from "../types";

/**
 * Maizzle framework-specific code fix snippets.
 * All keys have a ::maizzle suffix in the original FIX_DATABASE.
 */
export const MAIZZLE_FIX_DATABASE: Record<string, CodeFix> = {
  // ── display:flex (Outlook Maizzle) ──────────────────────────────────
  "display:flex::outlook::maizzle": {
    language: "maizzle",
    description: "Replace Tailwind flex classes with HTML table + MSO conditional comments",
    before: `<div class="flex gap-4">
  <div class="flex-1">Column 1</div>
  <div class="flex-1">Column 2</div>
</div>`,
    after: `<!--[if mso]>
<table role="presentation" width="100%" cellpadding="0"
  cellspacing="0" border="0"><tr>
  <td class="w-1/2" valign="top">Column 1</td>
  <td class="w-1/2" valign="top">Column 2</td>
</tr></table>
<![endif]-->
<!--[if !mso]><!-->
<div class="flex gap-4">
  <div class="flex-1">Column 1</div>
  <div class="flex-1">Column 2</div>
</div>
<!--<![endif]-->`,
  },

  // ── @font-face (Maizzle) ────────────────────────────────────────────
  "@font-face::maizzle": {
    language: "maizzle",
    description:
      'Add fonts via the googleFonts key in config.js — Maizzle injects the Google Fonts link tag automatically. Set googleFonts: "Inter:ital,wght@0,400;0,700" in your environment config, then reference the font family in your template.',
    before: `<style>
  @font-face {
    font-family: 'Inter';
    src: url('https://fonts.gstatic.com/...') format('woff2');
  }
</style>`,
    after: `<!-- config.js: googleFonts: "Inter:ital,wght@0,400;0,700" -->
<p class="font-['Inter',Arial,sans-serif]">Hello</p>`,
  },

  // ── <style> (Gmail Maizzle) ─────────────────────────────────────────
  "<style>::gmail::maizzle": {
    language: "maizzle",
    description:
      "Maizzle automatically inlines CSS via juice during build (inlineCSS: true in config.js). Manual <style> blocks bypass juice and will be stripped by Gmail — prefer Tailwind utility classes instead.",
    before: `<style>
  .custom { color: #6d28d9; }
</style>
<div class="custom">Hello</div>`,
    after: `<!-- Prefer Tailwind classes — Maizzle inlines them automatically during build -->
<div class="text-[#6d28d9]">Hello</div>`,
  },

  // ── max-width (Outlook Maizzle) ─────────────────────────────────────
  "max-width::outlook::maizzle": {
    language: "maizzle",
    description: "Wrap max-width containers with MSO conditional table for Outlook",
    before: `<div class="max-w-[600px] mx-auto">
  Content here
</div>`,
    after: `<!--[if mso]>
<table role="presentation" width="600" cellpadding="0"
  cellspacing="0" border="0" align="center"><tr><td>
<![endif]-->
<div class="max-w-[600px] mx-auto">
  Content here
</div>
<!--[if mso]>
</td></tr></table>
<![endif]-->`,
  },

  // ── gap (Maizzle) ──────────────────────────────────────────────────
  "gap::maizzle": {
    language: "maizzle",
    description: "Use padding Tailwind classes on child elements instead of gap",
    before: `<div class="flex gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>`,
    after: `<!-- gap is not supported in Outlook or many email clients.
     Use padding classes on child elements instead. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="pr-4">Item 1</td>
    <td class="pr-4">Item 2</td>
    <td>Item 3</td>
  </tr>
</table>`,
  },
};
