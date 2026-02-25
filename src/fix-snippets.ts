import type { CodeFix, Framework } from "./types";

/**
 * Inline code fix snippets — real, paste-ready code that turns
 * "here's your problem" into "here's your solution."
 *
 * Keyed by property, with optional client-specific overrides.
 * Client-specific keys use the format "property::clientPrefix"
 * (e.g. "border-radius::outlook").
 */
const FIX_DATABASE: Record<string, CodeFix> = {
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

  // ── REACT EMAIL (jsx) framework-specific fixes ────────────────────────────

  "display:flex::outlook::jsx": {
    language: "jsx",
    description: "Use React Email Row + Column components instead of flexbox (Outlook-safe)",
    before: `<div style={{ display: "flex", gap: "16px" }}>
  <div style={{ flex: 1 }}>Column 1</div>
  <div style={{ flex: 1 }}>Column 2</div>
</div>`,
    after: `import { Row, Column } from "@react-email/components";

<Row>
  <Column style={{ width: "50%", verticalAlign: "top" }}>
    Column 1
  </Column>
  <Column style={{ width: "50%", verticalAlign: "top" }}>
    Column 2
  </Column>
</Row>`,
  },

  "display:grid::jsx": {
    language: "jsx",
    description: "Replace CSS Grid with React Email Row + Column components",
    before: `<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
  <div>Item 1</div>
  <div>Item 2</div>
</div>`,
    after: `import { Row, Column } from "@react-email/components";

<Row>
  <Column style={{ width: "50%", padding: "8px", verticalAlign: "top" }}>
    Item 1
  </Column>
  <Column style={{ width: "50%", padding: "8px", verticalAlign: "top" }}>
    Item 2
  </Column>
</Row>`,
  },

  "max-width::outlook::jsx": {
    language: "jsx",
    description: "Use React Email Container component for Outlook-safe max-width centering",
    before: `<div style={{ maxWidth: "600px", margin: "0 auto" }}>
  Content here
</div>`,
    after: `import { Container } from "@react-email/components";

<Container style={{ maxWidth: "600px" }}>
  Content here
</Container>`,
  },

  "@font-face::jsx": {
    language: "jsx",
    description: "Use React Email Font component instead of @font-face in <style>",
    before: `import { Head } from "@react-email/components";

<Head>
  <style>{\`
    @font-face {
      font-family: 'CustomFont';
      src: url('custom.woff2') format('woff2');
    }
  \`}</style>
</Head>
<h1 style={{ fontFamily: "'CustomFont'" }}>Hello</h1>`,
    after: `import { Head, Font } from "@react-email/components";

<Head>
  <Font
    fontFamily="CustomFont"
    fallbackFontFamily="Arial"
    webFont={{ url: "https://example.com/custom.woff2", format: "woff2" }}
    fontWeight={400}
    fontStyle="normal"
  />
</Head>
<h1 style={{ fontFamily: "'CustomFont', Arial, sans-serif" }}>Hello</h1>`,
  },

  "<svg>::jsx": {
    language: "jsx",
    description: "Replace inline SVG with React Email Img component",
    before: `<svg width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#6d28d9"/>
</svg>`,
    after: `import { Img } from "@react-email/components";

<Img
  src="https://example.com/icon.png"
  width={24}
  height={24}
  alt="Icon"
  style={{ display: "block", border: "0" }}
/>`,
  },

  "<video>::jsx": {
    language: "jsx",
    description: "Replace video with a linked thumbnail using React Email Img + Link",
    before: `<video width="600" autoPlay muted>
  <source src="demo.mp4" type="video/mp4" />
</video>`,
    after: `import { Img, Link } from "@react-email/components";

<Link href="https://example.com/watch">
  <Img
    src="https://example.com/video-thumb.gif"
    width={600}
    alt="Watch the video"
    style={{ display: "block", border: "0", maxWidth: "100%" }}
  />
</Link>`,
  },

  "border-radius::outlook::jsx": {
    language: "jsx",
    description: "Render rounded buttons with VML via JSX dangerouslySetInnerHTML (Outlook workaround)",
    before: `<a
  href="https://example.com"
  style={{ backgroundColor: "#6d28d9", color: "#fff",
           padding: "12px 32px", borderRadius: "6px",
           textDecoration: "none", display: "inline-block" }}>
  Click Here
</a>`,
    after: `{/* Use dangerouslySetInnerHTML to inject VML for Outlook rounded corners */}
<div
  dangerouslySetInnerHTML={{
    __html: \`
<!--[if mso]>
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
  style="background-color:#6d28d9; color:#fff; padding:12px 32px;
         border-radius:6px; text-decoration:none; display:inline-block;">
  Click Here
</a>
<!--<![endif]-->
\`,
  }}
/>`,
  },

  "gap::jsx": {
    language: "jsx",
    description: "Use padding style prop on Column instead of gap (email-safe spacing)",
    before: `<Row style={{ gap: "16px" }}>
  <Column>Item 1</Column>
  <Column>Item 2</Column>
  <Column>Item 3</Column>
</Row>`,
    after: `import { Row, Column } from "@react-email/components";

{/* Use padding on Column — gap is not supported in email clients */}
<Row>
  <Column style={{ paddingRight: "16px" }}>Item 1</Column>
  <Column style={{ paddingRight: "16px" }}>Item 2</Column>
  <Column>Item 3</Column>
</Row>`,
  },

  "<style>::gmail::jsx": {
    language: "jsx",
    description: "React Email inlines styles via style props — manual <style> blocks won't survive Gmail",
    before: `import { Head } from "@react-email/components";

<Head>
  <style>{\`
    .header { background-color: #6d28d9; padding: 32px; }
    .title  { color: #fff; font-size: 24px; }
  \`}</style>
</Head>
<div className="header">
  <h1 className="title">Hello</h1>
</div>`,
    after: `{/* Gmail strips <style> blocks. Move styles to inline style props: */}
<div style={{ backgroundColor: "#6d28d9", padding: "32px" }}>
  <h1 style={{ color: "#fff", fontSize: "24px", margin: 0 }}>Hello</h1>
</div>`,
  },

  "<link>::jsx": {
    language: "jsx",
    description: "Use React Email Head component instead of <link> for stylesheet references",
    before: `import { Head } from "@react-email/components";

<Head>
  <link rel="stylesheet" href="styles.css" />
</Head>`,
    after: `import { Head } from "@react-email/components";

{/* External stylesheets are stripped by most email clients.
   Place styles inline via style props, or use Head for font imports only. */}
<Head>
  {/* Inline your CSS here or use Font component for web fonts */}
</Head>`,
  },

  // ── MJML framework-specific fixes ─────────────────────────────────────────

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

  // ── MAIZZLE framework-specific fixes ──────────────────────────────────────

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

  "@font-face::maizzle": {
    language: "maizzle",
    description: "Add fonts via the googleFonts key in config.js — Maizzle injects the Google Fonts link tag automatically. Set googleFonts: \"Inter:ital,wght@0,400;0,700\" in your environment config, then reference the font family in your template.",
    before: `<style>
  @font-face {
    font-family: 'Inter';
    src: url('https://fonts.gstatic.com/...') format('woff2');
  }
</style>`,
    after: `<!-- config.js: googleFonts: "Inter:ital,wght@0,400;0,700" -->
<p class="font-['Inter',Arial,sans-serif]">Hello</p>`,
  },

  "<style>::gmail::maizzle": {
    language: "maizzle",
    description: "Maizzle automatically inlines CSS via juice during build (inlineCSS: true in config.js). Manual <style> blocks bypass juice and will be stripped by Gmail — prefer Tailwind utility classes instead.",
    before: `<style>
  .custom { color: #6d28d9; }
</style>
<div class="custom">Hello</div>`,
    after: `<!-- Prefer Tailwind classes — Maizzle inlines them automatically during build -->
<div class="text-[#6d28d9]">Hello</div>`,
  },

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

  // ── JSX fixes for remaining common properties ─────────────────────────────

  "<form>::jsx": {
    language: "jsx",
    description: "Replace embedded form with a React Email Button linking to a hosted form",
    before: `<form action="/subscribe" method="POST">
  <input type="email" placeholder="Email" />
  <button type="submit">Subscribe</button>
</form>`,
    after: `import { Button } from "@react-email/components";

<Button
  href="https://example.com/subscribe"
  style={{
    backgroundColor: "#6d28d9",
    color: "#fff",
    padding: "12px 32px",
    borderRadius: "6px",
    textDecoration: "none",
    fontWeight: "bold",
  }}
>
  Subscribe Now
</Button>`,
  },

  "@media::jsx": {
    language: "jsx",
    description: "Design mobile-first — @media queries are stripped by many clients",
    before: `import { Head } from "@react-email/components";

<Head>
  <style>{\`
    @media (max-width: 600px) {
      .cols { display: block !important; }
      .col  { width: 100% !important; }
    }
  \`}</style>
</Head>
<Row>
  <Column className="col" style={{ width: "50%" }}>Left</Column>
  <Column className="col" style={{ width: "50%" }}>Right</Column>
</Row>`,
    after: `import { Container, Section, Text } from "@react-email/components";

{/* Single-column stacked layout works without @media.
    Stack content vertically so it reads well on all clients. */}
<Container style={{ maxWidth: "600px" }}>
  <Section style={{ padding: "16px" }}>
    <Text>Left</Text>
  </Section>
  <Section style={{ padding: "16px" }}>
    <Text>Right</Text>
  </Section>
</Container>`,
  },

  "position::jsx": {
    language: "jsx",
    description: "Use React Email Row and Column for layout instead of CSS position",
    before: `<div style={{ position: "relative" }}>
  <div style={{ position: "absolute", top: 0, right: 0 }}>
    Badge
  </div>
  <p>Content</p>
</div>`,
    after: `import { Row, Column, Text } from "@react-email/components";

<Row>
  <Column style={{ verticalAlign: "top" }}>
    <Text>Content</Text>
  </Column>
  <Column style={{ width: "80px", verticalAlign: "top", textAlign: "right" }}>
    <Text>Badge</Text>
  </Column>
</Row>`,
  },

  "float::jsx": {
    language: "jsx",
    description: "Use React Email Row and Column instead of float for side-by-side layout",
    before: `<img src="photo.jpg" style={{ float: "left", marginRight: "16px" }} width={200} />
<p>Text wraps around the image.</p>`,
    after: `import { Row, Column, Img, Text } from "@react-email/components";

<Row>
  <Column style={{ width: "200px", paddingRight: "16px", verticalAlign: "top" }}>
    <Img src="photo.jpg" width={200} style={{ display: "block", border: "0" }} />
  </Column>
  <Column style={{ verticalAlign: "top" }}>
    <Text>Text next to the image.</Text>
  </Column>
</Row>`,
  },

  "background-image::outlook::jsx": {
    language: "jsx",
    description: "Use VML for Outlook background images in JSX via dangerouslySetInnerHTML",
    before: `<td style={{ backgroundImage: "url('hero.jpg')",
              backgroundSize: "cover", padding: "40px" }}>
  <h1 style={{ color: "#fff" }}>Hello World</h1>
</td>`,
    after: `<div
  dangerouslySetInnerHTML={{
    __html: \`
<!--[if gte mso 9]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true"
  stroke="false" style="width:600px; height:300px;">
  <v:fill type="frame" src="hero.jpg" />
  <v:textbox inset="0,0,0,0">
<![endif]-->
<div style="background-image:url('hero.jpg'); background-size:cover; padding:40px;">
  <h1 style="color:#fff;">Hello World</h1>
</div>
<!--[if gte mso 9]>
  </v:textbox>
</v:rect>
<![endif]-->
\`,
  }}
/>`,
  },

  "opacity::jsx": {
    language: "jsx",
    description: "Use solid colors instead of opacity in style objects",
    before: `<div style={{
  backgroundColor: "#000",
  opacity: 0.5,
}}>
  Overlay content
</div>`,
    after: `<div style={{
  /* Use a pre-mixed solid color instead of opacity */
  backgroundColor: "#808080",
}}>
  Overlay content
</div>`,
  },

  "box-shadow::jsx": {
    language: "jsx",
    description: "Use border as a fallback for boxShadow in style objects",
    before: `<div style={{
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  padding: "24px",
}}>
  Card content
</div>`,
    after: `import { Section } from "@react-email/components";

<Section style={{
  border: "1px solid #e0e0e0",
  padding: "24px",
}}>
  Card content
</Section>`,
  },

  "linear-gradient::jsx": {
    language: "jsx",
    description: "Add a solid backgroundColor fallback before the gradient",
    before: `<div style={{
  background: "linear-gradient(135deg, #667eea, #764ba2)",
  padding: "40px",
  color: "#fff",
}}>
  Content here
</div>`,
    after: `<div style={{
  /* Solid fallback for clients that strip gradients */
  backgroundColor: "#667eea",
  background: "linear-gradient(135deg, #667eea, #764ba2)",
  padding: "40px",
  color: "#fff",
}}>
  Content here
</div>`,
  },

  "transform::jsx": {
    language: "jsx",
    description: "Pre-render transformed content as an image using React Email Img",
    before: `<div style={{ transform: "rotate(45deg)" }}>
  Rotated content
</div>`,
    after: `import { Img } from "@react-email/components";

{/* CSS transforms are not supported in email — pre-render as an image */}
<Img
  src="https://example.com/rotated-content.png"
  width={200}
  height={200}
  alt="Rotated content"
  style={{ display: "block", border: "0" }}
/>`,
  },

  "animation::jsx": {
    language: "jsx",
    description: "Replace CSS animation with a React Email Img using an animated GIF",
    before: `<span style={{ animation: "pulse 2s infinite" }}>New!</span>`,
    after: `import { Img } from "@react-email/components";

{/* CSS animations are not supported — use an animated GIF */}
<Img
  src="https://example.com/badge-animated.gif"
  width={60}
  height={24}
  alt="New!"
  style={{ display: "inline-block", border: "0" }}
/>`,
  },

  "transition::jsx": {
    language: "jsx",
    description: "Transitions don't work in email — style the default state well",
    before: `<a
  href="#"
  style={{
    backgroundColor: "#6d28d9",
    color: "#fff",
    transition: "background-color 0.2s",
  }}
>
  Click
</a>`,
    after: `import { Button } from "@react-email/components";

{/* Transitions are not supported — style the default state: */}
<Button
  href="https://example.com"
  style={{
    backgroundColor: "#6d28d9",
    color: "#fff",
    textDecoration: "none",
    fontWeight: "bold",
    padding: "12px 32px",
  }}
>
  Click
</Button>`,
  },

  "overflow::jsx": {
    language: "jsx",
    description: "Content will always be visible — design for full content display",
    before: `<div style={{ maxHeight: "200px", overflow: "hidden" }}>
  Long content that gets clipped...
</div>`,
    after: `import { Link, Text } from "@react-email/components";

{/* overflow:hidden is stripped — show full content or truncate server-side */}
<div>
  <Text>Shortened content that fits...</Text>
  <Link href="https://example.com/full">Read more</Link>
</div>`,
  },

  "visibility::jsx": {
    language: "jsx",
    description: "Use font-size/max-height trick instead of visibility:hidden",
    before: `<div style={{ visibility: "hidden" }}>
  Hidden preheader text
</div>`,
    after: `{/* visibility:hidden is stripped by most clients — use the preheader trick.
    msoHide is non-standard but needed to hide content in Outlook. */}
<div
  style={{
    fontSize: "0px",
    lineHeight: "0px",
    maxHeight: "0px",
    overflow: "hidden",
    display: "none",
    msoHide: "all",
  } as React.CSSProperties}
  aria-hidden="true"
>
  Preheader text
</div>`,
  },

  "object-fit::jsx": {
    language: "jsx",
    description: "Use React Email Img with explicit width/height instead of object-fit",
    before: `<img
  src="photo.jpg"
  style={{ width: "300px", height: "200px", objectFit: "cover" }}
/>`,
    after: `import { Img } from "@react-email/components";

{/* Crop/resize image server-side to exact dimensions */}
<Img
  src="https://example.com/photo-300x200.jpg"
  width={300}
  height={200}
  alt="Photo"
  style={{ display: "block", border: "0" }}
/>`,
  },

  "background-size::jsx": {
    language: "jsx",
    description: "Outlook ignores background-size — use sized images instead",
    before: `<div style={{
  background: "url('bg.jpg') center/cover no-repeat",
}}>
  Content
</div>`,
    after: `import { Img } from "@react-email/components";

{/* background-size is not supported in most email clients.
    Use a full-width image instead of a background: */}
<Img
  src="https://example.com/bg-600x400.jpg"
  width={600}
  alt=""
  style={{ display: "block", width: "100%", border: "0" }}
/>`,
  },

  "box-sizing::jsx": {
    language: "jsx",
    description: "Account for padding in width manually (no box-sizing support)",
    before: `<div style={{
  width: "300px",
  padding: "20px",
  boxSizing: "border-box",
}}>
  Content — total width stays 300px
</div>`,
    after: `{/* Set outer width, use inner element for padding */}
<div style={{ width: "300px" }}>
  <div style={{ padding: "20px" }}>
    Content — padding on inner element
  </div>
</div>`,
  },
};

/**
 * Look up a code fix for a given property, client, and optional framework.
 * Returns undefined if no fix snippet exists.
 *
 * Resolution order (most specific to least specific):
 * 1. property::clientPrefix::framework  (e.g. "display:flex::outlook::jsx")
 * 2. property::framework                (e.g. "display:grid::jsx")
 * 3. property::clientPrefix             (e.g. "border-radius::outlook")
 * 4. property                           (generic fix)
 */
export function getCodeFix(
  property: string,
  clientId: string,
  framework?: Framework
): CodeFix | undefined {
  const clientPrefix = getClientPrefix(clientId);

  // Tier 1: property::clientPrefix::framework
  if (framework && clientPrefix) {
    const tier1 = FIX_DATABASE[`${property}::${clientPrefix}::${framework}`];
    if (tier1) return tier1;
  }

  // Tier 2: property::framework
  if (framework) {
    const tier2 = FIX_DATABASE[`${property}::${framework}`];
    if (tier2) return tier2;
  }

  // Tier 3: property::clientPrefix (existing behavior)
  if (clientPrefix) {
    const tier3 = FIX_DATABASE[`${property}::${clientPrefix}`];
    if (tier3) return tier3;
  }

  // Tier 4: generic fix (existing behavior)
  return FIX_DATABASE[property];
}

/**
 * Returns true if a framework was specified but the code fix resolved to
 * a client-specific or fully generic entry (tiers 3–4) rather than a
 * framework-aware entry (tiers 1–2).
 */
export function isCodeFixGenericFallback(
  property: string,
  clientId: string,
  framework?: Framework
): boolean {
  if (!framework) return false;
  const clientPrefix = getClientPrefix(clientId);
  if (clientPrefix && FIX_DATABASE[`${property}::${clientPrefix}::${framework}`]) return false;
  if (FIX_DATABASE[`${property}::${framework}`]) return false;
  return true;
}

function getClientPrefix(clientId: string): string | null {
  if (clientId.startsWith("outlook-windows")) return "outlook";
  if (clientId.startsWith("outlook")) return null; // Outlook web is more standards-compliant
  if (clientId.startsWith("gmail")) return "gmail";
  if (clientId.startsWith("apple-mail")) return "apple";
  return null;
}

// =============================================================================
// Suggestion Database — framework-aware suggestion text for warnings
// =============================================================================

/**
 * Human-readable suggestion strings attached to CSSWarning.suggestion.
 *
 * Key format mirrors FIX_DATABASE:
 *   property                          → generic HTML advice
 *   property::clientPrefix            → client-specific advice
 *   property::framework               → framework-specific advice
 *   property::clientPrefix::framework → most-specific advice
 *
 * Use `getSuggestion()` to resolve the best match via tiered lookup.
 */
const SUGGESTION_DATABASE: Record<string, string> = {
  // ── <style> ───────────────────────────────────────────────────────────
  "<style>":
    "Use a CSS inliner tool (like juice) to move styles to inline attributes.",
  "<style>:partial":
    "Use inline styles as the primary approach, with <style> in <head> as progressive enhancement.",
  "<style>::jsx":
    "Move styles to inline style props — React Email components accept style objects directly.",
  "<style>:partial::jsx":
    "Use inline style props on React Email components. Reserve <style> in <Head> for progressive enhancement only.",
  "<style>::mjml":
    'Use mj-style inline="inline" to force MJML to inline styles for Gmail compatibility.',
  "<style>:partial::mjml":
    'Use mj-style inline="inline" for critical styles; plain mj-style for progressive enhancement.',
  "<style>::maizzle":
    "Prefer Tailwind utility classes — Maizzle inlines CSS via juice during build (inlineCSS: true in config.js).",
  "<style>:partial::maizzle":
    "Use Tailwind utility classes for critical styles. Maizzle automatically inlines them at build time.",

  // ── <link> ────────────────────────────────────────────────────────────
  "<link>": "Inline all CSS directly in the HTML.",
  "<link>::jsx":
    "Use the React Email <Head> component for font imports; place all other styles inline via style props.",
  "<link>::mjml":
    "MJML does not support external stylesheets. Use mj-style or inline attributes.",
  "<link>::maizzle":
    "External stylesheets are stripped. Use Tailwind CSS classes — Maizzle inlines them at build time.",

  // ── <svg> ─────────────────────────────────────────────────────────────
  "<svg>": "Convert SVGs to PNG/JPG images.",
  "<svg>::jsx":
    "Replace inline SVG with the React Email <Img> component pointing to a hosted PNG.",
  "<svg>::mjml":
    "Replace inline SVG with an mj-image component pointing to a hosted PNG.",
  "<svg>::maizzle":
    "Replace inline SVG with an <img> tag pointing to a hosted PNG.",

  // ── <video> ───────────────────────────────────────────────────────────
  "<video>":
    "Use an animated GIF or a static image with a play button linking to the video.",
  "<video>::jsx":
    "Replace <video> with a React Email <Link> wrapping an <Img> thumbnail.",
  "<video>::mjml":
    "Replace <video> with an mj-image linking to a video thumbnail.",
  "<video>::maizzle":
    "Replace <video> with a linked image thumbnail.",

  // ── <form> ────────────────────────────────────────────────────────────
  "<form>": "Use links to a web form instead of embedding forms in email.",
  "<form>::jsx":
    "Replace the form with a React Email <Button> or <Link> component pointing to a hosted form page.",
  "<form>::mjml":
    "Replace the form with an mj-button linking to a hosted form page.",
  "<form>::maizzle":
    "Replace the form with a CTA link/button pointing to a hosted form page.",

  // ── @font-face ────────────────────────────────────────────────────────
  "@font-face":
    "Always include a web-safe font stack as fallback (e.g., Arial, Helvetica, sans-serif).",
  "@font-face::jsx":
    "Use the React Email <Font> component in <Head> with a fallbackFontFamily prop.",
  "@font-face::mjml":
    "Use mj-font in mj-head instead of @font-face in mj-style.",
  "@font-face::maizzle":
    "Use the googleFonts key in config.js — Maizzle injects the Google Fonts link tag automatically.",

  // ── @media ────────────────────────────────────────────────────────────
  "@media":
    "Design emails mobile-first with a single-column layout that works without media queries.",
  "@media::jsx":
    "Use a single-column layout with React Email <Container> and <Section>. Avoid relying on @media queries.",
  "@media::mjml":
    "MJML generates responsive @media queries automatically. Use mj-breakpoint and mj-column widths.",
  "@media::maizzle":
    "Use Tailwind responsive utility classes and Maizzle's breakpoints config instead of hand-written @media.",

  // ── display:flex ──────────────────────────────────────────────────────
  "display:flex":
    "Use <table> layouts for email client compatibility.",
  "display:flex::outlook":
    "Use <table> layouts with <!--[if mso]> conditional comments for Outlook's Word engine.",
  "display:flex::jsx":
    "Use React Email <Row> and <Column> components instead of flexbox.",
  "display:flex::mjml":
    "Use mj-section and mj-column — MJML compiles these to table-based layouts.",
  "display:flex::maizzle":
    "Replace Tailwind flex classes with HTML table + MSO conditional comments for Outlook.",

  // ── display:grid ──────────────────────────────────────────────────────
  "display:grid":
    "Replace CSS Grid with table layout for email compatibility.",
  "display:grid::jsx":
    "Use React Email <Row> and <Column> components instead of CSS Grid.",
  "display:grid::mjml":
    "Use mj-section and mj-column for grid-like layouts.",
  "display:grid::maizzle":
    "Replace Tailwind grid classes with HTML table layout for email compatibility.",

  // ── linear-gradient ───────────────────────────────────────────────────
  "linear-gradient":
    "Add a solid background-color fallback before the gradient.",
  "linear-gradient::jsx":
    "Add a solid backgroundColor style prop as fallback before the gradient.",
  "linear-gradient::mjml":
    "Add a background-color attribute on mj-section as a fallback.",
  "linear-gradient::maizzle":
    "Add a bg-[color] Tailwind class as a fallback before the gradient.",

  // ── box-shadow ────────────────────────────────────────────────────────
  "box-shadow":
    "Use border styling as an alternative to box-shadow.",
  "box-shadow::jsx":
    "Use a border style prop as an alternative to boxShadow.",
  "box-shadow::mjml":
    "Use a border attribute on mj-section or mj-column as an alternative.",
  "box-shadow::maizzle":
    "Use Tailwind border classes as an alternative to shadow classes.",

  // ── border-radius ─────────────────────────────────────────────────────
  "border-radius":
    "Use VML for rounded corners in Outlook, or accept square corners.",
  "border-radius::outlook":
    "Use VML (Vector Markup Language) for rounded buttons in Outlook.",
  "border-radius::jsx":
    "Outlook ignores borderRadius. Use dangerouslySetInnerHTML with VML for rounded buttons if needed.",
  "border-radius::mjml":
    'MJML does not generate VML — border-radius will not render in Outlook. Set border-radius="0" or accept flat corners.',
  "border-radius::maizzle":
    "Outlook ignores border-radius. Accept flat corners or use MSO conditional VML.",

  // ── max-width ─────────────────────────────────────────────────────────
  "max-width":
    "Use a fixed-width table wrapper for maximum compatibility.",
  "max-width::outlook":
    "Use a fixed width on table cells instead of max-width.",
  "max-width::jsx":
    "Use the React Email <Container> component which handles max-width across clients.",
  "max-width::mjml":
    "Set the width attribute on mj-body or mj-section for maximum compatibility.",
  "max-width::maizzle":
    "Wrap max-w containers with MSO conditional table for Outlook.",

  // ── gap ───────────────────────────────────────────────────────────────
  "gap":
    "Use padding/margin on child elements instead of gap.",
  "gap::outlook":
    "Use cellpadding/cellspacing on tables, or padding on cells.",
  "gap::jsx":
    "Use padding style props on <Column> components instead of gap.",
  "gap::mjml":
    "Use padding attribute on mj-column or mj-text for spacing.",
  "gap::maizzle":
    "Use Tailwind padding classes on child elements instead of gap.",

  // ── float ─────────────────────────────────────────────────────────────
  "float":
    "Use table cells with align attribute for side-by-side content.",
  "float::outlook":
    'Use table cells with align="left" or align="right".',
  "float::jsx":
    "Use React Email <Row> and <Column> components for side-by-side layout.",
  "float::mjml":
    "Use mj-section with multiple mj-column elements for side-by-side layout.",
  "float::maizzle":
    "Use HTML tables for side-by-side layout instead of Tailwind float classes.",

  // ── background-image ──────────────────────────────────────────────────
  "background-image":
    "Use VML for background images in clients that require it.",
  "background-image::outlook":
    "Use <!--[if gte mso 9]> with <v:background> VML for Outlook background images.",
  "background-image::jsx":
    "Use VML via dangerouslySetInnerHTML for Outlook background images.",
  "background-image::mjml":
    "Use background-url attribute on mj-section — MJML generates VML automatically.",
  "background-image::maizzle":
    "Use MSO conditional VML for Outlook background images.",

  // ── position ──────────────────────────────────────────────────────────
  "position":
    "Use table-based positioning instead of CSS position.",
  "position::jsx":
    "Use React Email <Row> and <Column> components for positioning.",
  "position::mjml":
    "Use mj-section and mj-column for layout positioning.",
  "position::maizzle":
    "Use HTML table layout instead of Tailwind position classes.",

  // ── opacity ───────────────────────────────────────────────────────────
  "opacity":
    "Use solid colors instead of opacity.",
  "opacity::jsx":
    "Use solid colors. Opacity is not supported in many email clients.",
  "opacity::mjml":
    "Use solid colors. Most email clients don't support opacity.",
  "opacity::maizzle":
    "Use solid Tailwind color classes instead of opacity.",

  // ── Additional properties covered by transform helpers ────────────────
  "overflow":
    "Content will always be visible. Design accordingly.",
  "visibility":
    "Remove the element or use display:none as an alternative.",
  "transform":
    "CSS transforms are not supported in email. Pre-render the effect as an image.",
  "animation":
    "CSS animations are not supported. Use animated GIFs instead.",
  "transition":
    "CSS transitions are not supported in email.",
  "box-sizing":
    "Account for padding in your width calculations (use padding on a nested element).",
  "object-fit":
    "Use width/height attributes on <img> directly.",
  "max-height":
    "Use fixed height instead.",
  "background-size":
    "Not supported in many clients. Set image dimensions directly.",
  "background-position":
    "Not supported in many clients. Use VML for positioning.",
  "display":
    "Use tables for layout in email clients.",
};

/**
 * Look up a suggestion string for a given property, client, and optional framework.
 *
 * Resolution order mirrors `getCodeFix()`:
 * 1. property::clientPrefix::framework
 * 2. property::framework
 * 3. property::clientPrefix
 * 4. property (generic)
 *
 * `isGenericFallback` is true when a framework was specified but no
 * framework-specific entry was found (resolution fell through to tiers 3–4).
 */
export function getSuggestion(
  property: string,
  clientId: string,
  framework?: Framework
): { text: string; isGenericFallback: boolean } {
  const clientPrefix = getClientPrefix(clientId);

  // Tier 1: property::clientPrefix::framework
  if (framework && clientPrefix) {
    const tier1 = SUGGESTION_DATABASE[`${property}::${clientPrefix}::${framework}`];
    if (tier1) return { text: tier1, isGenericFallback: false };
  }

  // Tier 2: property::framework
  if (framework) {
    const tier2 = SUGGESTION_DATABASE[`${property}::${framework}`];
    if (tier2) return { text: tier2, isGenericFallback: false };
  }

  // Tier 3: property::clientPrefix
  if (clientPrefix) {
    const tier3 = SUGGESTION_DATABASE[`${property}::${clientPrefix}`];
    if (tier3) return { text: tier3, isGenericFallback: !!framework };
  }

  // Tier 4: generic
  const tier4 = SUGGESTION_DATABASE[property];
  if (tier4) return { text: tier4, isGenericFallback: !!framework };

  // No entry — return a default
  return {
    text: `"${property}" is not supported in this email client.`,
    isGenericFallback: !!framework,
  };
}
