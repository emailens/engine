/**
 * HTML/generic suggestion strings — entries that do NOT have a
 * ::jsx, ::mjml, or ::maizzle suffix in their key.
 */
export const HTML_SUGGESTION_DATABASE: Record<string, string> = {
  // ── <style> ───────────────────────────────────────────────────────────
  "<style>":
    "Use a CSS inliner tool (like juice) to move styles to inline attributes.",
  "<style>:partial":
    "Use inline styles as the primary approach, with <style> in <head> as progressive enhancement.",

  // ── <link> ────────────────────────────────────────────────────────────
  "<link>": "Inline all CSS directly in the HTML.",

  // ── <svg> ─────────────────────────────────────────────────────────────
  "<svg>": "Convert SVGs to PNG/JPG images.",

  // ── <video> ───────────────────────────────────────────────────────────
  "<video>":
    "Use an animated GIF or a static image with a play button linking to the video.",

  // ── <form> ────────────────────────────────────────────────────────────
  "<form>": "Use links to a web form instead of embedding forms in email.",

  // ── @font-face ────────────────────────────────────────────────────────
  "@font-face":
    "Always include a web-safe font stack as fallback (e.g., Arial, Helvetica, sans-serif).",

  // ── @media ────────────────────────────────────────────────────────────
  "@media":
    "Design emails mobile-first with a single-column layout that works without media queries.",

  // ── display:flex ──────────────────────────────────────────────────────
  "display:flex":
    "Use <table> layouts for email client compatibility.",
  "display:flex::outlook":
    "Use <table> layouts with <!--[if mso]> conditional comments for Outlook's Word engine.",

  // ── display:grid ──────────────────────────────────────────────────────
  "display:grid":
    "Replace CSS Grid with table layout for email compatibility.",

  // ── linear-gradient ───────────────────────────────────────────────────
  "linear-gradient":
    "Add a solid background-color fallback before the gradient.",

  // ── box-shadow ────────────────────────────────────────────────────────
  "box-shadow":
    "Use border styling as an alternative to box-shadow.",

  // ── border-radius ─────────────────────────────────────────────────────
  "border-radius":
    "Use VML for rounded corners in Outlook, or accept square corners.",
  "border-radius::outlook":
    "Use VML (Vector Markup Language) for rounded buttons in Outlook.",

  // ── max-width ─────────────────────────────────────────────────────────
  "max-width":
    "Use a fixed-width table wrapper for maximum compatibility.",
  "max-width::outlook":
    "Use a fixed width on table cells instead of max-width.",

  // ── gap ───────────────────────────────────────────────────────────────
  "gap":
    "Use padding/margin on child elements instead of gap.",
  "gap::outlook":
    "Use cellpadding/cellspacing on tables, or padding on cells.",

  // ── float ─────────────────────────────────────────────────────────────
  "float":
    "Use table cells with align attribute for side-by-side content.",
  "float::outlook":
    'Use table cells with align="left" or align="right".',

  // ── background-image ──────────────────────────────────────────────────
  "background-image":
    "Use VML for background images in clients that require it.",
  "background-image::outlook":
    "Use <!--[if gte mso 9]> with <v:background> VML for Outlook background images.",

  // ── position ──────────────────────────────────────────────────────────
  "position":
    "Use table-based positioning instead of CSS position.",

  // ── opacity ───────────────────────────────────────────────────────────
  "opacity":
    "Use solid colors instead of opacity.",

  // ── word-break ────────────────────────────────────────────────────────
  "word-break":
    "Wrap long text in a <table><td> to force wrapping in clients that don't support word-break.",
  "word-break::outlook":
    "Outlook's Word engine ignores word-break. Place text inside a <td> with a constrained width — tables always wrap.",

  // ── overflow-wrap ─────────────────────────────────────────────────────
  "overflow-wrap":
    "Wrap text in a <table><td> to force wrapping. overflow-wrap is ignored by Outlook and unreliable in Yahoo.",

  // ── white-space ───────────────────────────────────────────────────────
  "white-space":
    "Outlook only supports 'normal' and 'nowrap'. Use &nbsp; for non-breaking spaces.",

  // ── text-overflow ─────────────────────────────────────────────────────
  "text-overflow":
    "text-overflow requires overflow:hidden which is stripped by Gmail. Truncate content server-side.",

  // ── vertical-align ────────────────────────────────────────────────────
  "vertical-align":
    'Use the valign HTML attribute on <td> elements for Outlook (e.g., valign="top").',

  // ── border-spacing ────────────────────────────────────────────────────
  "border-spacing":
    'Use the cellspacing HTML attribute instead (e.g., <table cellspacing="8">).',

  // ── min-width / min-height ────────────────────────────────────────────
  "min-width":
    "Outlook ignores min-width. Use a fixed width attribute on <td> or <table>.",
  "min-height":
    "Outlook ignores min-height. Use a fixed height or a spacer image.",
  "max-height":
    "Outlook ignores max-height. Truncate content server-side or use a fixed height.",

  // ── text-shadow ───────────────────────────────────────────────────────
  "text-shadow":
    "text-shadow is stripped by Gmail, Outlook, and Yahoo. Use font-weight for emphasis.",

  // ── background-size / background-position ─────────────────────────────
  "background-size":
    "Not supported in many clients. Set image dimensions directly.",
  "background-position":
    "Not supported in many clients. Use VML for positioning.",

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
  "display":
    "Use tables for layout in email clients.",
};
