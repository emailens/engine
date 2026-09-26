import type { CodeFix } from "../types";

/**
 * Maizzle framework-specific code fix snippets.
 * All keys have a ::maizzle suffix in the original FIX_DATABASE.
 */
export const MAIZZLE_FIX_DATABASE: Record<string, CodeFix> = {
  // ── display:flex (Outlook Maizzle) ──────────────────────────────────
  "display:flex::outlook::maizzle": {
    language: "maizzle",
    description: "v5: an HTML table inside MSO comments. v6: <Outlook> and <NotOutlook>, because Vue drops HTML comments when NODE_ENV is production.",
    before: `<div class="flex gap-4">
  <div class="flex-1">Column 1</div>
  <div class="flex-1">Column 2</div>
</div>`,
    after: `<!--[if mso]>
<table role="presentation" width="100%" cellpadding="0"
  cellspacing="0" border="0"><tr>
  <td width="50%" valign="top">Column 1</td>
  <td width="50%" valign="top">Column 2</td>
</tr></table>
<![endif]-->
<!--[if !mso]><! -->
<div class="flex gap-4">
  <div class="flex-1">Column 1</div>
  <div class="flex-1">Column 2</div>
</div>
<!-- <![endif]-->

<!-- v6 -->
<Outlook>
  <table role="presentation" width="100%" cellpadding="0"
    cellspacing="0" border="0"><tr>
    <td width="50%" valign="top">Column 1</td>
    <td width="50%" valign="top">Column 2</td>
  </tr></table>
</Outlook>
<NotOutlook>
  <div class="flex gap-4">
    <div class="flex-1">Column 1</div>
    <div class="flex-1">Column 2</div>
  </div>
</NotOutlook>`,
  },

  // ── @font-face (Maizzle) ────────────────────────────────────────────
  "@font-face::maizzle": {
    language: "maizzle",
    description:
      "v5: put the stylesheet link in the layout head. v6: put a <Font> component in the Vue file. @maizzle/framework 5 does not read a googleFonts config key.",
    before: `<style>
  @font-face {
    font-family: 'Inter';
    src: url('https://fonts.gstatic.com/...') format('woff2');
  }
</style>`,
    after: `<!-- v5, in the layout <head> -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700&display=swap">
<p style="font-family: Inter, Arial, sans-serif;">Hello</p>

<!-- v6, in the .vue file -->
<Font family="Inter" :weights="[400, 700]" />
<p class="font-inter">Hello</p>`,
  },

  // ── <style> (Gmail Maizzle) ─────────────────────────────────────────
  "<style>::gmail::maizzle": {
    language: "maizzle",
    description:
      "Prefer Tailwind classes. v5 inlines them when css.inline is set in config.js. v6 inlines them with the css.inline transformer, on by default. A hand-written <style> is still stripped by Gmail.",
    before: `<style>
  .custom { color: #6d28d9; }
</style>
<div class="custom">Hello</div>`,
    after: `<!-- Prefer Tailwind classes; Maizzle inlines them automatically during build -->
<div class="text-[#6d28d9]">Hello</div>`,
  },

  // ── max-width (Outlook Maizzle) ─────────────────────────────────────
  "max-width::outlook::maizzle": {
    language: "maizzle",
    description: "v5: an MSO table around the container. v6: <Outlook open close>, because Vue drops HTML comments when NODE_ENV is production.",
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
<![endif]-->

<!-- v6 -->
<Outlook
  open='<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>'
  close="</td></tr></table>"
>
  <div class="max-w-[600px] mx-auto">Content here</div>
</Outlook>`,
  },

  // ── gap (Maizzle) ──────────────────────────────────────────────────
  "gap::maizzle": {
    language: "maizzle",
    description: "Use padding classes on the children instead of gap. Same markup in a v5 HTML file and inside a v6 <template>.",
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
