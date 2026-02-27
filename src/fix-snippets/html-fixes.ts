import type { CodeFix } from "../types";

/**
 * HTML/generic code fix snippets — entries that do NOT have a
 * ::jsx, ::mjml, or ::maizzle suffix in their key.
 */
export const HTML_FIX_DATABASE: Record<string, CodeFix> = {
  // ── border-radius (Outlook VML fallback) ──────────────────────────────
  "border-radius::outlook": {
    language: "html",
    description: "Use VML to render rounded buttons in Outlook",
    before: `<a href="https://example.com"
  style="background-color: #6d28d9; color: #fff;
         padding: 12px 32px; border-radius: 6px;
         text-decoration: none; display: inline-block;">
  Click Here
</a>`,
    after: `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
  href="https://example.com"
  style="height:44px; v-text-anchor:middle; width:200px;"
  arcsize="14%" strokecolor="#6d28d9" fillcolor="#6d28d9">
  <w:anchorlock/>
  <center style="color:#fff; font-family:Arial,sans-serif;
    font-size:14px; font-weight:bold;">Click Here</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="https://example.com"
  style="background-color: #6d28d9; color: #fff;
         padding: 12px 32px; border-radius: 6px;
         text-decoration: none; display: inline-block;">
  Click Here
</a>
<!--<![endif]-->`,
  },

  // ── background-image (Outlook VML) ────────────────────────────────────
  "background-image::outlook": {
    language: "html",
    description: "Use VML for background images in Outlook",
    before: `<td style="background-image: url('hero.jpg');
            background-size: cover; padding: 40px;">
  <h1 style="color: #fff;">Hello World</h1>
</td>`,
    after: `<!--[if gte mso 9]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true"
  stroke="false" style="width:600px; height:300px;">
  <v:fill type="frame" src="hero.jpg" />
  <v:textbox inset="0,0,0,0">
<![endif]-->
<td style="background-image: url('hero.jpg');
            background-size: cover; padding: 40px;">
  <h1 style="color: #fff;">Hello World</h1>
</td>
<!--[if gte mso 9]>
  </v:textbox>
</v:rect>
<![endif]-->`,
  },

  // ── display:flex → table layout ───────────────────────────────────────
  "display:flex::outlook": {
    language: "html",
    description: "Use table layout as fallback for flexbox in Outlook",
    before: `<div style="display: flex; gap: 16px;">
  <div style="flex: 1;">Column 1</div>
  <div style="flex: 1;">Column 2</div>
</div>`,
    after: `<!--[if mso]>
<table role="presentation" width="100%" cellpadding="0"
  cellspacing="0" border="0"><tr>
  <td width="50%" valign="top">Column 1</td>
  <td width="50%" valign="top">Column 2</td>
</tr></table>
<![endif]-->
<!--[if !mso]><!-->
<div style="display: flex; gap: 16px;">
  <div style="flex: 1;">Column 1</div>
  <div style="flex: 1;">Column 2</div>
</div>
<!--<![endif]-->`,
  },

  // ── display:grid → table layout ───────────────────────────────────────
  "display:grid": {
    language: "html",
    description: "Replace CSS Grid with table layout for email compatibility",
    before: `<div style="display: grid;
            grid-template-columns: 1fr 1fr; gap: 16px;">
  <div>Item 1</div>
  <div>Item 2</div>
</div>`,
    after: `<table role="presentation" width="100%" cellpadding="0"
  cellspacing="0" border="0">
  <tr>
    <td width="50%" style="padding: 8px;" valign="top">
      Item 1
    </td>
    <td width="50%" style="padding: 8px;" valign="top">
      Item 2
    </td>
  </tr>
</table>`,
  },

  // ── linear-gradient fallback ──────────────────────────────────────────
  "linear-gradient": {
    language: "html",
    description: "Add solid color fallback for gradient backgrounds",
    before: `<td style="background: linear-gradient(135deg, #667eea, #764ba2);
            padding: 40px; color: #fff;">
  Content here
</td>`,
    after: `<!-- Always declare a solid background-color before the gradient.
     Clients that strip gradients will show the fallback color. -->
<td style="background-color: #667eea;
            background: linear-gradient(135deg, #667eea, #764ba2);
            padding: 40px; color: #fff;">
  Content here
</td>`,
  },

  "linear-gradient::outlook": {
    language: "html",
    description: "Use VML to render gradients in Outlook",
    before: `<td style="background: linear-gradient(135deg, #667eea, #764ba2);
            padding: 40px; color: #fff;">
  Content here
</td>`,
    after: `<!--[if gte mso 9]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true"
  stroke="false" style="width:600px;">
  <v:fill type="gradient" color="#667eea" color2="#764ba2"
    angle="135" />
  <v:textbox inset="0,0,0,0">
<![endif]-->
<td style="background-color: #667eea;
            background: linear-gradient(135deg, #667eea, #764ba2);
            padding: 40px; color: #fff;">
  Content here
</td>
<!--[if gte mso 9]>
  </v:textbox>
</v:rect>
<![endif]-->`,
  },

  // ── <style> stripped by Gmail ──────────────────────────────────────────
  "<style>::gmail": {
    language: "html",
    description: "Inline CSS for Gmail compatibility",
    before: `<style>
  .header { background-color: #6d28d9; padding: 32px; }
  .title  { color: #fff; font-size: 24px; }
</style>
<div class="header">
  <h1 class="title">Hello</h1>
</div>`,
    after: `<div style="background-color: #6d28d9; padding: 32px;">
  <h1 style="color: #fff; font-size: 24px;
             font-family: Arial, sans-serif; margin: 0;">
    Hello
  </h1>
</div>`,
  },

  // ── <svg> replaced with image ─────────────────────────────────────────
  "<svg>": {
    language: "html",
    description: "Convert inline SVG to an image for email compatibility",
    before: `<svg width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#6d28d9"/>
</svg>`,
    after: `<img src="https://example.com/icon.png"
  width="24" height="24" alt="Icon"
  style="display: block; border: 0;" />`,
  },

  // ── <form> → link to web form ─────────────────────────────────────────
  "<form>": {
    language: "html",
    description: "Replace embedded form with a link to a hosted form",
    before: `<form action="/subscribe" method="POST">
  <input type="email" placeholder="Email" />
  <button type="submit">Subscribe</button>
</form>`,
    after: `<table role="presentation" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background-color: #6d28d9; border-radius: 6px;
               padding: 12px 32px;">
      <a href="https://example.com/subscribe"
        style="color: #fff; text-decoration: none;
               font-family: Arial, sans-serif;
               font-weight: bold;">
        Subscribe Now
      </a>
    </td>
  </tr>
</table>`,
  },

  // ── <video> → GIF + play button ───────────────────────────────────────
  "<video>": {
    language: "html",
    description: "Replace video with animated GIF or linked thumbnail",
    before: `<video width="600" autoplay muted>
  <source src="demo.mp4" type="video/mp4">
</video>`,
    after: `<a href="https://example.com/watch" target="_blank">
  <img src="https://example.com/video-thumb.gif"
    width="600" alt="Watch the video"
    style="display: block; border: 0; max-width: 100%;" />
</a>`,
  },

  // ── @font-face → web-safe stack ───────────────────────────────────────
  "@font-face": {
    language: "css",
    description: "Add web-safe font fallback stack",
    before: `@font-face {
  font-family: 'CustomFont';
  src: url('custom.woff2') format('woff2');
}
h1 { font-family: 'CustomFont'; }`,
    after: `/* Keep @font-face for clients that support it */
@font-face {
  font-family: 'CustomFont';
  src: url('custom.woff2') format('woff2');
}
h1 {
  font-family: 'CustomFont', Arial, Helvetica, sans-serif;
}`,
  },

  // ── @media → mobile-first layout ──────────────────────────────────────
  "@media": {
    language: "html",
    description: "Design mobile-first for clients without media query support",
    before: `<table width="800">
  <tr>
    <td width="400">Left Column</td>
    <td width="400">Right Column</td>
  </tr>
</table>
<style>
  @media (max-width: 600px) {
    table { width: 100% !important; }
    td { display: block !important; width: 100% !important; }
  }
</style>`,
    after: `<!-- Single-column layout that works without @media -->
<table role="presentation" width="100%"
  style="max-width: 600px;" cellpadding="0"
  cellspacing="0" border="0">
  <tr>
    <td style="padding: 16px;">Left Column</td>
  </tr>
  <tr>
    <td style="padding: 16px;">Right Column</td>
  </tr>
</table>`,
  },

  // ── box-shadow → border alternative ───────────────────────────────────
  "box-shadow": {
    language: "css",
    description: "Use border as a fallback for box-shadow",
    before: `.card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}`,
    after: `.card {
  border: 1px solid #e0e0e0;
  /* box-shadow as progressive enhancement */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}`,
  },

  // ── max-width (Outlook) → fixed width table ───────────────────────────
  "max-width::outlook": {
    language: "html",
    description: "Use a fixed-width table wrapper for Outlook",
    before: `<div style="max-width: 600px; margin: 0 auto;">
  Content here
</div>`,
    after: `<!--[if mso]>
<table role="presentation" width="600" cellpadding="0"
  cellspacing="0" border="0" align="center"><tr><td>
<![endif]-->
<div style="max-width: 600px; margin: 0 auto;">
  Content here
</div>
<!--[if mso]>
</td></tr></table>
<![endif]-->`,
  },

  // ── float (Outlook) → table align ─────────────────────────────────────
  "float::outlook": {
    language: "html",
    description: "Use table align attribute instead of CSS float",
    before: `<img src="photo.jpg" style="float: left;
  margin-right: 16px;" width="200" />
<p>Text wraps around the image.</p>`,
    after: `<table role="presentation" cellpadding="0"
  cellspacing="0" border="0">
  <tr>
    <td width="200" valign="top" style="padding-right: 16px;">
      <img src="photo.jpg" width="200"
        style="display: block; border: 0;" />
    </td>
    <td valign="top">
      <p>Text next to the image.</p>
    </td>
  </tr>
</table>`,
  },

  // ── gap → padding on children ─────────────────────────────────────────
  "gap": {
    language: "html",
    description: "Use padding or margin on child elements instead of gap",
    before: `<div style="display: flex; gap: 16px;">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>`,
    after: `<table role="presentation" cellpadding="0"
  cellspacing="0" border="0">
  <tr>
    <td style="padding-right: 16px;">Item 1</td>
    <td style="padding-right: 16px;">Item 2</td>
    <td>Item 3</td>
  </tr>
</table>`,
  },

  // ── opacity → solid colors ────────────────────────────────────────────
  "opacity": {
    language: "css",
    description: "Replace opacity with solid color equivalents",
    before: `.overlay {
  background-color: #000;
  opacity: 0.5;
}`,
    after: `.overlay {
  /* Use a semi-transparent color instead of opacity */
  background-color: #808080;
  /* Or for modern clients: rgba(0, 0, 0, 0.5) */
}`,
  },

  // ── position → table layout ───────────────────────────────────────────
  "position": {
    language: "html",
    description: "Use table-based positioning instead of CSS position",
    before: `<div style="position: relative;">
  <div style="position: absolute; top: 0; right: 0;">
    Badge
  </div>
  <p>Content</p>
</div>`,
    after: `<table role="presentation" width="100%" cellpadding="0"
  cellspacing="0" border="0">
  <tr>
    <td valign="top">Content</td>
    <td width="80" valign="top" align="right">Badge</td>
  </tr>
</table>`,
  },

  // ── box-sizing → nested padding ───────────────────────────────────────
  "box-sizing": {
    language: "html",
    description: "Account for padding in width manually (no box-sizing)",
    before: `<div style="width: 300px; padding: 20px;
            box-sizing: border-box;">
  Content — total width stays 300px
</div>`,
    after: `<!-- Set width to content-width (300 - 40 = 260px) -->
<div style="width: 300px;">
  <div style="padding: 20px;">
    Content — padding on inner element
  </div>
</div>`,
  },

  // ── <link> → inline styles ────────────────────────────────────────────
  "<link>": {
    language: "html",
    description: "Inline all CSS instead of using external stylesheets",
    before: `<head>
  <link rel="stylesheet" href="styles.css" />
</head>`,
    after: `<head>
  <style>
    /* Paste your CSS here, or use a build tool like
       juice/inline-css to inline automatically */
    .container { max-width: 600px; margin: 0 auto; }
    .header { background-color: #6d28d9; padding: 32px; }
  </style>
</head>`,
  },

  // ── dark-mode (Apple Mail) ────────────────────────────────────────────
  "dark-mode::apple": {
    language: "css",
    description: "Add prefers-color-scheme dark mode styles for Apple Mail",
    before: `<style>
  .header { background-color: #6d28d9; }
  .content { background-color: #ffffff; color: #333; }
</style>`,
    after: `<style>
  .header { background-color: #6d28d9; }
  .content { background-color: #ffffff; color: #333; }

  @media (prefers-color-scheme: dark) {
    .content {
      background-color: #1a1a2e !important;
      color: #e0e0e0 !important;
    }
    /* Force images to stay visible */
    img { opacity: 1 !important; }
  }
</style>`,
  },

  // ── object-fit → width/height attributes ──────────────────────────────
  "object-fit": {
    language: "html",
    description: "Use width/height attributes instead of object-fit",
    before: `<img src="photo.jpg" style="width: 300px; height: 200px;
            object-fit: cover;" />`,
    after: `<!-- Crop/resize image server-side to exact dimensions -->
<img src="photo-300x200.jpg" width="300" height="200"
  alt="Photo" style="display: block; border: 0;" />`,
  },

  // ── transform (not supported) ─────────────────────────────────────────
  "transform": {
    language: "html",
    description: "Pre-render transformed states as images or use table layout",
    before: `<div style="transform: rotate(45deg);">
  Rotated content
</div>`,
    after: `<!-- Pre-render rotated content as an image -->
<img src="rotated-content.png" width="200" height="200"
  alt="Rotated content"
  style="display: block; border: 0;" />`,
  },

  // ── animation → animated GIF ──────────────────────────────────────────
  "animation": {
    language: "html",
    description: "Replace CSS animation with an animated GIF",
    before: `<style>
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .badge { animation: pulse 2s infinite; }
</style>
<span class="badge">New!</span>`,
    after: `<!-- Use an animated GIF for the effect -->
<img src="https://example.com/badge-animated.gif"
  width="60" height="24" alt="New!"
  style="display: inline-block; border: 0;" />`,
  },

  // ── transition (not supported) ────────────────────────────────────────
  "transition": {
    language: "css",
    description: "Transitions don't work in email — style the default state well",
    before: `.button {
  background-color: #6d28d9;
  transition: background-color 0.2s;
}
.button:hover {
  background-color: #5b21b6;
}`,
    after: `.button {
  /* Use the most visually appealing state as default.
     :hover is only supported in a few clients. */
  background-color: #6d28d9;
  color: #ffffff;
  text-decoration: none;
  font-weight: bold;
}`,
  },

  // ── background-size (Outlook) → VML ───────────────────────────────────
  "background-size": {
    language: "html",
    description: "Outlook ignores background-size — use VML or sized images",
    before: `<td style="background: url('bg.jpg') center/cover no-repeat;">
  Content
</td>`,
    after: `<!--[if gte mso 9]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true"
  stroke="false" style="width:600px; height:400px;">
  <v:fill type="frame" src="bg.jpg" />
  <v:textbox inset="0,0,0,0">
<![endif]-->
<td style="background: url('bg.jpg') center/cover no-repeat;
            background-color: #333;">
  Content
</td>
<!--[if gte mso 9]>
  </v:textbox>
</v:rect>
<![endif]-->`,
  },

  // ── overflow (Gmail strips it) ────────────────────────────────────────
  "overflow": {
    language: "html",
    description: "Content will always be visible — design for full content display",
    before: `<div style="max-height: 200px; overflow: hidden;">
  Long content that gets clipped...
</div>`,
    after: `<!-- Show full content, or truncate server-side -->
<div style="max-height: 200px;">
  Shortened content that fits...
  <a href="https://example.com/full">Read more</a>
</div>`,
  },

  // ── visibility (Gmail strips it) ──────────────────────────────────────
  "visibility": {
    language: "html",
    description: "Use conditional comments or remove hidden content",
    before: `<div style="visibility: hidden;">
  Hidden content for screen readers
</div>`,
    after: `<!-- For screen readers, use font-size: 0 trick -->
<div style="font-size: 0; max-height: 0; overflow: hidden;
            mso-hide: all;" aria-hidden="true">
  Preheader text
</div>`,
  },

  // ── word-break → table cell wrapping ──────────────────────────────────
  "word-break": {
    language: "html",
    description: "Wrap long text in a table cell to force line breaks without word-break",
    before: `<span style="word-break: break-all;">
  https://example.com/very/long/url?token=abc123def456
</span>`,
    after: `<!-- Table cells force text wrapping in all clients including Outlook -->
<table role="presentation" width="100%" cellpadding="0"
  cellspacing="0" border="0">
  <tr>
    <td style="word-break: break-all; overflow-wrap: break-word;
               word-wrap: break-word;">
      https://example.com/very/long/url?token=abc123def456
    </td>
  </tr>
</table>`,
  },

  // ── overflow-wrap → table cell wrapping ───────────────────────────────
  "overflow-wrap": {
    language: "html",
    description: "Use a table cell to force word wrapping without overflow-wrap",
    before: `<p style="overflow-wrap: break-word;">
  https://example.com/very/long/url?token=abc123def456
</p>`,
    after: `<table role="presentation" width="100%" cellpadding="0"
  cellspacing="0" border="0">
  <tr>
    <td style="overflow-wrap: break-word; word-wrap: break-word;
               word-break: break-all;">
      https://example.com/very/long/url?token=abc123def456
    </td>
  </tr>
</table>`,
  },

  // ── text-shadow → border/font-weight alternative ──────────────────────
  "text-shadow": {
    language: "css",
    description: "Use font-weight or border-bottom as alternatives to text-shadow",
    before: `.glow {
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}`,
    after: `.glow {
  /* text-shadow is not supported in Gmail, Outlook, Yahoo.
     Use font-weight or letter-spacing for emphasis instead. */
  font-weight: bold;
  letter-spacing: 0.5px;
}`,
  },

  // ── border-spacing → cellspacing attribute ────────────────────────────
  "border-spacing": {
    language: "html",
    description: "Use the cellspacing HTML attribute instead of border-spacing CSS",
    before: `<table style="border-spacing: 8px; border-collapse: separate;">
  <tr><td>Cell</td></tr>
</table>`,
    after: `<table cellspacing="8" style="border-collapse: separate;">
  <tr><td>Cell</td></tr>
</table>`,
  },

  // ── min-width → fixed width ──────────────────────────────────────────
  "min-width": {
    language: "html",
    description: "Use a fixed width instead of min-width for Outlook compatibility",
    before: `<td style="min-width: 200px;">Content</td>`,
    after: `<!-- Outlook ignores min-width. Use a fixed width or a spacer. -->
<td width="200" style="width: 200px;">Content</td>`,
  },

  // ── min-height → fixed height ────────────────────────────────────────
  "min-height": {
    language: "html",
    description: "Use a fixed height or spacer instead of min-height",
    before: `<td style="min-height: 100px;">Content</td>`,
    after: `<!-- Outlook ignores min-height. Use height or a spacer image. -->
<td height="100" style="height: 100px;">Content</td>`,
  },

  // ── max-height → fixed height ────────────────────────────────────────
  "max-height": {
    language: "html",
    description: "Outlook ignores max-height — truncate content server-side",
    before: `<div style="max-height: 200px; overflow: hidden;">
  Long content...
</div>`,
    after: `<!-- Outlook ignores max-height. Truncate content server-side. -->
<div style="height: 200px;">
  Shortened content...
  <a href="https://example.com/full">Read more</a>
</div>`,
  },
};
