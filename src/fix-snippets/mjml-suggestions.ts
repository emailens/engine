/**
 * MJML framework-specific suggestion strings.
 * All keys have a ::mjml suffix in the original SUGGESTION_DATABASE.
 */
export const MJML_SUGGESTION_DATABASE: Record<string, string> = {
  // ── <style> ───────────────────────────────────────────────────────────
  "<style>::mjml":
    'Use mj-style inline="inline" to force MJML to inline styles for Gmail compatibility.',
  "<style>:partial::mjml":
    'Use mj-style inline="inline" for critical styles; plain mj-style for progressive enhancement.',

  // ── <link> ────────────────────────────────────────────────────────────
  "<link>::mjml":
    "MJML does not support external stylesheets. Use mj-style or inline attributes.",

  // ── <svg> ─────────────────────────────────────────────────────────────
  "<svg>::mjml":
    "Replace inline SVG with an mj-image component pointing to a hosted PNG.",

  // ── <video> ───────────────────────────────────────────────────────────
  "<video>::mjml":
    "Replace <video> with an mj-image linking to a video thumbnail.",

  // ── <form> ────────────────────────────────────────────────────────────
  "<form>::mjml":
    "Replace the form with an mj-button linking to a hosted form page.",

  // ── @font-face ────────────────────────────────────────────────────────
  "@font-face::mjml":
    "Use mj-font in mj-head instead of @font-face in mj-style.",

  // ── @media ────────────────────────────────────────────────────────────
  "@media::mjml":
    "MJML generates responsive @media queries automatically. Use mj-breakpoint and mj-column widths.",

  // ── display:flex ──────────────────────────────────────────────────────
  "display:flex::mjml":
    "Use mj-section and mj-column — MJML compiles these to table-based layouts.",

  // ── display:grid ──────────────────────────────────────────────────────
  "display:grid::mjml":
    "Use mj-section and mj-column for grid-like layouts.",

  // ── linear-gradient ───────────────────────────────────────────────────
  "linear-gradient::mjml":
    "Add a background-color attribute on mj-section as a fallback.",

  // ── box-shadow ────────────────────────────────────────────────────────
  "box-shadow::mjml":
    "Use a border attribute on mj-section or mj-column as an alternative.",

  // ── border-radius ─────────────────────────────────────────────────────
  "border-radius::mjml":
    'MJML does not generate VML — border-radius will not render in Outlook. Set border-radius="0" or accept flat corners.',

  // ── max-width ─────────────────────────────────────────────────────────
  "max-width::mjml":
    "Set the width attribute on mj-body or mj-section for maximum compatibility.",

  // ── gap ───────────────────────────────────────────────────────────────
  "gap::mjml":
    "Use padding attribute on mj-column or mj-text for spacing.",

  // ── float ─────────────────────────────────────────────────────────────
  "float::mjml":
    "Use mj-section with multiple mj-column elements for side-by-side layout.",

  // ── background-image ──────────────────────────────────────────────────
  "background-image::mjml":
    "Use background-url attribute on mj-section — MJML generates VML automatically.",

  // ── position ──────────────────────────────────────────────────────────
  "position::mjml":
    "Use mj-section and mj-column for layout positioning.",

  // ── opacity ───────────────────────────────────────────────────────────
  "opacity::mjml":
    "Use solid colors. Most email clients don't support opacity.",

  // ── word-break ────────────────────────────────────────────────────────
  "word-break::mjml":
    "mj-text renders inside a <td>, which helps. Add word-wrap: break-word to the td via mj-style.",
};
