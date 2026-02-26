import type { SupportLevel } from "../types";

/**
 * CSS property support matrix.
 * Last validated: 2026-02-22
 *
 * Each entry maps a CSS property to its support level per email client.
 *
 * Support levels:
 * - "supported": fully supported
 * - "partial": partially supported (with caveats)
 * - "unsupported": not supported at all
 * - "unknown": no data available
 *
 * Data sources by client:
 * - gmail-*, outlook-*, apple-mail-*, yahoo-mail, samsung-mail, thunderbird:
 *     Verified against caniemail.com; inline comments cite specific notes
 *     using caniemail's "#N" notation (e.g. "caniemail: a #2").
 * - hey-mail: NOT in caniemail. Values are inferred from HEY's WebKit-based
 *     rendering engine and documented stripping behaviours (forms, external
 *     stylesheets, fixed/sticky positioning). Treat as best-effort estimates;
 *     empirical verification is recommended before relying on these values.
 * - superhuman: NOT in caniemail. Values are inferred from Superhuman's
 *     Chromium/Blink rendering engine and its documented stripping behaviours
 *     (forms, external stylesheets). Treat as best-effort estimates.
 */
export const CSS_SUPPORT: Record<
  string,
  Record<string, SupportLevel>
> = {
  // --- Layout ---
  "display": {
    "gmail-web": "supported", // block, inline, inline-block, none all work
    "gmail-android": "partial", // basic values only
    "gmail-ios": "partial",
    "outlook-web": "supported",
    "outlook-windows": "partial", // limited values
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "display:flex": {
    "gmail-web": "supported", // caniemail: y
    "gmail-android": "partial", // caniemail: a #1 (non-Google accounts)
    "gmail-ios": "partial", // caniemail: a #1
    "outlook-web": "supported", // caniemail: y
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported", // caniemail: y #2 (no inline-flex)
    "samsung-mail": "supported", // caniemail: y
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "display:grid": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "float": {
    "gmail-web": "supported", // caniemail: y
    "gmail-android": "partial", // caniemail: a #2 (no logical values)
    "gmail-ios": "partial", // caniemail: a #2
    "outlook-web": "supported",
    "outlook-windows": "unsupported", // caniemail: n #1
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial", // caniemail: a #2 (no logical values)
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "position": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "partial", // caniemail: a #2 (sticky only)
    "outlook-windows": "unsupported",
    "apple-mail-macos": "partial", // caniemail: a #1 (no sticky/fixed)
    "apple-mail-ios": "partial", // caniemail: a #1
    "yahoo-mail": "partial", // caniemail: a #3 (relative only)
    "samsung-mail": "partial", // caniemail: a #1
    "thunderbird": "supported",
    "hey-mail": "partial", // relative only; HEY strips fixed/sticky positioning
    "superhuman": "partial", // relative/absolute supported; fixed/sticky stripped
  },

  // --- Box Model ---
  "margin": {
    "gmail-web": "partial", // no negative margins
    "gmail-android": "partial",
    "gmail-ios": "partial",
    "outlook-web": "supported",
    "outlook-windows": "partial", // no auto margins
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "padding": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "partial", // not on <p>, <div>
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "width": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "max-width": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "partial", // caniemail: a #1 (only on <table> elements)
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "height": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "box-sizing": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Typography ---
  "font-family": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "font-size": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "partial", // may auto-resize small text
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "partial",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "font-weight": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "line-height": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "partial", // ignores on some elements
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "letter-spacing": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "partial",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "text-align": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "text-decoration": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "text-transform": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "@font-face": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "partial", // caniemail: a #4 (declaration kept, remote fonts ignored)
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "supported", // caniemail: y #8
    "thunderbird": "supported",
    "hey-mail": "supported", // HEY uses WebKit — web fonts work
    "superhuman": "supported", // Superhuman uses Blink — web fonts work
  },

  // --- Colors & Backgrounds ---
  "color": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "background-color": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "background-image": {
    "gmail-web": "supported", // caniemail: y (restored 2023-08)
    "gmail-android": "supported", // caniemail: y
    "gmail-ios": "supported", // caniemail: y
    "outlook-web": "supported", // caniemail: y
    "outlook-windows": "partial", // caniemail: n #5 (VML workaround)
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial", // caniemail: a #3 (no multiple values)
    "samsung-mail": "supported", // caniemail: y
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "background": {
    "gmail-web": "partial", // color only, no shorthand with images
    "gmail-android": "partial",
    "gmail-ios": "partial",
    "outlook-web": "partial",
    "outlook-windows": "partial",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial",
    "samsung-mail": "partial",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "linear-gradient": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Borders ---
  "border": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "partial", // no shorthand on some elements
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "border-radius": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial", // caniemail: a #2 (no elliptical slash notation)
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "border-collapse": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "supported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "box-shadow": {
    "gmail-web": "unsupported",
    "gmail-android": "partial", // caniemail: a #1 (non-Google accounts)
    "gmail-ios": "partial", // caniemail: a #1
    "outlook-web": "supported", // caniemail: y (since 2023-12)
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "supported", // caniemail: y
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Transforms & Animation ---
  "transform": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "supported",
    "hey-mail": "unsupported", // HEY strips transform for security
    "superhuman": "partial", // Superhuman (Blink) allows some transforms
  },
  "animation": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "unsupported",
    "hey-mail": "unsupported",
    "superhuman": "partial", // Superhuman allows CSS animations but they may be disabled by user settings
  },
  "transition": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "unsupported",
    "hey-mail": "unsupported",
    "superhuman": "unsupported",
  },

  // --- Media & Responsive ---
  "@media": {
    "gmail-web": "partial", // caniemail: a #7 (no height-based, no nested)
    "gmail-android": "partial", // caniemail: a #6 #7
    "gmail-ios": "partial", // caniemail: a #6 #7
    "outlook-web": "partial", // caniemail: a #1 #10 (no nested)
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial", // caniemail: a #2
    "samsung-mail": "partial", // caniemail: a #9
    "thunderbird": "supported",
    "hey-mail": "supported", // HEY is WebKit-based, full @media support
    "superhuman": "supported", // Superhuman is Blink-based, full @media support
  },

  // --- HTML Elements ---
  "<style>": {
    "gmail-web": "partial", // caniemail: a #1 #6 (head only, 16KB limit)
    "gmail-android": "partial", // caniemail: a #1 (head only)
    "gmail-ios": "partial", // caniemail: a #1 #2
    "outlook-web": "supported",
    "outlook-windows": "partial", // caniemail: a #4 (must declare before use)
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "<link>": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "unsupported",
    "hey-mail": "unsupported", // HEY strips external stylesheets
    "superhuman": "unsupported", // Superhuman strips external stylesheets
  },
  "<video>": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "partial",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "unsupported",
    "hey-mail": "unsupported",
    "superhuman": "unsupported",
  },
  "<svg>": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "partial",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "partial",
    "thunderbird": "supported",
    "hey-mail": "partial", // HEY allows SVG but strips some attributes
    "superhuman": "supported", // Superhuman (Blink) renders SVG well
  },
  "<form>": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "supported",
    "hey-mail": "unsupported", // HEY strips forms for security
    "superhuman": "unsupported", // Superhuman strips forms for security
  },

  // --- Text Wrapping ---
  "word-break": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported", // Word engine ignores word-break entirely
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial", // break-all partially works; break-word unreliable
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "overflow-wrap": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported", // Word engine ignores overflow-wrap
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial", // inconsistent support
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "white-space": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "partial", // only normal and nowrap
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "text-overflow": {
    "gmail-web": "unsupported", // Gmail strips overflow, so text-overflow is useless
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Table Layout ---
  "vertical-align": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "partial", // only on <td> elements via valign attribute
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "border-spacing": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported", // use cellspacing attribute instead
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Sizing ---
  "min-width": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported", // Word engine ignores min-width
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "min-height": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported", // Word engine ignores min-height
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "max-height": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Shadows ---
  "text-shadow": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Background Sub-properties ---
  "background-size": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "background-position": {
    "gmail-web": "supported",
    "gmail-android": "supported",
    "gmail-ios": "supported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "partial",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },

  // --- Misc ---
  "opacity": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "overflow": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "partial",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "visibility": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "supported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "supported",
    "samsung-mail": "supported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "gap": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
  "object-fit": {
    "gmail-web": "unsupported",
    "gmail-android": "unsupported",
    "gmail-ios": "unsupported",
    "outlook-web": "unsupported",
    "outlook-windows": "unsupported",
    "apple-mail-macos": "supported",
    "apple-mail-ios": "supported",
    "yahoo-mail": "unsupported",
    "samsung-mail": "unsupported",
    "thunderbird": "supported",
    "hey-mail": "supported",
    "superhuman": "supported",
  },
};

/**
 * CSS properties that Gmail strips from inline styles.
 * Updated per caniemail.com data — Gmail keeps float and display (basic values).
 */
export const GMAIL_STRIPPED_PROPERTIES = new Set([
  "position",
  "overflow",
  "visibility",
  "opacity",
  "box-shadow",
  "text-shadow",
  "transform",
  "animation",
  "transition",
  "box-sizing",
  "object-fit",
  "gap",
]);

/** CSS properties that Outlook Word engine ignores */
export const OUTLOOK_WORD_UNSUPPORTED = new Set([
  "border-radius",
  "box-shadow",
  "text-shadow",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  "float",
  "position",
  "display",
  "overflow",
  "opacity",
  "transform",
  "animation",
  "transition",
  "background-size",
  "background-position",
  "box-sizing",
  "object-fit",
  "gap",
  "word-break",
  "overflow-wrap",
  "text-overflow",
  "border-spacing",
]);

/**
 * Properties that require HTML structural changes (not just CSS swaps)
 * to fix. These cannot be solved by replacing one CSS value with another.
 */
export const STRUCTURAL_FIX_PROPERTIES = new Set([
  "display:flex",
  "display:grid",
  "word-break",
  "overflow-wrap",
  "text-overflow",
  "position",
  "float",
  "gap",
  "max-width",
  "border-radius",
  "background-image",
  "background-size",
  "background-position",
  "<svg>",
  "<video>",
  "<form>",
  "object-fit",
]);
