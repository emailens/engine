/**
 * Manual Superhuman support overrides.
 *
 * Superhuman is NOT in caniemail.com. Values are inferred from Superhuman's
 * Chromium/Blink rendering engine and its documented stripping behaviours
 * (forms, external stylesheets). Treat as best-effort estimates.
 *
 * Format: Record<propertyKey, SupportLevel>
 * Only include overrides — properties not listed here default to "unknown".
 */
import type { SupportLevel } from "../src/types";

export const SUPERHUMAN_OVERRIDES: Record<string, SupportLevel> = {
  // Layout
  "display": "supported",
  "display:flex": "supported",
  "display:grid": "supported",
  "float": "supported",
  "position": "partial",             // relative/absolute supported; fixed/sticky stripped

  // Box Model
  "margin": "supported",
  "padding": "supported",
  "width": "supported",
  "max-width": "supported",
  "height": "supported",
  "box-sizing": "supported",

  // Typography
  "font-family": "supported",
  "font-size": "supported",
  "font-weight": "supported",
  "font-style": "supported",
  "line-height": "supported",
  "letter-spacing": "supported",
  "text-align": "supported",
  "text-decoration": "supported",
  "text-transform": "supported",
  "text-indent": "supported",
  "word-spacing": "supported",
  "@font-face": "supported",        // Blink — web fonts work

  // Colors & Backgrounds
  "color": "supported",
  "background-color": "supported",
  "background-image": "supported",
  "background": "supported",
  "linear-gradient": "supported",
  "radial-gradient": "supported",
  "background-size": "supported",
  "background-position": "supported",
  "background-repeat": "supported",
  "background-origin": "supported",
  "background-clip": "supported",

  // Borders
  "border": "supported",
  "border-radius": "supported",
  "border-collapse": "supported",
  "border-spacing": "supported",
  "box-shadow": "supported",
  "outline": "supported",

  // Transforms & Animation
  "transform": "partial",           // allows some transforms
  "animation": "partial",           // CSS animations may be disabled by user settings
  "transition": "partial",             // Blink supports transitions; may be disabled by user settings
  "@keyframes": "partial",

  // Media & Responsive
  "@media": "supported",            // Blink-based, full @media support

  // HTML Elements
  "<style>": "supported",
  "<link>": "unsupported",          // strips external stylesheets
  "<video>": "unsupported",
  "<svg>": "supported",             // Blink renders SVG well
  "<form>": "unsupported",          // strips forms for security
  "<picture>": "supported",
  "<audio>": "unsupported",

  // Text Wrapping
  "word-break": "supported",
  "overflow-wrap": "supported",
  "white-space": "supported",
  "text-overflow": "supported",

  // Table Layout
  "vertical-align": "supported",

  // Sizing
  "min-width": "supported",
  "min-height": "supported",
  "max-height": "supported",

  // Shadows
  "text-shadow": "supported",

  // Misc
  "opacity": "supported",
  "overflow": "supported",
  "visibility": "supported",
  "gap": "supported",
  "object-fit": "supported",
  "cursor": "supported",
  "list-style": "supported",
  "list-style-type": "supported",
  "direction": "supported",
  "writing-mode": "supported",
  "caption-side": "supported",
  "empty-cells": "supported",
  "table-layout": "supported",
  "object-position": "supported",
  "aspect-ratio": "supported",
  "clip-path": "supported",
  "filter": "supported",
  "backdrop-filter": "supported",
  "mix-blend-mode": "supported",
  "isolation": "supported",
  "resize": "unsupported",
  "pointer-events": "supported",
  "user-select": "supported",
  "accent-color": "supported",
  "caret-color": "supported",
  "content": "supported",
  "counter-increment": "supported",
  "counter-reset": "supported",
  "orphans": "supported",
  "widows": "supported",
  "page-break-before": "supported",
  "page-break-after": "supported",
  "page-break-inside": "supported",
  "columns": "supported",
  "column-count": "supported",
  "column-gap": "supported",
  "column-rule": "supported",
  "column-width": "supported",
  "flex-direction": "supported",
  "flex-wrap": "supported",
  "align-items": "supported",
  "align-self": "supported",
  "justify-content": "supported",
  "order": "supported",
  "flex-grow": "supported",
  "flex-shrink": "supported",
  "flex-basis": "supported",
  "grid-template-columns": "supported",
  "grid-template-rows": "supported",
  "grid-column": "supported",
  "grid-row": "supported",
  "grid-gap": "supported",
  "place-items": "supported",
  "place-content": "supported",
  "z-index": "supported",
  "contain": "supported",
  "will-change": "supported",
  "scroll-behavior": "unsupported",
  "@supports": "supported",
  "@import": "unsupported",         // external resources stripped
  "display:none": "supported",
};
