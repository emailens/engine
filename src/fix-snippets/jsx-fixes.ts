import type { CodeFix } from "../types";

/**
 * JSX (React Email) framework-specific code fix snippets.
 * All keys have a ::jsx suffix in the original FIX_DATABASE.
 */
export const JSX_FIX_DATABASE: Record<string, CodeFix> = {
  // ── word-break (JSX) ─────────────────────────────────────────────────
  "word-break::jsx": {
    language: "jsx",
    description: "Wrap long text in a table cell for Outlook-safe word breaking",
    before: `<span style={{ wordBreak: "break-all" }}>{url}</span>`,
    after: `{/* Table cells force text wrapping in Outlook and Yahoo */}
<table width="100%" cellPadding={0} cellSpacing={0}
  role="presentation" style={{ borderCollapse: "collapse" }}>
  <tr>
    <td style={{
      wordBreak: "break-all" as const,
      overflowWrap: "break-word" as const,
      wordWrap: "break-word" as const,
    }}>
      {url}
    </td>
  </tr>
</table>`,
  },

  // ── overflow-wrap (JSX) ──────────────────────────────────────────────
  "overflow-wrap::jsx": {
    language: "jsx",
    description: "Wrap text in a table cell for Outlook-safe overflow wrapping",
    before: `<p style={{ overflowWrap: "break-word" }}>{longText}</p>`,
    after: `<table width="100%" cellPadding={0} cellSpacing={0}
  role="presentation" style={{ borderCollapse: "collapse" }}>
  <tr>
    <td style={{
      overflowWrap: "break-word" as const,
      wordWrap: "break-word" as const,
      wordBreak: "break-all" as const,
    }}>
      {longText}
    </td>
  </tr>
</table>`,
  },

  // ── display:flex (Outlook JSX) ───────────────────────────────────────
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

  // ── display:grid (JSX) ──────────────────────────────────────────────
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

  // ── max-width (Outlook JSX) ─────────────────────────────────────────
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

  // ── @font-face (JSX) ────────────────────────────────────────────────
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

  // ── <svg> (JSX) ─────────────────────────────────────────────────────
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

  // ── <video> (JSX) ───────────────────────────────────────────────────
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

  // ── border-radius (Outlook JSX) ─────────────────────────────────────
  "border-radius::outlook::jsx": {
    language: "jsx",
    description:
      "Render rounded buttons with VML via JSX dangerouslySetInnerHTML (Outlook workaround)",
    before: `<a
  href="https://example.com"
  style={{ backgroundColor: "#6d28d9", color: "#fff",
           padding: "12px 32px", borderRadius: "6px",
           textDecoration: "none", display: "inline-block" }}>
  Click Here
</a>`,
    after:
      '{/* Use dangerouslySetInnerHTML to inject VML for Outlook rounded corners */}\n<div\n  dangerouslySetInnerHTML={{\n    __html: `\n<!--[if mso]>\n<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"\n  href="https://example.com"\n  style="height:44px; v-text-anchor:middle; width:200px;"\n  arcsize="14%" strokecolor="#6d28d9" fillcolor="#6d28d9">\n  <w:anchorlock/>\n  <center style="color:#fff; font-family:Arial,sans-serif;\n    font-size:14px; font-weight:bold;">Click Here</center>\n</v:roundrect>\n<![endif]-->\n<!--[if !mso]><!-->\n<a href="https://example.com"\n  style="background-color:#6d28d9; color:#fff; padding:12px 32px;\n         border-radius:6px; text-decoration:none; display:inline-block;">\n  Click Here\n</a>\n<!--<![endif]-->\n`,\n  }}\n/>',
  },

  // ── gap (JSX) ───────────────────────────────────────────────────────
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

  // ── <style> (Gmail JSX) ─────────────────────────────────────────────
  "<style>::gmail::jsx": {
    language: "jsx",
    description:
      "React Email inlines styles via style props — manual <style> blocks won't survive Gmail",
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

  // ── <link> (JSX) ────────────────────────────────────────────────────
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

  // ── <form> (JSX) ───────────────────────────────────────────────────
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

  // ── @media (JSX) ────────────────────────────────────────────────────
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

  // ── position (JSX) ─────────────────────────────────────────────────
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

  // ── float (JSX) ────────────────────────────────────────────────────
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

  // ── background-image (Outlook JSX) ──────────────────────────────────
  "background-image::outlook::jsx": {
    language: "jsx",
    description: "Use VML for Outlook background images in JSX via dangerouslySetInnerHTML",
    before: `<td style={{ backgroundImage: "url('hero.jpg')",
              backgroundSize: "cover", padding: "40px" }}>
  <h1 style={{ color: "#fff" }}>Hello World</h1>
</td>`,
    after:
      '<div\n  dangerouslySetInnerHTML={{\n    __html: `\n<!--[if gte mso 9]>\n<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true"\n  stroke="false" style="width:600px; height:300px;">\n  <v:fill type="frame" src="hero.jpg" />\n  <v:textbox inset="0,0,0,0">\n<![endif]-->\n<div style="background-image:url(\'hero.jpg\'); background-size:cover; padding:40px;">\n  <h1 style="color:#fff;">Hello World</h1>\n</div>\n<!--[if gte mso 9]>\n  </v:textbox>\n</v:rect>\n<![endif]-->\n`,\n  }}\n/>',
  },

  // ── opacity (JSX) ──────────────────────────────────────────────────
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

  // ── box-shadow (JSX) ──────────────────────────────────────────────
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

  // ── linear-gradient (JSX) ─────────────────────────────────────────
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

  // ── transform (JSX) ──────────────────────────────────────────────
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

  // ── animation (JSX) ──────────────────────────────────────────────
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

  // ── transition (JSX) ─────────────────────────────────────────────
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

  // ── overflow (JSX) ───────────────────────────────────────────────
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

  // ── visibility (JSX) ─────────────────────────────────────────────
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

  // ── object-fit (JSX) ─────────────────────────────────────────────
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

  // ── background-size (JSX) ────────────────────────────────────────
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

  // ── box-sizing (JSX) ─────────────────────────────────────────────
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
