import type { CodeFix } from "../types";

/**
 * MJML framework-specific code fix snippets.
 * All keys have a ::mjml suffix in the original FIX_DATABASE.
 */
export const MJML_FIX_DATABASE: Record<string, CodeFix> = {
  // ── word-break (MJML) ────────────────────────────────────────────────
  "word-break::mjml": {
    language: "mjml",
    description: "MJML renders text in table cells by default — word-break works via mj-text",
    before: `<mj-text>
  <span style="word-break: break-all;">Long URL here</span>
</mj-text>`,
    after: `<!-- mj-text already renders inside a <td>, so add word-break
     to the mj-text css-class or inline style -->
<mj-text css-class="break-words"
  padding="0">
  Long URL here
</mj-text>
<mj-style>
  .break-words td { word-break: break-all; word-wrap: break-word; }
</mj-style>`,
  },

  // ── @font-face (MJML) ───────────────────────────────────────────────
  "@font-face::mjml": {
    language: "mjml",
    description: "Use mj-font in mj-head instead of @font-face",
    before: `<mj-style>
  @font-face {
    font-family: 'CustomFont';
    src: url('https://example.com/custom.woff2') format('woff2');
  }
</mj-style>`,
    after: `<mjml>
  <mj-head>
    <mj-font name="CustomFont"
      href="https://fonts.googleapis.com/css2?family=CustomFont" />
    <mj-attributes>
      <mj-all font-family="CustomFont, Arial, Helvetica, sans-serif" />
    </mj-attributes>
  </mj-head>
</mjml>`,
  },

  // ── <style> (Gmail MJML) ────────────────────────────────────────────
  "<style>::gmail::mjml": {
    language: "mjml",
    description: "Use mj-style inline='inline' to force style inlining for Gmail",
    before: `<mj-head>
  <mj-style>
    .custom { color: #6d28d9; }
  </mj-style>
</mj-head>`,
    after: `<mj-head>
  <!-- Use inline="inline" to force MJML to inline these styles.
       Class-based styles in a plain mj-style block will be stripped by Gmail. -->
  <mj-style inline="inline">
    .custom { color: #6d28d9; }
  </mj-style>
</mj-head>`,
  },

  // ── border-radius (Outlook MJML) ────────────────────────────────────
  "border-radius::outlook::mjml": {
    language: "mjml",
    description: "MJML limitation: border-radius is unsupported in Outlook — MJML does not generate VML",
    before: `<mj-button border-radius="6px" background-color="#6d28d9">
  Click Here
</mj-button>`,
    after: `<!-- Known MJML limitation: MJML does not generate VML for rounded corners.
     Options: accept flat corners, use mj-raw for VML, or set border-radius="0". -->
<mj-button border-radius="0" background-color="#6d28d9">
  Click Here
</mj-button>`,
  },

  // ── background-image (Outlook MJML) ─────────────────────────────────
  "background-image::outlook::mjml": {
    language: "mjml",
    description: "Use mj-section background-url for Outlook-compatible background images",
    before: `<mj-section>
  <mj-column>
    <mj-image src="hero.jpg" />
  </mj-column>
</mj-section>`,
    after: `<!-- MJML generates VML-compatible markup automatically via background-url on mj-section. -->
<mj-section background-url="https://example.com/hero.jpg"
             background-size="cover"
             background-repeat="no-repeat"
             background-color="#333333">
  <mj-column>
    <mj-text color="#ffffff">Your content here</mj-text>
  </mj-column>
</mj-section>`,
  },

  // ── display:flex (MJML) ─────────────────────────────────────────────
  "display:flex::mjml": {
    language: "mjml",
    description: "Replace flexbox (from mj-raw or inline styles) with mj-section and mj-column",
    before: `<mj-raw>
  <div style="display: flex; gap: 16px;">
    <div style="flex: 1;">Column 1</div>
    <div style="flex: 1;">Column 2</div>
  </div>
</mj-raw>`,
    after: `<!-- Flexbox in MJML is not Outlook-compatible.
     Use mj-section and mj-column — MJML compiles these to table-based layouts. -->
<mj-section>
  <mj-column width="50%">
    <mj-text>Column 1</mj-text>
  </mj-column>
  <mj-column width="50%">
    <mj-text>Column 2</mj-text>
  </mj-column>
</mj-section>`,
  },

  // ── @media (MJML) ──────────────────────────────────────────────────
  "@media::mjml": {
    language: "mjml",
    description: "Use MJML responsive attributes and breakpoints instead of hand-written @media",
    before: `<mj-style>
  @media (max-width: 600px) {
    .mobile-stack { display: block !important; width: 100% !important; }
  }
</mj-style>`,
    after: `<!-- MJML generates responsive @media queries automatically.
     Use mj-breakpoint and mj-column widths to control responsive behavior. -->
<mj-head>
  <mj-breakpoint width="600px" />
</mj-head>
<mj-body>
  <mj-section>
    <mj-column width="50%"><mj-text>Left</mj-text></mj-column>
    <mj-column width="50%"><mj-text>Right</mj-text></mj-column>
  </mj-section>
</mj-body>`,
  },
};
