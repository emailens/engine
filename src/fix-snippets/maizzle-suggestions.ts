/**
 * Maizzle framework-specific suggestion strings.
 * All keys have a ::maizzle suffix in the original SUGGESTION_DATABASE.
 */
export const MAIZZLE_SUGGESTION_DATABASE: Record<string, string> = {
  // ── <style> ───────────────────────────────────────────────────────────
  "<style>::maizzle":
    "Prefer Tailwind utility classes — Maizzle inlines CSS via juice during build (inlineCSS: true in config.js).",
  "<style>:partial::maizzle":
    "Use Tailwind utility classes for critical styles. Maizzle automatically inlines them at build time.",

  // ── <link> ────────────────────────────────────────────────────────────
  "<link>::maizzle":
    "External stylesheets are stripped. Use Tailwind CSS classes — Maizzle inlines them at build time.",

  // ── <svg> ─────────────────────────────────────────────────────────────
  "<svg>::maizzle":
    "Replace inline SVG with an <img> tag pointing to a hosted PNG.",

  // ── <video> ───────────────────────────────────────────────────────────
  "<video>::maizzle":
    "Replace <video> with a linked image thumbnail.",

  // ── <form> ────────────────────────────────────────────────────────────
  "<form>::maizzle":
    "Replace the form with a CTA link/button pointing to a hosted form page.",

  // ── @font-face ────────────────────────────────────────────────────────
  "@font-face::maizzle":
    "Use the googleFonts key in config.js — Maizzle injects the Google Fonts link tag automatically.",

  // ── @media ────────────────────────────────────────────────────────────
  "@media::maizzle":
    "Use Tailwind responsive utility classes and Maizzle's breakpoints config instead of hand-written @media.",

  // ── display:flex ──────────────────────────────────────────────────────
  "display:flex::maizzle":
    "Replace Tailwind flex classes with HTML table + MSO conditional comments for Outlook.",

  // ── display:grid ──────────────────────────────────────────────────────
  "display:grid::maizzle":
    "Replace Tailwind grid classes with HTML table layout for email compatibility.",

  // ── linear-gradient ───────────────────────────────────────────────────
  "linear-gradient::maizzle":
    "Add a bg-[color] Tailwind class as a fallback before the gradient.",

  // ── box-shadow ────────────────────────────────────────────────────────
  "box-shadow::maizzle":
    "Use Tailwind border classes as an alternative to shadow classes.",

  // ── border-radius ─────────────────────────────────────────────────────
  "border-radius::maizzle":
    "Outlook ignores border-radius. Accept flat corners or use MSO conditional VML.",

  // ── max-width ─────────────────────────────────────────────────────────
  "max-width::maizzle":
    "Wrap max-w containers with MSO conditional table for Outlook.",

  // ── gap ───────────────────────────────────────────────────────────────
  "gap::maizzle":
    "Use Tailwind padding classes on child elements instead of gap.",

  // ── float ─────────────────────────────────────────────────────────────
  "float::maizzle":
    "Use HTML tables for side-by-side layout instead of Tailwind float classes.",

  // ── background-image ──────────────────────────────────────────────────
  "background-image::maizzle":
    "Use MSO conditional VML for Outlook background images.",

  // ── position ──────────────────────────────────────────────────────────
  "position::maizzle":
    "Use HTML table layout instead of Tailwind position classes.",

  // ── opacity ───────────────────────────────────────────────────────────
  "opacity::maizzle":
    "Use solid Tailwind color classes instead of opacity.",
};
