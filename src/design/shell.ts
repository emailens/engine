/**
 * Per-client viewport config and rendering shells.
 *
 * Each config approximates the real reading pane dimensions, default fonts,
 * and wrapper DOM that the actual email client injects around the message.
 * Shared between the screenshot pipeline and live preview rendering.
 *
 * Viewport notes:
 * - Gmail Web: media queries see the browser window (1280 measured), not the pane
 * - Gmail Android: Pixel 7-class device, 412dp × 915dp, 2.6x
 * - Gmail iOS: iPhone 14-class device, 390pt × 844pt, 3x
 * - Outlook Web (OWA): side panel reading pane (~556px content)
 * - Outlook Windows (new): native app reading pane
 * - Outlook Windows Legacy: Word-engine reading pane
 * - Apple Mail macOS: default 3-column layout, Retina
 * - Apple Mail iOS: iPhone 14-class, full-width message view
 * - Yahoo Mail: reading pane, side panel mode
 * - Samsung Mail: Galaxy S-class device
 * - Thunderbird: default 3-pane layout, classic density
 * - HEY: side reading pane
 * - Superhuman: reading pane (split view)
 */

import { resolveMsoBranch } from "../vml-render";

export interface ClientViewport {
  width: number;
  height: number;
  /** Pixel density , standardised to 2 for consistent screenshot quality */
  deviceScaleFactor: number;
  isMobile?: boolean;
}

/**
 * Client rendering shell , wraps the transformed HTML in a container
 * that mimics the wrapper DOM and default styles each client applies.
 */
export interface ClientShell {
  /** Default font stack the client applies to the message container */
  fontFamily: string;
  /** Background color of the reading pane (light mode) */
  paneBg: string;
  /** Background color of the reading pane (dark mode) */
  paneBgDark: string;
  /** Max width constraint the client imposes on the message, if any */
  maxWidth?: number;
  /** Horizontal padding (px) the client adds around the message */
  paddingX: number;
  /** Vertical padding (px) the client adds above/below the message */
  paddingY: number;
  /** Extra CSS the client injects (resets, overrides) */
  extraCss?: string;
  /** Unstyled text's colour in light mode; dark mode keeps the browser's. */
  textColor?: string;
  /**
   * The root font size the client lays the message out with, which every
   * `rem` is measured from; the browser's 16px when absent.
   */
  rootFontSize?: number;
}

export const CLIENT_VIEWPORTS: Record<string, ClientViewport> = {
  // Desktop web clients , all at 2x for consistent quality.
  // A width here is the one the email's media queries see, for a typical
  // reader, which is not always the pane. A probe turning one row per 20px
  // from "no" to "yes" (real-device run iZKliVgqbOoW, 2026-10-28) showed what
  // each client measures against: Gmail and Yahoo web the browser window,
  // Proton its message frame (880 in a 1280 window), Apple Mail and Outlook
  // for Mac the message view (1420 and 1380 in the capture rig's full-width
  // window, a best case readers rarely have).
  // So: Gmail and Yahoo at 1280, the low end of common desktop windows
  // (1366-1920 are typical); Proton at 880, its frame in that window; the
  // Mac clients at 900, an estimate (no usage data) of the message pane in
  // the default three-column layout on a 13-14" MacBook. What decides a
  // layout is which side of the email's breakpoint the width falls, and
  // breakpoints sit at 480-700px: the old 620-640px fell inside that band and
  // stacked columns the real clients showed side by side (8 of 17 breaks in
  // the 2026-10-28 agreement run). Not measured: the rest keep earlier
  // estimates.
  "gmail-web": { width: 1280, height: 900, deviceScaleFactor: 2 },
  "outlook-web": { width: 680, height: 900, deviceScaleFactor: 2 },
  "outlook-windows": { width: 620, height: 900, deviceScaleFactor: 2 },
  // Word lays out at 600px. Measured on the John Lewis Testi shots: 96 DPI content
  // is 692px wide, 120 DPI is 866px (1.25x), 150 DPI is 1038px (1.50x). Same
  // breaks, scaled. One viewport covers every DPI variant.
  "outlook-windows-legacy": { width: 1139, height: 900, deviceScaleFactor: 2 },
  "apple-mail-macos": { width: 900, height: 900, deviceScaleFactor: 2 },
  "yahoo-mail": { width: 1280, height: 900, deviceScaleFactor: 2 },
  thunderbird: { width: 660, height: 900, deviceScaleFactor: 2 },
  "hey-mail": { width: 580, height: 900, deviceScaleFactor: 2 },
  superhuman: { width: 600, height: 900, deviceScaleFactor: 2 },
  "outlook-macos": { width: 900, height: 900, deviceScaleFactor: 2 },
  protonmail: { width: 880, height: 900, deviceScaleFactor: 2 },
  aol: { width: 680, height: 900, deviceScaleFactor: 2 },
  fastmail: { width: 600, height: 900, deviceScaleFactor: 2 },

  // Mobile clients , real per-device CSS (device-independent px) widths, 2x.
  // iOS = iPhone 14/15/16 class (393). Android Gmail/Outlook = Pixel class (412).
  // Samsung = Galaxy S class (360). These drive both the live preview frame
  // width and the screenshot viewport, so they must be the true device widths.
  // Gmail Android is the width of its message view, not the screen: a probe on
  // the worker's Pixel-class Gmail painted a full-width bar 956 of 1038 device
  // px at 2.625 px per CSS px (2026-11-04).
  "gmail-android": {
    width: 396,
    height: 915,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  "gmail-ios": {
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  "outlook-ios": {
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  "outlook-android": {
    width: 412,
    height: 915,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  "apple-mail-ios": {
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  // Yahoo's two apps had no entry here at all and fell through to
  // DEFAULT_VIEWPORT, a 640px desktop pane, so the engine called them mobile
  // (both are category "mobile", and the mobile-only findings are scoped off
  // that) while the preview drew them as a desktop client. Same device sizes as
  // their platform siblings above: there is nothing Yahoo-specific about the
  // hardware.
  "yahoo-mail-android": {
    width: 412,
    height: 915,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  "yahoo-mail-ios": {
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    isMobile: true,
  },
  "samsung-mail": {
    width: 360,
    height: 800,
    deviceScaleFactor: 2,
    isMobile: true,
  },
};

/**
 * The width a client's preview is laid out at, so its media queries see
 * what the real client's do: a phone's device width, a desktop client's
 * pane. 600, the email's own width, only when no client is named.
 */
export function layoutWidth(clientId: string | null | undefined): number {
  return CLIENT_VIEWPORTS[clientId ?? ""]?.width ?? 600;
}

export const DEFAULT_VIEWPORT: ClientViewport = {
  width: 640,
  height: 900,
  deviceScaleFactor: 2,
};

/** Viewport width used for non-responsive emails on mobile (shrink-to-fit). */
export const MOBILE_SHRINK_WIDTH = 640;

/**
 * Clients that trigger prefers-color-scheme: dark for the email content.
 * These clients honor the email's own @media (prefers-color-scheme: dark) CSS.
 * Other clients (Gmail, Outlook, Yahoo) either force-invert colors or do nothing ,
 * the engine's simulateDarkMode() handles those cases by rewriting the HTML directly.
 *
 * For screenshots: set Playwright's colorScheme to "dark" ONLY for these clients.
 * For live preview: inject <meta name="color-scheme" content="dark"> for these clients.
 */
const PREFERS_COLOR_SCHEME_CLIENTS = new Set([
  "apple-mail-macos",
  "apple-mail-ios",
  "samsung-mail",
  "hey-mail",
  "superhuman",
  "outlook-macos",
  "protonmail",
  "fastmail",
]);

/**
 * Whether a client triggers prefers-color-scheme: dark for the email.
 * Used to determine if the browser/iframe should activate dark color scheme.
 */
export function clientTriggersPrefersColorScheme(clientId: string): boolean {
  return PREFERS_COLOR_SCHEME_CLIENTS.has(clientId);
}

/** Maximum screenshot height in CSS pixels (5 screenfuls). */
export const MAX_SCREENSHOT_HEIGHT = 4500;

/**
 * Per-client rendering shells.
 * These approximate the container styles each email client wraps around
 * the message HTML , font stacks, padding, background, width constraints.
 */
export const CLIENT_SHELLS: Record<string, ClientShell> = {
  "gmail-web": {
    // The message body's own font and colour, not Gmail's interface font:
    // 99 of 103 worker captures (the rest set their own), 2026-11-09.
    fontFamily: "Arial, Helvetica, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#1f1f1f",
    // No inset: real captures (agreement run 2026-10-28) show an email's own
    // background running to the edges of the message view.
    paddingX: 0,
    paddingY: 0,
    // The message body (div.a3s) in a 1280px window: 796px wide in every one
    // of 103 worker captures (fidelity bench, 2026-11-09). A fluid email
    // fills that, not the window.
    maxWidth: 796,
    // Gmail wraps in .a3s.aiL with overflow:hidden
    // Unstyled text, measured on the real client (fidelity sheet 04-typography c01, c20): 13px, on lines 1.5 times the font size.
    extraCss:
      "word-wrap:break-word;overflow:hidden;font-size:13px;line-height:1.5;color:#222;",
  },
  "gmail-android": {
    fontFamily: "Roboto, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#131313",
    paddingX: 16,
    paddingY: 0,
    // Unstyled text, fitted on real run C93iCoVV5yas (2026-11-03): only 12px
    // reproduces its six paragraph wraps and its alt-text boxes.
    extraCss: "word-wrap:break-word;overflow:hidden;font-size:12px;",
  },
  "gmail-ios": {
    fontFamily: "-apple-system, Roboto, Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#202125",
    paddingX: 16,
    paddingY: 0,
    extraCss: "word-wrap:break-word;overflow:hidden;",
  },
  "outlook-web": {
    fontFamily:
      "'Segoe UI', 'Segoe UI Web (West European)', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#292929",
    paddingX: 20,
    paddingY: 16,
    // Unstyled text, measured on the real client (fidelity sheet 04-typography c01, c20): 15px.
    extraCss: "line-height:normal;font-size:15px;",
  },
  "outlook-windows": {
    fontFamily: "'Segoe UI', Calibri, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#292929",
    // None: the viewport is the pane's body area, edge to edge on the real
    // client (worker's new Outlook, pane 620 CSS px, 2026-11-10).
    paddingX: 0,
    paddingY: 12,
    // Unstyled text on the worker's new Outlook (heldout-theresanaiforthat,
    // 2026-11-10): 15px, as on the web, in Fluent's #242424.
    textColor: "#242424",
    extraCss: "line-height:normal;font-size:15px;",
  },
  "outlook-ios": {
    fontFamily:
      "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#111111",
    paddingX: 16,
    paddingY: 0,
    extraCss: "line-height:normal;",
  },
  "outlook-android": {
    fontFamily: "Roboto, 'Segoe UI', Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#111111",
    paddingX: 16,
    paddingY: 0,
    extraCss: "line-height:normal;",
  },
  "outlook-windows-legacy": {
    // Word's default on current Outlook is Aptos (probe outlook-word-flow,
    // 2026-10-31). It is not bundled; Selawik is the nearest metric.
    fontFamily: "Aptos, 'Segoe UI', Selawik, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#262626",
    paddingX: 16,
    paddingY: 12,
    extraCss: "line-height:normal;",
  },
  "apple-mail-macos": {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    // Apple leaves authored colors alone. The message canvas stays white.
    paneBgDark: "#ffffff",
    // No inset: real captures (agreement run 2026-10-28) show an email's own
    // background running to the edges of the message view.
    paddingX: 0,
    paddingY: 0,
    // Unstyled text, measured on the real client (fidelity sheet 04-typography c01, c20): 12px.
    extraCss: "font-size:12px;",
    // And rem is measured from the same 12px: every gap two React Email
    // templates wrote in rem came out 0.70 to 0.90 of a 16px rem on a real
    // Apple Mail, text heights unchanged (AI Fix real-device round,
    // 2026-10-23). Previewed at 16px, the design was 30% taller than the
    // one readers see, and a fix matched to it overshot.
    rootFontSize: 12,
  },
  "apple-mail-ios": {
    fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#ffffff",
    paddingX: 16,
    paddingY: 8,
  },
  "yahoo-mail": {
    fontFamily: "'Helvetica Neue', Helvetica, Arimo, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#323232",
    // No inset: real captures (agreement run 2026-10-28) show an email's own
    // background running to the edges of the message view.
    paddingX: 0,
    paddingY: 0,
    // Yahoo collapses margins on the wrapper
    // Unstyled text, measured on the real client (fidelity sheet 04-typography c01, c20): 13px.
    extraCss: "margin:0;font-size:13px;",
  },
  "yahoo-mail-android": {
    fontFamily: "Roboto, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#323232",
    paddingX: 16,
    paddingY: 0,
    // Same wrapper margin collapse as Yahoo on the web: it is the same renderer.
    extraCss: "margin:0;",
  },
  "yahoo-mail-ios": {
    fontFamily: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#323232",
    paddingX: 16,
    paddingY: 8,
    extraCss: "margin:0;",
  },
  "samsung-mail": {
    fontFamily: "Roboto, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#1a1a1a",
    paddingX: 16,
    paddingY: 0,
  },
  thunderbird: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#18181a",
    paddingX: 8,
    paddingY: 0,
  },
  "hey-mail": {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#1a1a1a",
    paddingX: 24,
    paddingY: 16,
    maxWidth: 680,
  },
  superhuman: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#1a1a1a",
    paddingX: 20,
    paddingY: 12,
  },
  "outlook-macos": {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#111111",
    // No inset: real captures (agreement run 2026-10-28) show an email's own
    // background running to the edges of the message view.
    paddingX: 0,
    paddingY: 0,
    // Unstyled text, measured on the real client (fidelity sheet 04-typography c01, c20): 11pt.
    extraCss: "line-height:normal;font-size:14.67px;",
  },
  protonmail: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#1b1b24",
    // No inset: real captures (agreement run 2026-10-28) show an email's own
    // background running to the edges of the message view.
    paddingX: 0,
    paddingY: 0,
  },
  aol: {
    fontFamily: "'Helvetica Neue', Helvetica, Arimo, Arial, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#323232",
    paddingX: 20,
    paddingY: 0,
    // Unstyled text, measured on the real client (fidelity sheet 04-typography c01, c20): 13px.
    extraCss: "margin:0;font-size:13px;",
  },
  fastmail: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paneBg: "#ffffff",
    paneBgDark: "#1e1e1e",
    paddingX: 20,
    paddingY: 16,
  },
};

const DEFAULT_SHELL: ClientShell = {
  fontFamily: "Arial, Helvetica, Arimo, sans-serif",
  paneBg: "#ffffff",
  paneBgDark: "#1a1a1a",
  paddingX: 16,
  paddingY: 0,
};

// Clients that render fixed-width images without constraining them to the
// reading pane. The Word engine (Outlook Classic) lets wide images overflow.
// Gmail web does too, and keeps each image's height attribute: measured
// 2026-11-09 by the fidelity bench's DOM judge, 624 images in 103 emails,
// max-width "none" unless the email set one. Yahoo and Proton the same,
// 2026-11-10 (409 of 585, 335 of 474): the fit drew konsav's 50px icons at 27
// and collapsed Barebone's 48px images to 0 in shrink-to-fit cells. Other
// clients are unmeasured.
// ponytail: one exception set beats an accurate-per-shell flag nobody reads.
const NO_IMAGE_CONSTRAINT = new Set([
  "outlook-windows-legacy",
  "gmail-web",
  "yahoo-mail",
  "protonmail",
]);

// Clients that "munge" non-responsive emails. Gmail on Android reflows a
// fixed-width email to the device width , it strips width/min-width off tables,
// cells and images and forces width:auto + white-space:normal, so a 600px
// layout stacks and wraps to fit the screen. It does NOT uniformly scale the
// page down the way iOS clients (Apple Mail, Gmail iOS) do. iOS never munges.
// So a munge client renders 1:1 at device width (the CSS below does the
// fitting) instead of the shrink-to-fit scaling the preview applies elsewhere.
const MUNGE_CLIENTS = new Set(["gmail-android"]);

/** Whether a client reflows ("munges") non-responsive emails to device width. */
export function isMungeClient(clientId: string): boolean {
  return MUNGE_CLIENTS.has(clientId);
}

// Approximates Gmail Android's munge: reflow tables/cells to fit, wrap text,
// keep images within the viewport. !important so it beats inline widths.
const MUNGE_STYLE = `<style>table{width:auto!important;table-layout:auto!important;max-width:100%!important}td,th{width:auto!important;white-space:normal!important}img{max-width:100%!important;height:auto!important}</style>`;

/** The width emails are conventionally built to. */
const EMAIL_WIDTH = 600;

/**
 * A client with a message column (Gmail web's 796px div.a3s) paints the
 * email's background in the column only; the pane around it stays its own.
 */
function shellBackgrounds(
  shell: ClientShell,
  mode: "light" | "dark",
  canvas?: string,
): { bg: string; columnBg: string } {
  const pane = mode === "dark" ? shell.paneBgDark : shell.paneBg;
  const columnBg = shell.maxWidth && canvas ? `background:${canvas};` : "";
  return { bg: columnBg ? pane : (canvas ?? pane), columnBg };
}

/**
 * On a desktop client the side padding must leave room for a 600px email.
 * Where it did not, the email started after the left padding and ran off the
 * right edge: a white strip down the left and none on the right, which no
 * real client shows. The padding gives way before the email does.
 * ponytail: 600 is the conventional email width, not a measured one per
 * email; a wider email still overflows, as it does in the real pane.
 */
function sidePadding(clientId: string, paddingX: number): number {
  const vp = CLIENT_VIEWPORTS[clientId];
  if (!vp || vp.isMobile) return paddingX;
  return Math.min(
    paddingX,
    Math.max(0, Math.floor((vp.width - EMAIL_WIDTH) / 2)),
  );
}

/**
 * Build the wrapping style tag for screenshot capture.
 * Injects the client-specific shell (font, padding, background, container constraints)
 * to approximate how the real email client presents the message.
 */
export function buildShellStyle(
  clientId: string,
  mode: "light" | "dark",
  authoredFont = false,
  canvas?: string,
): string {
  const shell = CLIENT_SHELLS[clientId] ?? DEFAULT_SHELL;
  const { bg, columnBg } = shellBackgrounds(shell, mode, canvas);
  const maxWidthRule = shell.maxWidth ? `max-width:${shell.maxWidth}px;` : "";
  const extra = shell.extraCss ?? "";
  const paddingX = sidePadding(clientId, shell.paddingX);
  // Constrain images to the pane (prevents wide fixed-size images from
  // overflowing), except where the real client lets them overflow.
  const imgRule = NO_IMAGE_CONSTRAINT.has(clientId)
    ? ""
    : ".emailens-shell img{max-width:100%;height:auto}";

  // The outer body renders the reading pane chrome.
  // The inner .emailens-shell wraps the message content with client-specific
  // padding, fonts, and width constraints , matching what the real client does.
  // No flexbox on body , email content centers itself via margin:0 auto
  // or <table align="center">. Flexbox centering causes wide emails to
  // shift off-viewport when the content exceeds the reading pane width
  // (flex min-width:auto expands the shell, then align-items:center
  // centers the oversized shell at a negative x offset).
  // No overflow:hidden on this shell rule. A client that clips (Gmail) puts
  // that in extraCss, and the canvas clips the same way. The screenshot keeps
  // this viewport and extends the clip to whatever still paints past it.
  // No !important: an email that sets its own root size keeps it.
  const rootRule = shell.rootFontSize
    ? `html{font-size:${shell.rootFontSize}px}`
    : "";
  return `<style>
${rootRule}
html,body{margin:0!important;padding:0!important;background:${bg}!important}
.emailens-shell{
  ${authoredFont ? "" : `font-family:${shell.fontFamily};`}
  padding:${shell.paddingY}px ${paddingX}px;
  ${columnBg}
  ${maxWidthRule}
  width:100%;
  box-sizing:border-box;
  ${mode === "light" && shell.textColor ? `color:${shell.textColor};` : ""}
  ${extra}
}
${imgRule}
</style>`;
}

/**
 * Inject a <style> tag into an HTML document.
 * Inserts before </head> if present, after <head> as fallback,
 * or wraps in a full document structure.
 */
export function injectStyleIntoHtml(html: string, style: string): string {
  if (html.includes("</head")) {
    return html.replace(/<\/head>/i, `${style}</head>`);
  }
  if (html.includes("<head")) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${style}`);
  }
  return `<!DOCTYPE html><html><head>${style}</head><body>${html}</body></html>`;
}

/**
 * Check if the email HTML is responsive (has mobile-targeted media queries
 * or a device-width viewport meta tag). Non-responsive emails should skip
 * mobile screenshots since they don't reflow to narrow viewports.
 */
export function isResponsiveEmail(html: string): boolean {
  // Viewport meta with device-width (order-independent attribute matching)
  if (
    /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html) &&
    /width=device-width/i.test(html)
  ) {
    return true;
  }
  // Media queries targeting widths under 800px (both min-width and max-width)
  // Only match inside <style> blocks to avoid false positives from prose/comments
  const styleBlocks = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  for (const block of styleBlocks) {
    if (
      /@media[^{]*(max-width|min-width)\s*:\s*\d{1,3}(px|em|rem)/i.test(block)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Wrap the email HTML inside the client shell container.
 * Inserts a `.emailens-shell` div around <body> content to apply
 * client-specific padding, fonts, and constraints.
 */
// Text properties a child inherits from the email's <body>.
const INHERITED_TEXT =
  /^(color|font|font-family|font-size|font-style|font-weight|line-height|letter-spacing|word-spacing|text-align|text-transform)$/;

const propOf = (d: string) => d.split(":")[0]?.trim().toLowerCase() ?? "";

/**
 * A client draws the body's text styles inside its own container, so they
 * beat the client's defaults (Gmail turns <body> into a div inside .a3s).
 * Under the shell they lost: Neon's 16px body came out at the shell's 13px
 * (fidelity bench, 2026-11-09). They go on a wrapper inside the shell.
 * Quotes in either form (the engine writes &quot;) become ', so the split on
 * ";" cannot cut an entity and the wrapper's "..." stays whole.
 */
function bodyTextStyle(bodyAttrs: string): string {
  const attr = bodyAttrs.match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (attr?.[1] ?? attr?.[2] ?? "")
    .replace(/&quot;|&#34;|&#39;|&apos;|"/gi, "'")
    .split(";")
    .filter((d) => INHERITED_TEXT.test(propOf(d)))
    .join(";");
}

/** The body's attributes without layout properties that fight the shell. */
function withoutShellLayout(bodyAttrs: string): string {
  return bodyAttrs.replace(
    /\s+style\s*=\s*["']([^"']*)["']/gi,
    (_match, styles: string) => {
      const cleaned = styles
        .split(";")
        .filter(
          (s) =>
            !/^(display|flex|grid|justify|align-items|align-content|position|overflow)/.test(
              propOf(s),
            ),
        )
        .join(";")
        .trim();
      return cleaned ? ` style="${cleaned}"` : "";
    },
  );
}

export function wrapInShell(html: string): string {
  // If there's a <body>, sanitize its inline style , strip layout properties
  // that fight our shell (display, flex, grid, position, overflow) but
  // PRESERVE visual properties (background, color, font, etc.).
  const bodyMatch = html.match(/(<body)([^>]*)(>)([\s\S]*?)(<\/body>)/i);
  if (bodyMatch) {
    const inherited = bodyTextStyle(bodyMatch[2]);
    const inner = inherited
      ? `<div style="${inherited}">${bodyMatch[4]}</div>`
      : bodyMatch[4];
    const bodyAttrs = withoutShellLayout(bodyMatch[2]);
    return html.replace(
      bodyMatch[0],
      `${bodyMatch[1]}${bodyAttrs}${bodyMatch[3]}<div class="emailens-shell">${inner}</div>${bodyMatch[5]}`,
    );
  }
  // No <body> , wrap the whole thing
  return `<div class="emailens-shell">${html}</div>`;
}

// ── Post-transform DOM mutations ────────────────────────────────────
// These reproduce what real email clients do to the HTML after receiving
// the message, class rewrites, wrapper elements, style limits, MSO
// conditional handling, and font loading.

/** Gmail's hard limit on <style> block size in <head>. */
const GMAIL_STYLE_LIMIT = 16_384; // 16 KB

/**
 * Apply per-client DOM mutations to the transformed HTML before
 * screenshot capture. This improves accuracy by reproducing what real
 * email clients do to the message DOM at render time.
 *
 * Mutations include:
 * - Gmail: `.a3s.aiL` wrapper, id stripping, link target rewriting,
 *          16KB <style> limit enforcement
 * - Yahoo: `yiv` prefix on class names and IDs
 * - Outlook Classic: unwrap MSO conditional comments (show [if mso] content)
 * - All: inject web fonts for accurate font rendering
 */
// Real Proton web, read from the delivered DOM (fidelity/probes/proton-flex.ts,
// 2026-11-04, 52 cases): these go from an inline style that also holds a
// property Proton keeps, which it then writes back without spaces. A style made
// only of them is left as written. Flex columns fell to their content width
// (TmXr3QgioWat, 67kQNJs1WDeQ). Kept, measured: border-radius, opacity,
// max/min-width, overflow, column-gap, display:grid, background-size.
// ponytail: the measured names only; untested relatives (justify-items,
// grid-template-rows, place-content) are kept until a probe says otherwise.
const PROTON_DROPPED = new Set([
  "flex",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "flex-direction",
  "flex-wrap",
  "flex-flow",
  "justify-content",
  "align-items",
  "align-self",
  "align-content",
  "place-items",
  "order",
  "gap",
  "row-gap",
  "grid-template-columns",
  "box-shadow",
  "transform",
  "text-shadow",
  "aspect-ratio",
  "filter",
]);

function dropProtonMixedProperties(html: string): string {
  return html.replace(
    /(\sstyle\s*=\s*")([^"]*)(")/gi,
    (all, open, style, close) => {
      const decls = style
        .split(";")
        .map((d: string) => d.trim())
        .filter(Boolean);
      const dropped = (d: string) =>
        PROTON_DROPPED.has(d.slice(0, d.indexOf(":")).trim().toLowerCase());
      if (decls.every(dropped) || !decls.some(dropped)) return all;
      const kept = decls
        .filter((d: string) => !dropped(d))
        .map((d: string) => d.replace(/\s*:\s*/, ":"));
      return `${open}${kept.join(";")}${close}`;
    },
  );
}

export function applyClientMutations(html: string, clientId: string): string {
  let result = html;

  // ── Client-specific mutations ──
  if (isGmailClient(clientId)) {
    result = applyGmailMutations(result);
    // The engine inlines every @media rule, so both the desktop and the mobile
    // hero get display:block!important and both paint. Gmail web and iOS still
    // apply the query, so the inline copy has to come off.
    if (clientId !== "gmail-android") result = undoInlinedWidthMedia(result);
  } else if (isYahooClient(clientId)) {
    result = applyYahooMutations(result);
  } else if (clientId === "outlook-windows-legacy") {
    result = applyOutlookClassicMutations(result);
  } else if (clientId === "protonmail") {
    result = dropProtonMixedProperties(result);
  }
  // Yahoo and AOL once had john-lewis rules here (inline display:none wins, a
  // class-styled link is text, multi-value radii are square). A probe showed the
  // cause: they drop a <style> whose @media is a comma list (engine 0.18.0), and
  // a kept stylesheet behaves normally (run IY_C34Eh_aJ5, 2026-10-29).
  if (clientId === "outlook-ios" || clientId === "thunderbird") {
    // Hero stays display:none. The button still paints, unlike Yahoo.
    result = lockInlineDisplayNone(result);
  }
  if (clientId === "outlook-web" || clientId === "outlook-windows-legacy") {
    result = dropHiddenBreaks(result);
  }
  // ponytail: Outlook.com glues the hidden break, then wraps the long word inside the fixed-width link.
  if (clientId === "outlook-web") {
    result = injectStyleIntoHtml(
      result,
      `<style>a{overflow-wrap:anywhere}</style>`,
    );
  }

  // Gmail Android munges non-responsive emails , reflow to fit the device
  // width. Injected last so it is not stripped by Gmail's 16KB <style> purge
  // and so its !important rules override the email's fixed widths. Responsive
  // emails honour their own media queries and are left alone.
  if (isMungeClient(clientId) && !isResponsiveEmail(html)) {
    result = injectStyleIntoHtml(result, MUNGE_STYLE);
  }
  if (clientId === "gmail-android")
    result = zoomText(result, GMAIL_ANDROID_TEXT_ZOOM);

  // A bgcolor bar in a max-height:0 div overflows on purpose: it paints the
  // previous section's colour behind the next section's rounded top corners.
  // Real Apple Mail, Gmail, Outlook for Mac and Proton all show it (john-lewis,
  // agreement run 2026-10-28), so it is no longer clipped here.

  return applyClientTargeting(result, clientId);
}

// Gmail Android draws text 1.073x and leaves boxes alone: on the worker's
// Gmail a 16px ruler with a 24px line drew 1.073x wide in two probes, short
// and long text alike, while a 300x200 box painted at exactly 2.625 px per CSS
// px (2026-11-04). Relative sizes (em, %, unitless) follow their parent.
const GMAIL_ANDROID_TEXT_ZOOM = 1.073;

// ponytail: absolute px/pt in font-size and line-height only; the `font`
// shorthand, keywords and <font size> keep their size until an email needs them.
function zoomText(html: string, zoom: number): string {
  return html.replace(
    /\b(font-size|line-height)(\s*:\s*)(\d*\.?\d+)(px|pt)\b/gi,
    (_, prop, sep, n, unit) =>
      `${prop}${sep}${Math.round(Number(n) * zoom * 100) / 100}${unit}`,
  );
}

function isGmailClient(clientId: string): boolean {
  return (
    clientId === "gmail-web" ||
    clientId === "gmail-android" ||
    clientId === "gmail-ios"
  );
}

/**
 * Yahoo's quirks are the renderer's, not the web client's, so all three get
 * them. This was keyed to "yahoo-mail" alone while Gmail was already handled as
 * a family, which is the asymmetry that left the two Yahoo apps rendering as a
 * generic desktop client.
 */
function isYahooClient(clientId: string): boolean {
  return (
    clientId === "yahoo-mail" ||
    clientId === "yahoo-mail-android" ||
    clientId === "yahoo-mail-ios"
  );
}

/**
 * Gmail mutations:
 * 1. Wrap message body in `.a3s.aiL` (Gmail's real wrapper class)
 * 2. Strip `id` attributes (Gmail removes them)
 * 3. Force `target="_blank"` on all <a> tags
 * 4. Enforce 16KB <style> limit , strip all <style> if total exceeds
 */
function applyGmailMutations(html: string): string {
  let result = html;

  // Gmail drops a whole <style> block that contains the Outlook \0 hack.
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (block) =>
    /\\0/.test(block) ? "" : block,
  );

  // 1. Enforce 16KB <style> limit
  const styleBlocks = result.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  const totalStyleBytes = styleBlocks.reduce((sum, block) => {
    const content = block.replace(/<\/?style[^>]*>/gi, "");
    return sum + new TextEncoder().encode(content).byteLength;
  }, 0);

  if (totalStyleBytes > GMAIL_STYLE_LIMIT) {
    // Gmail strips ALL styles when total exceeds 16KB
    result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  }

  // 2. Strip id attributes (Gmail removes them from message content)
  result = result.replace(
    /(<[a-z][a-z0-9]*\s[^>]*?)\s+id\s*=\s*["'][^"']*["']/gi,
    "$1",
  );

  // 3. Force target="_blank" on all links (Gmail rewrites all link targets)
  result = result.replace(
    /(<a\s)([^>]*?)(>)/gi,
    (match, open, attrs, close) => {
      const withoutTarget = attrs.replace(
        /\s*target\s*=\s*["'][^"']*["']/gi,
        "",
      );
      return `${open}${withoutTarget} target="_blank"${close}`;
    },
  );

  // 4. Wrap body content in Gmail's .a3s.aiL container
  const bodyMatch = result.match(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i);
  if (bodyMatch) {
    result = result.replace(
      bodyMatch[0],
      `${bodyMatch[1]}<div class="a3s aiL">${bodyMatch[2]}</div>${bodyMatch[3]}`,
    );
  }

  return result;
}

// Declarations that live only inside a width @media query. Keyed by class.
function widthMediaClassDecls(css: string): Map<string, string[]> {
  const drops = new Map<string, string[]>();
  let i = 0;
  while (i < css.length) {
    const at = css.toLowerCase().indexOf("@media", i);
    if (at === -1) break;
    const open = css.indexOf("{", at);
    if (open === -1) break;
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const prelude = css.slice(at, open);
    const body = css.slice(open + 1, j - 1);
    i = j;
    // A colour-scheme query pinned to this preview reads as a width query; skip it.
    if (prelude.includes(NEVER_MATCHES) || prelude.includes(ALWAYS_MATCHES))
      continue;
    if (!/(?:min|max)-width/i.test(prelude)) continue;
    for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = rule[2]
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean);
      if (decls.length === 0) continue;
      for (const sel of rule[1].split(",")) {
        const name = sel.trim().match(/^\.([A-Za-z_][\w-]*)$/)?.[1];
        if (!name) continue;
        drops.set(name, [...(drops.get(name) ?? []), ...decls]);
      }
    }
  }
  return drops;
}

function undoInlinedWidthMedia(html: string): string {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");
  const drops = widthMediaClassDecls(css);
  if (drops.size === 0) return html;
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return html.replace(
    /<([a-z][\w:-]*)\b([^>]*?)>/gi,
    (whole, _tag, attrs: string) => {
      const classes =
        /class\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs)?.[2]?.split(/\s+/) ?? [];
      const banned = new Set(
        classes.flatMap((name) => drops.get(name) ?? []).map(norm),
      );
      if (banned.size === 0 || !/\sstyle\s*=/i.test(attrs)) return whole;
      return whole.replace(
        /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/i,
        (_s, lead, quote, style: string) => {
          const next = style
            .split(";")
            .map((part) => part.trim())
            .filter((part) => part && !banned.has(norm(part)))
            .join("; ");
          return `${lead}${quote}${next}${quote}`;
        },
      );
    },
  );
}

function retouchStyle(
  html: string,
  edit: (style: string) => string | null,
): string {
  return html.replace(
    /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi,
    (whole, lead, quote, style) => {
      const next = edit(style);
      return next == null ? whole : `${lead}${quote}${next}${quote}`;
    },
  );
}

function lockInlineDisplayNone(html: string): string {
  return retouchStyle(html, (style) =>
    /display\s*:\s*none/i.test(style) &&
    !/display\s*:\s*none\s*!important/i.test(style)
      ? style.replace(/display\s*:\s*none/gi, "display:none!important")
      : null,
  );
}

/**
 * Yahoo prepends "yiv" + a numeric hash to all class names and IDs
 * to namespace the email within the webmail page. We use a fixed hash
 * for deterministic screenshots.
 */
function applyYahooMutations(html: string): string {
  const prefix = YAHOO_WRAPPER_ID;
  let result = html;

  // Prefix class names in class="" attributes
  result = result.replace(
    /\bclass\s*=\s*"([^"]*)"/gi,
    (_match, classes: string) => {
      const prefixed = classes
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => (c === "emailens-shell" ? c : `${prefix}${c}`))
        .join(" ");
      return `class="${prefixed}"`;
    },
  );

  // Prefix id values
  result = result.replace(
    /\bid\s*=\s*"([^"]*)"/gi,
    (_match, id: string) => `id="${prefix}${id}"`,
  );

  // Prefix class and id selectors in <style> blocks. Ids are prefixed in the
  // markup above, so an `#id` rule has to follow or it stops matching; real
  // Yahoo applied one (fidelity sheet 07-style-delivery c03). The lookahead
  // keeps this to selectors: a `#` inside a declaration is a colour.
  result = result.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open: string, css: string, close: string) => {
      const prefixedCss = css
        .replace(/\.([a-zA-Z_][\w-]*)/g, (_m, name: string) =>
          name === "emailens-shell" ? `.${name}` : `.${prefix}${name}`,
        )
        .replace(
          /#([a-zA-Z_][\w-]*)(?=[^{};]*\{)/g,
          (_m, name: string) => `#${prefix}${name}`,
        );
      return `${open}${prefixedCss}${close}`;
    },
  );

  return activateAmpersandTarget(applyYahooCssQuirks(result), prefix);
}

// Every Word fix that must run on the source, before the engine parses it.
export function prepareWordSource(html: string): string {
  return preserveWordHidden(dropRowlessConditionalTables(html));
}

// Tag a hidden cell or row so the engine's applyMsoHide keeps it hidden after
// the Word strip. Call this on the source, before transformForAllClients.
//
// Cells, rows and spans only. Real Outlook 2007 to 2016 drew a div and a table that
// carried `display:none`, inline or by class (fidelity sheet 09-follow-ups
// c23 to c25), so tagging those hid content Outlook shows. A hidden cell or
// row does stay hidden, apart from any table inside it (c21, c22).
// ponytail: engine 0.14.4 does this itself; delete once that is the floor.
export function preserveWordHidden(html: string): string {
  return html.replace(
    /(<(?:td|th|tr|span)\b[^>]*?\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi,
    (whole, lead: string, quote: string, style: string) =>
      !/display\s*:\s*none/i.test(style) ||
      /mso-hide\s*:\s*all/i.test(style) ||
      // The engine keeps a hidden cell's padding, and needs it untagged to see it.
      (/^<t[dh]\s/i.test(lead) && /padding/i.test(style))
        ? whole
        : `${lead}${quote}${style}${/;\s*$/.test(style) ? "" : ";"}mso-hide:all${quote}`,
  );
}

/** Word ignores @media, so drop those blocks before Chromium paints the preview. */
// A br ruled display:none is deleted, and the words on either side are joined.
// Outlook.com and Word do this; a browser would leave a space.
function dropHiddenBreaks(html: string): string {
  const css = stripMediaQueries(
    [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => m[1])
      .join("\n"),
  );
  const hidden = new Set<string>();
  for (const match of css.matchAll(
    /\.([A-Za-z_][\w-]*)\s*\{[^}]*display\s*:\s*none/gi,
  )) {
    hidden.add(match[1]);
  }
  if (hidden.size === 0) return html;
  return html.replace(/\s*<br\b([^>]*)>\s*/gi, (whole, attrs: string) => {
    const classes =
      /class\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs)?.[2]?.split(/\s+/) ?? [];
    return classes.some((name) => hidden.has(name)) ? "" : whole;
  });
}

// Word paints bgcolor on tables and background on anchors. A wrapper div's CSS
// background is dropped, which is why the greeting sits on white and only the
// bgcolor bars stay beige. Measured against Outlook 2024 at 96, 120, and 150 DPI.
// The engine drops it now, per element; this function used to drop every
// stylesheet background, which also removed the ones Word does paint.
//
// Selector forms Word's stylesheet parser ignores. Each was observed, identically,
// on Outlook 2007, 2010, 2013, 2016 and 2019 and on Windows 10 Mail (probe sheet
// 07-style-delivery, 2026-10-13): an attribute selector, a child combinator,
// :first-child, :nth-child, :not(), ::before, and two classes on one element
// (.a.b). Plain class, id, descendant and type selectors do apply. Other
// pseudo-classes and combinators were not tested, so they are left alone.
const WORD_IGNORED_SELECTOR =
  /\[|>|:first-child|:nth-child|:not\(|::?before|\.[\w-]+\.[\w-]/;

function stripWordCss(css: string): string {
  return css.replace(
    /([^{}@]+)\{([^{}]*)\}/g,
    (full, selectors: string, declarations: string) => {
      // ponytail: a selector list is filtered per selector. Whether Word drops
      // the whole rule when one selector in the list is unsupported is untested.
      const sel = selectors
        .split(",")
        .filter((one) => !WORD_IGNORED_SELECTOR.test(one))
        .join(",");
      if (!sel.trim()) return "";
      // A declaration whose value needs var() never resolves in Word (same run).
      const body = declarations.replace(/(?:^|;)[^;{}]*var\([^;{}]*/gi, "");
      const noRadius = body.replace(/border-radius\s*:[^;}]*/gi, "");
      // Backgrounds stay. Word does paint a class rule's background on a table
      // (probe sheet 07-style-delivery c02, c03, c05, Outlook 2007 to 2019). It
      // only fails on a div that holds no text of its own, and the engine's
      // Word pass handles that element by element.
      return `${sel}{${noRadius}}`;
    },
  );
}

function stripMediaQueries(css: string, atRule = "@media"): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.toLowerCase().indexOf(atRule, i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const open = css.indexOf("{", at);
    if (open === -1) {
      break;
    }
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    i = j;
  }
  return out;
}

// Word ignores a <table> opened straight onto a non-table tag. HubSpot wraps
// each column div in `<!--[if gte mso 9]><table width="600">` with no row;
// revealed as written, a browser moves the div out of that table and the
// stray closing divs end the page wrapper early (run A4yJTiDrzpHK: a 20px gap
// under the header that the real Outlook Classic capture does not have).
// The engine reveals and parses Outlook's branch, so call this on the source,
// before the pipeline parses it; other clients never read these blocks.
// ponytail: only lone <table>/</table> conditional blocks, paired in order.
const LONE_TABLE_BLOCK =
  /<!--\[if ([^\]]*)\]>\s*(<table\b[^>]*>|<\/table>)\s*<!\[endif\]-->/gi;
const TABLE_TAG = /<(?:tr|tbody|thead|tfoot|caption|colgroup|col|td|th)\b/iy;

// Whether table content follows `from`, past whitespace and comments. A scan,
// not a regex: a lazy comment pattern backtracks exponentially on a run of
// comments, and email HTML is untrusted.
function tableContentAt(html: string, from: number): boolean {
  let at = from;
  for (;;) {
    while (at < html.length && /\s/.test(html[at])) at++;
    if (!html.startsWith("<!--", at)) break;
    const close = html.indexOf("-->", at + 4);
    if (close < 0) return false;
    at = close + 3;
  }
  TABLE_TAG.lastIndex = at;
  return TABLE_TAG.test(html);
}

export function dropRowlessConditionalTables(html: string): string {
  const open: { start: number; end: number; rowless: boolean }[] = [];
  const drop: [number, number][] = [];
  for (const m of html.matchAll(LONE_TABLE_BLOCK)) {
    if (!/mso/i.test(m[1]) || m[1].includes("!")) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (!m[2].startsWith("</")) {
      open.push({ start, end, rowless: !tableContentAt(html, end) });
      continue;
    }
    const table = open.pop();
    if (table?.rowless) drop.push([table.start, table.end], [start, end]);
  }
  let out = html;
  for (const [start, end] of drop.sort((a, b) => b[0] - a[0]))
    out = out.slice(0, start) + out.slice(end);
  return out;
}

/**
 * Outlook Classic (Word engine) mutations:
 * 1. Unwrap <!--[if mso]> conditionals so their content renders
 * 2. Strip <!--[if !mso]> sections (hidden in real Outlook)
 */
function applyOutlookClassicMutations(html: string): string {
  let result = html;

  // A hidden span directly under <body> still opens a paragraph: the email sits
  // 21px lower (probe outlook-word-flow, 2026-10-31: bar at 36px against 15px).
  result = result.replace(
    /(<body[^>]*>\s*(?:<div[^>]*display\s*:\s*none[^>]*>\s*<\/div>\s*)?)(<span[^>]*display\s*:\s*none)/i,
    '$1<div style="height:21px"></div>$2',
  );

  // Outlook's branch of the conditional comments: [if mso] blocks opened, the
  // [if !mso] "revealed" blocks removed. The engine's resolver, not a copy:
  // the regexes that were here read "[if !mso]" as "[if mso]" (any condition
  // containing "mso"), and unwrapping a revealed `<!--[if !((mso)|(IE))]><!-- -->`
  // left a stray `<!--` that commented out a whole HubSpot email, so its
  // Outlook Classic preview was blank (held-out agreement run, 2026-10-31).
  result = resolveMsoBranch(result);

  // Word paints text with an mso-style-textfill gradient, over the rule's own
  // color: the "color:#000!important" beside it is a decoy for other clients
  // (vercel button, agreement run 2026-10-28: white in Word, black in live preview).
  // ponytail: takes the first stop as a solid fill; a real gradient is not drawn.
  result = mapStyleBlocks(result, (css) =>
    css.replace(/\{[^{}]*\}/g, (block) => {
      const stop = block.match(
        /mso-style-textfill-fill-gradientfill-stoplist\s*:\s*["']?\s*[\d.]+\s+(#[0-9a-f]{3,8})/i,
      );
      return stop
        ? `${block.slice(0, -1).replace(/(^|[{;\s])color\s*:[^;}]*;?/gi, "$1")};color:${stop[1]}!important}`
        : block;
    }),
  );

  // CSS line-height:100% is 16px here, so the spacer bars are 48px. Word's single
  // spacing on the same bars is 57px in the 96 DPI shot (71px at 120 DPI,
  // 93px at 150 DPI, the same 1.19x). Percentage line-height is what Word
  // replaces; px line-heights in the email stay.
  //
  // A unitless line-height is not a multiplier of the font size in Word. A
  // whole number is a count of single-spaced lines: 1 at 16px measured 18px
  // and 2 measured 36px. A decimal is not read at all: 1.5 measured one line,
  // 18 to 20px (fidelity sheets 04-typography c03, c04; 09-follow-ups c11).
  // Zero is left alone; it was not measured and spacers rely on it. Under 1
  // the text is not drawn and the block adds no height, whatever its children
  // set (local Outlook probe 2026-11-04: 0.5 to 0.99 on a td or a div; run
  // 5EKcFWnZc92w's drop cap at 0.82 is missing in the real capture). This runs
  // first, so the multipliers written below are not caught by it.
  result = result.replace(
    /line-height\s*:\s*(\d*\.?\d+)\s*(?=[;"'}!]|$)/gi,
    (whole, value: string) =>
      Number(value) <= 0
        ? whole
        : Number(value) < 1
          ? `line-height:0;visibility:hidden`
          : Number.isInteger(Number(value)) && Number(value) > 1
            ? `line-height:${Number(value) * 1.15}`
            : "line-height:normal",
  );
  // The empty line a block's last <br> leaves is 1em tall in Word, whatever
  // the face or line-height; a browser gives it a full line (local Outlook
  // probe 2026-11-05; run A4yJTiDrzpHK's "<br><br></p>" paragraphs). A single
  // trailing <br> adds nothing in either, so it stays.
  result = result.replace(
    /(<br\b[^>]*>\s*)<br\b[^>]*>\s*(<\/(?:p|div)>)/gi,
    '$1<span style="display:block;height:1em"></span>$2',
  );
  // Font sizes are left as written: at 96 DPI (the real-device captures) Word
  // drew 13px Arial at 13px (run e3bKX64ZQH_i), while local Outlook at 125%
  // rounds a size up to the next half point (sweep 2026-11-04). Not modelled.
  // Every percentage scales Word's single spacing, not the font size: 150% at
  // 16px measured 27 to 29px, which is 1.5 x 1.19 x 16 (c06, c07). Each face
  // has its own single spacing (probe outlook-line-height, 2026-11-02).
  // ponytail: reads the font from the same style attribute only; an inherited
  // font gets 1.19. Resolve it from the ancestors if that shows up in the drift.
  const percentLine = (percent: string, single: number) =>
    `line-height:${Number(((Number(percent) / 100) * single).toFixed(3))}`;
  result = result.replace(/\bstyle\s*=\s*"[^"]*"/gi, (style) => {
    const family = /font-family\s*:\s*([^;"]*)/i.exec(style)?.[1] ?? "";
    const face = WORD_SINGLE_SPACING.map(
      ([name, single]) => [family.indexOf(name), single] as const,
    )
      .filter(([at]) => at >= 0)
      .sort((a, b) => a[0] - b[0])[0];
    return style.replace(
      /line-height\s*:\s*(\d+(?:\.\d+)?)%/gi,
      (_whole, percent: string) => percentLine(percent, face?.[1] ?? 1.19),
    );
  });
  result = result.replace(
    /line-height\s*:\s*(\d+(?:\.\d+)?)%/gi,
    (_whole, percent: string) => percentLine(percent, 1.19),
  );

  // Word ignores max-height and height:0, so a bgcolor bar in that wrapper
  // takes real space under the card. Chromium would keep height:0, paint the
  // bar, and let it cover the next section.
  result = result.replace(/<div\b[^>]*>/gi, (full) => {
    if (/display\s*:\s*none/i.test(full)) return full;
    // Not line-height:0: run 5EKcFWnZc92w's spacer divs read "line-" after it.
    if (!/(?<![\w-])(?:max-)?height\s*:\s*0/i.test(full)) return full;
    return full.replace(
      /(?<![\w-])(?:max-)?height\s*:\s*0(?:px)?\s*;?\s*/gi,
      "",
    );
  });

  // A table's CSS margin is honoured by today's Outlook Classic: margin-bottom
  // and margin-top both added their space (Preflight probe 2026-10-31; Aerowork's
  // button kept its gap). The old zeroing came from sheet 01 c18, Outlook 2007
  // to 2019. ponytail: Word paints a bottom margin with the last cell's colour,
  // the browser leaves it outside; the gap is right, the fill under it is not.

  result = result.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) =>
      // @supports blocks are ignored like @media (probe sheet 07, same run).
      `${open}${stripWordCss(stripMediaQueries(stripMediaQueries(css), "@supports"))}${close}`,
  );

  // ponytail: Word paints background on the glyphs. Leave inline VML radius alone.
  result = injectStyleIntoHtml(
    result,
    // The align rules sit here, after the stylesheet filter above, because that
    // filter drops attribute selectors, as Word does.
    // React Email's mso-font-width spacers rebuild a button's padding in Word
    // (Neon, local Outlook, 2026-11-02), so those links keep theirs, as do bordered ones.
    // Word lays every table out by its content and sizes a column to its longest
    // word: run J9vFS4nm_LGl's 1067px image pushed the text column aside, whole words.
    // Word drops CSS letter-spacing everywhere, any element, any unit (local
    // Outlook probe 2026-11-04; run 5EKcFWnZc92w's 5px eyebrow drew unspaced).
    // Word ignores a table's height, attribute or CSS, and keeps a cell's (same probe day).
    `<style>a:not(:has(i[style*="mso-font-width"])):not([data-word-box]){padding:0!important;margin:0!important;border-radius:0!important;min-width:0!important;min-height:0!important;display:inline!important}table[align="center" i]{margin-left:auto!important;margin-right:auto!important}table[align="right" i]{margin-left:auto!important}table{table-layout:auto!important;height:auto!important}*{word-break:normal!important;overflow-wrap:break-word!important}*{letter-spacing:normal!important}[style*="line-height:0;visibility:hidden"] *{line-height:0!important}</style>`,
  );

  return result;
}

// Chromium does not apply these client preprocessors. Rewrite the HTML so the
// targeting selectors our supported inboxes honour actually match.
const WEBKIT_TARGET =
  /_:-webkit-full-screen\s*,\s*_::-webkit-full-page-media\s*,\s*_:future\s*,\s*/gi;
const YAHOO_WRAPPER_ID = "yiv0123456789";

function mapStyleBlocks(html: string, edit: (css: string) => string): string {
  return html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, open: string, css: string, close: string) =>
      `${open}${edit(css)}${close}`,
  );
}

function wrapBodyInner(html: string, open: string, close: string): string {
  return html.replace(
    /(<body[^>]*>)([\s\S]*?)(<\/body>)/i,
    `$1${open}$2${close}$3`,
  );
}

function addBodyClass(html: string, className: string): string {
  return html.replace(/<body\b([^>]*)>/i, (full, attrs: string) => {
    if (new RegExp(`\\b${className}\\b`).test(attrs)) return full;
    if (/\bclass\s*=\s*"/.test(attrs))
      return full.replace(/class="/, `class="${className} `);
    if (/\bclass\s*=\s*'/.test(attrs))
      return full.replace(/class='/, `class='${className} `);
    return `<body class="${className}"${attrs}>`;
  });
}

// Only inside <style>: body text holds ".&" too (a sentence ending ".&nbsp;").
function activateAmpersandTarget(html: string, id: string): string {
  const styles = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
  if (!styles.some((block) => block.includes(".&"))) return html;
  return mapStyleBlocks(
    wrapBodyInner(html, `<div id="${id}">`, `</div>`),
    (css) => css.replace(/\.&/g, `#${id}`),
  );
}

function applyYahooCssQuirks(html: string): string {
  return mapStyleBlocks(html, (css) =>
    css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/!yahoo\b/gi, "")
      .replace(/@media\s+screen\s+yahoo/gi, "@media screen"),
  );
}

function prefixOutlookClasses(html: string): string {
  const prefixed = html.replace(
    /\bclass\s*=\s*(["'])([^"']*)\1/gi,
    (_m, quote: string, classes: string) => {
      const next = classes
        .split(/\s+/)
        .filter(Boolean)
        .map((name) =>
          name === "emailens-shell" || name.startsWith("x_")
            ? name
            : `x_${name}`,
        )
        .join(" ");
      return `class=${quote}${next}${quote}`;
    },
  );
  return mapStyleBlocks(prefixed, (css) =>
    css.replace(
      /(^|[^.\w-])\.((?!x_)[A-Za-z_][\w-]*)/g,
      (whole, lead: string, name: string) =>
        name === "emailens-shell" ? whole : `${lead}.x_${name}`,
    ),
  );
}

function applyClientTargeting(html: string, clientId: string): string {
  let result = html;
  if (clientId === "apple-mail-macos" || clientId === "apple-mail-ios") {
    result = wrapBodyInner(
      addBodyClass(result, "Singleton"),
      `<div class="apple-mail">`,
      `</div>`,
    );
    result = mapStyleBlocks(result, (css) => css.replace(WEBKIT_TARGET, ""));
  }
  if (clientId === "apple-mail-ios") {
    result = mapStyleBlocks(result, (css) =>
      css.replace(
        /@supports\b[^{]*-webkit-overflow-scrolling\s*:\s*touch[^{]*/gi,
        "@media all ",
      ),
    );
  }
  if (clientId === "outlook-macos") {
    result = wrapBodyInner(result, `<div id="converted-body">`, `</div>`);
    result = mapStyleBlocks(result, (css) => css.replace(WEBKIT_TARGET, ""));
  }
  if (clientId === "thunderbird") {
    result = wrapBodyInner(result, `<div class="moz-text-html">`, `</div>`);
    result = mapStyleBlocks(result, (css) =>
      css.replace(
        /@media\b[^{]*-moz-(?:device-pixel-ratio|windows-compositor)[^{]*/gi,
        "@media all ",
      ),
    );
  }
  if (clientId === "outlook-ios" || clientId === "outlook-android") {
    result = result.replace(
      /<body\b(?![^>]*\bdata-outlook-cycle\b)/i,
      `<body data-outlook-cycle=""`,
    );
  }
  if (clientId === "outlook-ios") {
    result = wrapBodyInner(
      result,
      `<div class="olm-fragment-custom">`,
      `</div>`,
    );
  }
  if (clientId === "outlook-windows") {
    result = mapStyleBlocks(result, (css) => css.replace(/\\0\/?/g, ""));
    result = retouchStyle(result, (style) =>
      style.includes("\\0") ? style.replace(/\\0\/?/g, "") : null,
    );
  }
  if (clientId === "outlook-web") result = prefixOutlookClasses(result);
  if (clientId === "aol") {
    result = applyYahooCssQuirks(result);
    result = activateAmpersandTarget(result, "aol-mail");
  }
  return result;
}

/**
 * Compute the effective iframe width for a client.
 *
 * Non-responsive emails on mobile are shrink-to-fit: rendered at
 * MOBILE_SHRINK_WIDTH (640px) and scaled down to the device width, the way iOS
 * clients (and the Outlook app) uniformly zoom the page out. The exception is
 * munge clients (Gmail Android), which reflow rather than scale , they render
 * 1:1 at the device width and the injected munge CSS does the fitting.
 */
export function getEffectiveWidth(clientId: string, html: string): number {
  const vp = CLIENT_VIEWPORTS[clientId] ?? DEFAULT_VIEWPORT;
  if (vp.isMobile && !isResponsiveEmail(html)) {
    return isMungeClient(clientId) ? vp.width : MOBILE_SHRINK_WIDTH;
  }
  return vp.width;
}

/**
 * Sub-pixel slack before a measured width counts as overflow.
 * getBoundingClientRect routinely puts a "600px" table at 600.4px.
 */
const OVERFLOW_TOLERANCE_PX = 2;

// Phone clients zoom out content still wider than the screen once laid out,
// instead of letting it scroll sideways. Gmail Android, seen on real run
// C93iCoVV5yas (2026-11-03): a responsive email with a 518px footer row was
// laid out at 518 and shown whole on the 412px screen, the text at about 0.8x.
// Samsung Email, Galaxy S23 Ultra probe (2026-11-06): a fixed 560px table and a
// 64-character word were shown whole, the email shrunk to the screen (its text
// shrank less, WebView text autosizing; not modelled). Yahoo Mail Android,
// worker test device probes (2026-11-06): the same, text shrunk evenly. Outlook
// Android, same probes, same day: the same.
// iPhone apps are assumed, not probed: Gmail, Outlook and Yahoo iOS behave like
// their Android apps. Apple Mail iOS is the exception: it shrinks only an email
// without x-apple-disable-message-reformatting, which templates commonly carry,
// and then an overflow scrolls.
// ponytail: Apple Mail is kept as a scroll for every email; read the meta from
// the HTML if that call matters.
const KEEPS_OVERFLOW = new Set(["apple-mail-ios"]);
const zoomsOutOverflow = (clientId: string) =>
  (CLIENT_VIEWPORTS[clientId] ?? DEFAULT_VIEWPORT).isMobile === true &&
  !KEEPS_OVERFLOW.has(clientId);

/**
 * How a mobile client fits an email to its screen. `layoutWidth` is the width
 * the email is laid out at before any measurement (getEffectiveWidth); past
 * the screen, the page is shrunk as a whole. `measuredWidth` is the content
 * width a real layout reported: it widens that shrink, and for a client in
 * zoomsOutOverflow it can start one.
 */
export function mobileShrink(
  clientId: string,
  layoutWidth: number,
  measuredWidth: number | null | undefined,
): { naturalWidth: number; scale: number } {
  const vp = CLIENT_VIEWPORTS[clientId] ?? DEFAULT_VIEWPORT;
  const measured = measuredWidth ?? 0;
  const overflows = measured > vp.width + OVERFLOW_TOLERANCE_PX;
  const shrinks =
    vp.isMobile &&
    (layoutWidth > vp.width || (overflows && zoomsOutOverflow(clientId)));
  if (!shrinks) return { naturalWidth: vp.width, scale: 1 };
  const naturalWidth = Math.max(layoutWidth, measured);
  return { naturalWidth, scale: vp.width / naturalWidth };
}

/**
 * How an email sits in a client's pane: the width it is laid out at, the scale
 * it is shown at, and whether it scrolls sideways. The canvas and its width
 * readout both read this, so a shrunk email is never also called too wide.
 * `effectiveWidth` is getEffectiveWidth's; `contentWidth` is the scrollWidth
 * measured at the current layout (it settles: measured at `layoutWidth`, the
 * same layout comes back).
 */
export function paneFit(
  clientId: string,
  paneWidth: number,
  effectiveWidth: number,
  contentWidth: number | null | undefined,
): { layoutWidth: number; scale: number; overflow: MeasuredOverflow | null } {
  const vp = CLIENT_VIEWPORTS[clientId] ?? DEFAULT_VIEWPORT;
  const fit = vp.isMobile
    ? mobileShrink(clientId, effectiveWidth, contentWidth)
    : { naturalWidth: paneWidth, scale: 1 };
  const layoutWidth = fit.scale < 1 ? fit.naturalWidth : paneWidth;
  return {
    layoutWidth,
    scale: paneWidth / layoutWidth,
    overflow: contentWidth
      ? measuredOverflow(clientId, contentWidth, layoutWidth)
      : null,
  };
}

/** The shell style that lays the email out at `naturalWidth` and shrinks it. */
export function shrinkToFitStyle(naturalWidth: number, scale: number): string {
  if (scale === 1) return "";
  return `<style>.emailens-shell{width:${naturalWidth}px!important;max-width:${naturalWidth}px!important;transform:scale(${scale});transform-origin:top left;}</style>`;
}

export interface MeasuredOverflow {
  clientId: string;
  /** Rendered content width, in CSS px. */
  emailWidth: number;
  /** The width this client actually renders the email at. */
  renderWidth: number;
  /** How far past the edge the content reaches, in CSS px. */
  overflowBy: number;
  message: string;
}

/**
 * Turn a measured render width into an overflow finding.
 *
 * Unlike the engine's static `checkOverflow`, this is not a heuristic , the
 * numbers come out of a real layout, so nested widths, media queries and
 * image constraints are already resolved.
 *
 * Both widths MUST come from the same layout: pass the *measured* layout
 * viewport (`document.documentElement.clientWidth`), never a modelled figure.
 * A mobile browser handed an email with no `width=device-width` lays it out in
 * a ~980px legacy viewport and zooms out to fit , the classic non-responsive
 * email. Measured against a modelled 393px device width, that reads as a
 * 570px overflow when the reader simply sees a smaller page.
 */
/** What content past the pane does in this client: shrink or scroll. */
export function overflowConsequence(clientId: string): string {
  return zoomsOutOverflow(clientId)
    ? "this client shrinks the whole email to fit and every line of text gets smaller."
    : "the email scrolls horizontally.";
}

export function measuredOverflow(
  clientId: string,
  emailWidth: number,
  renderWidth: number,
): MeasuredOverflow | null {
  if (!Number.isFinite(emailWidth) || emailWidth <= 0) return null;
  const overflowBy = Math.round(emailWidth - renderWidth);
  if (overflowBy <= OVERFLOW_TOLERANCE_PX) return null;
  return {
    clientId,
    emailWidth: Math.round(emailWidth),
    renderWidth: Math.round(renderWidth),
    overflowBy,
    message:
      `Content renders ${Math.round(emailWidth)}px wide but this client gives it ` +
      `${Math.round(renderWidth)}px , ${overflowBy}px past the edge, so ` +
      overflowConsequence(clientId),
  };
}

export const SCROLLBAR_STYLE = `<style>*{scrollbar-width:thin;scrollbar-color:rgba(128,128,128,.25) transparent}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(128,128,128,.25);border-radius:9999px}::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.4)}</style>`;

// Metric-compatible faces, self-hosted. @font-face does not inherit from the
// parent frame, so the iframe and the headless capture both need this tag.
// Arimo stands in for Arial and Helvetica, Carlito for Calibri, Tinos for
// Times New Roman, Selawik for Segoe UI, Gelasio for Georgia, Cousine for
// Courier New. Gill Sans is a commercial face and is not shipped; the email's
// own stack falls through to Arial, which resolves to Arimo here.
const FONT_FACES: [string, string][] = [
  ["Roboto", "roboto"],
  ["Carlito", "carlito"],
  ["Arimo", "arimo"],
  ["Tinos", "tinos"],
  ["Selawik", "selawik"],
  ["Gelasio", "gelasio"],
  ["Cousine", "cousine"],
  ["Arial", "arimo"],
  ["Helvetica", "arimo"],
  ["Calibri", "carlito"],
  ["Times New Roman", "tinos"],
  ["Segoe UI", "selawik"],
  ["Segoe UI Web (West European)", "selawik"],
  ["Georgia", "gelasio"],
  ["Courier New", "cousine"],
  ["Source Serif 4", "source-serif-4"],
];
const ITALIC_FILES = new Set([
  "roboto",
  "carlito",
  "arimo",
  "tinos",
  "gelasio",
  "cousine",
  "source-serif-4",
]);

function fontFace(
  family: string,
  file: string,
  weight: number,
  italic: boolean,
): string {
  const style = italic ? "italic" : "normal";
  const suffix = italic ? "italic" : "";
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:swap;src:url('/fonts/${file}-${weight}${suffix}.woff2') format('woff2')}`;
}

const faceRules = (faces: [string, string][]) =>
  faces
    .flatMap(([family, file]) => {
      const rules = [400, 700].map((w) => fontFace(family, file, w, false));
      if (ITALIC_FILES.has(file))
        rules.push(...[400, 700].map((w) => fontFace(family, file, w, true)));
      return rules;
    })
    .join("");
export const FONT_FACE_STYLE = faceRules(FONT_FACES);
export const FONT_FACE_TAG = `<style>${FONT_FACE_STYLE}</style>`;

// Segoe UI ships with Windows only: on Apple and Android a Segoe UI stack falls
// through to its next family (run fed_dEncTZ2n: Apple Mail Mac drew Helvetica).
// Its stand-in is left out, and the email's stacks lose it (dropSegoe), since a
// Windows host would otherwise draw its own installed Segoe UI.
const NO_SEGOE_FACE_TAG = `<style>${faceRules(
  FONT_FACES.filter(([family]) => !family.startsWith("Segoe UI")),
)}</style>`;
const hasSegoe = (clientId: string) =>
  !/-(ios|android|macos)$/.test(clientId) && clientId !== "samsung-mail";
const isApple = (clientId: string) => /-(ios|macos)$/.test(clientId);

// On Apple the system font is San Francisco, which a Windows or Linux host
// lacks: its names become one family drawn by a stand-in.
const APPLE_SYSTEM = "Apple System";
const APPLE_SYSTEM_FILE = "selawik";
const APPLE_SYSTEM_TAG = `<style>${[400, 700]
  .map((w) => fontFace(APPLE_SYSTEM, APPLE_SYSTEM_FILE, w, false))
  .join("")}</style>`;

// One font-family value, in an attribute (&quot;) or a stylesheet ("…" or '…').
const FONT_FAMILY =
  /(font-family\s*:\s*)((?:&quot;|'[^']*'|"[^"<>=]*"|[^;}"'<>!])+)/gi;
const SYSTEM_NAMES = /^\s*(-apple-system|BlinkMacSystemFont|system-ui)\s*$/i;

/** Font stacks as the client's platform resolves them (shell included). */
function platformFonts(html: string, clientId: string): string {
  const apple = isApple(clientId);
  const segoe = hasSegoe(clientId);
  if (segoe && !apple) return html;
  return html.replace(FONT_FAMILY, (whole, prop: string, value: string) => {
    const families = value.split(",");
    const kept = families
      .filter((f) => segoe || !/^\s*(&quot;|["'])?Segoe UI/i.test(f))
      .map((f) => (apple && SYSTEM_NAMES.test(f) ? `'${APPLE_SYSTEM}'` : f));
    if (kept.join(",") === value) return whole;
    return `${prop}${kept.join(",").trim() || "sans-serif"}`;
  });
}

// Word's single spacing is taller than the browser's line-height:normal: Segoe
// UI 1.40 times the size, Aptos 1.29, Arial, Helvetica and Georgia 1.19. Aptos
// also sets 6% narrower than its stand-in (probe outlook-word-flow metric,
// 2026-11-01). Later faces win, so this overrides FONT_FACE_TAG.
// Gill Sans MT ships with Office and cannot be bundled: Arimo stands in, set to
// its width on running text (0.936 of Arial's, bold 0.991) and to the VDMX
// height Word lays it out by at body sizes, 18px up and 5px down at 16px (run
// gjAruZbzWbTa's 16px/22px lines were 23.25px apart; font tables, 2026-11-04).
// Above 22px Word drops the VDMX for the win metrics rounded up (28px sets 34,
// 35px 42 in local Outlook), and so does a run larger than its block (gjAr's
// 18px spans in 16px/22px lines sat 22px apart): the engine names
// 'Gill Sans MT Large' for both.
// The overrides are scaled by size-adjust, hence 112.5 / 0.936 and 31.25 / 0.936.
const WORD_FONT_METRICS: [string, string, number, number, number, number?][] = [
  ["Segoe UI", "selawik", 106, 30, 100],
  ["Aptos", "selawik", 106, 32, 93.7],
  ["Arial", "arimo", 96, 23, 100],
  ["Helvetica", "arimo", 96, 23, 100],
  ["Georgia", "gelasio", 95, 24, 100],
  ["Calibri", "carlito", 98, 31, 100],
  ["Times New Roman", "tinos", 96, 23, 100],
  ["Courier New", "cousine", 90, 24, 100],
  ["Gill Sans MT", "arimo", 120.2, 33.4, 93.6, 99.1],
  ["Gill Sans MT Large", "arimo", 99.3, 24.6, 93.6, 99.1],
];
// Faces Office downloads when an email names them, so Outlook Classic draws them
// where a browser would fall through the stack: Deepgram's Work Sans, Centercode's
// Lato (Office's CloudFonts cache, matched against real captures, 2026-11-02).
// Latin subsets, Open Font License. Word sets each at its own single spacing,
// about 1.05 times the face's line metric, so line-height:normal and the
// decimals Word ignores draw by the overrides: [family, file, ascent, descent]
// in percent, the probe's spacing split at the face's own ratio (local Outlook,
// 30 lines each, 2026-11-05; run A4yJTiDrzpHK's Work Sans lines were 19.7px
// apart at 16px in the real capture, Chrome's normal 19).
const WORD_CLOUD_FONTS: [string, string, number, number][] = [
  ["Work Sans", "work-sans", 98.2, 25.6],
  ["Lato", "lato", 104.2, 22.5],
  ["Montserrat", "montserrat", 101.9, 26.4],
  ["Nunito", "nunito", 106.2, 37.1],
  ["Nunito Sans", "nunito-sans", 106.2, 37.1],
  ["Open Sans", "open-sans", 112.2, 30.7],
  ["DM Sans", "dm-sans", 104.2, 32.5],
  ["IBM Plex Sans", "ibm-plex-sans", 107.8, 28.9],
  ["Ubuntu", "ubuntu", 98.8, 20],
  ["Source Code Pro", "source-code-pro", 103.6, 28.8],
  ["Raleway", "raleway", 99.4, 24.7],
  ["Playfair Display", "playfair-display", 113.6, 26.4],
  ["Poppins", "poppins", 117.5, 39.1],
];
// Single spacing as a multiple of the size, for the faces where it differs from
// 1.19 (probe outlook-line-height, 2026-11-02).
const WORD_SINGLE_SPACING: [string, number][] = [
  ["Segoe UI", 1.4],
  ["Aptos", 1.29],
  ["Calibri", 1.29],
  ["Verdana", 1.27],
  ["Tahoma", 1.27],
  ["Courier", 1.14],
  ["Arial", 1.19],
  ["Helvetica", 1.19],
  ["Georgia", 1.19],
  ["Times", 1.19],
  ["Gill Sans MT Large", 1.2],
  ["Gill Sans", 1.45],
  ...WORD_CLOUD_FONTS.map(
    ([family, , ascent, descent]) =>
      [family, (ascent + descent) / 100] as [string, number],
  ),
];
const WORD_CLOUD_FONTS_STYLE = WORD_CLOUD_FONTS.flatMap(
  ([family, file, ascent, descent]) => {
    const spacing = `ascent-override:${ascent}%;descent-override:${descent}%;line-gap-override:0%`;
    return [
      `@font-face{font-family:'${family}';font-weight:400;font-display:swap;src:url('/fonts/${file}-400.woff2') format('woff2');${spacing}}`,
      `@font-face{font-family:'${family}';font-weight:700;font-display:swap;src:url('/fonts/${file}-700.woff2') format('woff2');${spacing}}`,
      `@font-face{font-family:'${family}';font-weight:400;font-style:italic;font-display:swap;src:url('/fonts/${file}-400italic.woff2') format('woff2');${spacing}}`,
    ];
  },
).join("");
const WORD_FONT_METRICS_TAG = `<style>${WORD_CLOUD_FONTS_STYLE}${WORD_FONT_METRICS.flatMap(
  ([family, file, ascent, descent, size, bold = size]) =>
    [400, 700].map((weight) => {
      // A wider bold keeps the regular face's line height: the overrides are
      // scaled by size-adjust, so they divide it back out (Gill Sans MT Bold
      // has the regular face's metrics).
      const adjust = weight === 700 ? bold : size;
      const scale = (v: number) => Math.round((v * size * 10) / adjust) / 10;
      return `@font-face{font-family:'${family}';font-weight:${weight};font-display:swap;src:url('/fonts/${file}-${weight}.woff2') format('woff2');ascent-override:${scale(ascent)}%;descent-override:${scale(descent)}%;line-gap-override:0%;size-adjust:${adjust}%}`;
    }),
).join("")}</style>`;

// Android has no Arial or Helvetica: they alias to the system sans, Roboto. On
// the worker's Gmail an Arial ruler painted the same pixels as a Roboto one,
// where Arimo draws it 0.953x as wide (2026-11-04).
const GMAIL_ANDROID_FONTS_TAG = `<style>${[
  "Arial",
  "Helvetica",
  "Helvetica Neue",
]
  .flatMap((family) =>
    [400, 700].flatMap((weight) =>
      [false, true].map((italic) => fontFace(family, "roboto", weight, italic)),
    ),
  )
  .join("")}</style>`;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);

/**
 * Replace <img> elements with a labelled placeholder box, previewing how
 * clients render before remote images load , the default state in Outlook
 * desktop and in every client until the user clicks "show images".
 */
export function blockImagesInHtml(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    const width = /\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    const height = /\bheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    const size = [
      width ? `width:${width}px` : "",
      height ? `height:${height}px` : "",
      "max-width:100%",
    ]
      .filter(Boolean)
      .join(";");
    return `<span role="img" aria-label="${escapeHtml(alt)}" style="display:inline-block;box-sizing:border-box;${size};min-width:28px;min-height:28px;border:1px solid #d0d0d0;background:#f4f4f4;color:#999;font:11px/1.3 -apple-system,sans-serif;padding:4px;vertical-align:top;overflow:hidden">&#128247; ${escapeHtml(alt)}</span>`;
  });
}

// Media features for pinning prefers-color-scheme
// Colors sampled from the Testi dark JPEGs (center column), not a generic invert.
// Neutral light fills scale. Saturated lights (the lime block) keep hue and drop
// lightness. Fills under the cut stay, which is why #d2cabc survives on Yahoo
// and Gmail Android. ponytail: hex/rgb only. Named colors stay put.
type DarkProfile = {
  cut: number;
  neutral?: number;
  satL?: number;
  flatNeutral?: string;
  flatSat?: string;
  swatches?: Record<string, string>;
};
const DARK_PROFILES: Record<string, DarkProfile> = {
  "outlook-web": {
    cut: 0.45,
    neutral: 0.38,
    satL: 0.19,
    swatches: { eeeae4: "#595651" },
  },
  "outlook-windows": { cut: 0.45, neutral: 0.38, satL: 0.19 },
  "yahoo-mail": { cut: 0.72, flatNeutral: "#323232", flatSat: "#040500" },
  "yahoo-mail-ios": { cut: 0.72, flatNeutral: "#323232", flatSat: "#040500" },
  "yahoo-mail-android": {
    cut: 0.72,
    flatNeutral: "#323232",
    flatSat: "#040500",
  },
  aol: { cut: 0.72, flatNeutral: "#323232", flatSat: "#040500" },
  "gmail-android": { cut: 0.72, neutral: 0.19, satL: 0.09 },
  "gmail-ios": {
    cut: 0.45,
    neutral: 0.31,
    satL: 0.09,
    swatches: { eeeae4: "#4a4438" },
  },
  thunderbird: { cut: 0.45, flatNeutral: "#18181a", flatSat: "#18181a" },
};
const LIGHT_CANVAS_CLIENTS = new Set(["apple-mail-macos", "apple-mail-ios"]);

function channelLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parseCssColor(token: string): [number, number, number] | null {
  const hex = token.trim();
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(hex);
  if (!rgb) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(channelLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function scaleRgb(rgb: [number, number, number], factor: number): string {
  return `#${rgb
    .map((c) =>
      Math.round(c * factor)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function saturation(rgb: [number, number, number]): number {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / max;
}

function hslDark(rgb: [number, number, number], light: number): string {
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const c = (1 - Math.abs(2 * light - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const seg =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${seg
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function paintBg(rgb: [number, number, number], profile: DarkProfile): string {
  const key = rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
  const sampled = profile.swatches?.[key];
  if (sampled) return sampled;
  const sat = saturation(rgb);
  if (sat > 0.45) {
    if (profile.flatSat) return profile.flatSat;
    if (profile.satL != null) return hslDark(rgb, profile.satL);
  }
  if (profile.flatNeutral) return profile.flatNeutral;
  return scaleRgb(rgb, profile.neutral ?? 0.38);
}

const CSS_COLOR =
  /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)/gi;

function retintValue(
  prop: string,
  value: string,
  profile: DarkProfile,
): string | null {
  const isBg = prop === "background" || prop === "background-color";
  let changed = false;
  const next = value.replace(CSS_COLOR, (token) => {
    const rgb = parseCssColor(token);
    if (!rgb) return token;
    const lum = luminance(rgb);
    if (isBg && lum > profile.cut) {
      changed = true;
      return paintBg(rgb, profile);
    }
    if (prop === "color" && lum < 0.35) {
      changed = true;
      return "#e4e4e4";
    }
    return token;
  });
  return changed ? next : null;
}

function retintCss(css: string, profile: DarkProfile): string {
  return css.replace(
    /(^|[;{])(\s*)(background(?:-color)?|color)(\s*:\s*)([^;}{]+)/gi,
    (full, lead, space, prop, colon, value) => {
      const next = retintValue(String(prop).toLowerCase(), value, profile);
      return next == null ? full : `${lead}${space}${prop}${colon}${next}`;
    },
  );
}

function retintHtml(html: string, profile: DarkProfile): string {
  return html
    .replace(/style=(["'])([\s\S]*?)\1/gi, (full, quote, body) => {
      const next = retintCss(body, profile);
      return next === body ? full : `style=${quote}${next}${quote}`;
    })
    .replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (_, open, body, close) => open + retintCss(body, profile) + close,
    )
    .replace(/\sbgcolor=(["'])([\s\S]*?)\1/gi, (full, quote, value) => {
      const next = retintValue("background-color", value, profile);
      return next == null ? full : ` bgcolor=${quote}${next}${quote}`;
    });
}

/**
 * Replace the engine's dark HTML where Testi screenshots disagree with it.
 * Apple keeps the authored HTML (the engine paints the body #1a1a1a anyway).
 * Outlook hue-darkens light fills. Yahoo/AOL flatten only near-white fills.
 * Every other client keeps the engine result, warnings included.
 */
export function fitDarkMode<T extends { html: string }>(
  html: string,
  clientId: string,
  preview: T,
): T {
  if (LIGHT_CANVAS_CLIENTS.has(clientId)) return { ...preview, html };
  const profile = DARK_PROFILES[clientId];
  if (profile) {
    let next = retintHtml(html, profile);
    if (
      clientId === "outlook-web" ||
      clientId === "outlook-ios" ||
      clientId === "outlook-android"
    ) {
      next = next.replace(/<body\b/i, `<body data-ogsc="" data-ogsb=""`);
    }
    return { ...preview, html: next };
  }
  return preview;
}

const NEVER_MATCHES = "(min-width:999999px)";
const ALWAYS_MATCHES = "(min-width:0px)";
const PREFERS_DARK_RE = /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi;
const PREFERS_LIGHT_RE = /\(\s*prefers-color-scheme\s*:\s*light\s*\)/gi;

/**
 * Pin an email's `@media (prefers-color-scheme: ...)` blocks to the preview's
 * mode by rewriting the media FEATURE itself. Makes rendering deterministic
 * and independent of OS or host browser preferences.
 *
 * Both values, not only `dark`: a `light` query left alone follows the host
 * browser, which is light, so a dark preview applied the email's light-only
 * rules on top of its dark ones. Real Outlook for Mac in dark mode drops them
 * (probe sheet 21, case 7, 2026-10-27).
 */
export function pinPrefersColorScheme(
  html: string,
  darkActive: boolean,
): string {
  return html
    .replace(PREFERS_DARK_RE, darkActive ? ALWAYS_MATCHES : NEVER_MATCHES)
    .replace(PREFERS_LIGHT_RE, darkActive ? NEVER_MATCHES : ALWAYS_MATCHES);
}

/**
 * Apple Mail on macOS only hands the dark scheme to an email that asks for it.
 * A probe sheet with no color-scheme declaration, opened in Apple Mail in dark
 * mode, rendered exactly as in light mode: `prefers-color-scheme: dark` did
 * not match, `prefers-color-scheme: light` did, a dark-only image stayed
 * hidden and unstyled text stayed black on white (fidelity sheet 08a, c08,
 * c16, c19, c20). A real campaign that declares `color-scheme: light dark`
 * did go dark in the same client. The declaration has to offer dark: one that
 * says `light` alone is an email asking to stay light. Measured on macOS
 * only; the other clients are unchanged.
 */
const DECLARES_COLOR_SCHEME =
  /<meta\b(?=[^>]*\bname\s*=\s*["']?(?:color-scheme|supported-color-schemes)\b)[^>]*\bcontent\s*=\s*["'][^"']*\bdark\b|(?<!prefers-)color-scheme\s*:[^;}"']*\bdark\b/i;
function darkReachesContent(html: string, clientId: string): boolean {
  if (!clientTriggersPrefersColorScheme(clientId)) return false;
  return clientId !== "apple-mail-macos" || DECLARES_COLOR_SCHEME.test(html);
}

export interface PrepareIframeHtmlOptions {
  /**
   * For top-level headless captures in Browserless, scale down non-responsive
   * mobile emails to fit the physical device viewport using CSS transform,
   * matching SizedEmailIframe's outer iframe scaling.
   */
  scaleToFit?: boolean;
}

// Word paints the <body> colour across the whole pane: centercode's #EEEEEE
// bgcolor and neon's rgb(250,251,251) both fill it (round 2 tuning, 2026-10-31).
// So do Apple Mail (Mac), Outlook for Mac, Gmail web and Proton web: real-device
// captures of preview 67kQNJs1WDeQ (2026-10-28) showed the body's #e5e2da beside
// a card that does not fill the pane. Yahoo web showed white. Light mode only:
// no dark capture has measured it.
const BODY_CANVAS_CLIENTS = new Set([
  "outlook-windows-legacy",
  "apple-mail-macos",
  "outlook-macos",
  "gmail-web",
  "protonmail",
]);
function bodyCanvas(html: string): string | undefined {
  const body = html.match(/<body[^>]*>/i)?.[0] ?? "";
  return (
    body.match(
      /style\s*=\s*"[^"]*background(?:-color)?\s*:\s*([^;"]+)/i,
    )?.[1] ?? body.match(/bgcolor\s*=\s*["']?([^"'\s>]+)/i)?.[1]
  )?.trim();
}

// The shell font is the client's own default, under the email. It steps aside
// only for a font on <body> or <html>, which it would otherwise override for the
// text it wraps. A font on one cell is no reason to drop it: real clients keep
// their default under the rest (mobbin in Yahoo, 2026-10-28, fell to Times).
// Read after the client's mutations, so a font the client strips counts as gone.
// Comments are not read: a <style> inside <!--[if mso]> reaches Word only (whose
// mutations have unwrapped it by now), and counting it dropped Yahoo's default
// to Times on a HubSpot email (real-device run _YHEeChhj-3_, 2026-10-30).
function bodyDeclaresFont(html: string): boolean {
  const live = html.replace(/<!--[\s\S]*?-->/g, "");
  if (/<body\b[^>]*\bstyle\s*=\s*(["'])[^"']*font-family/i.test(live))
    return true;
  return /<style[^>]*>[\s\S]*?(?:^|[}\s,;])(?:html|body)\s*(?:,[^{]*)?\{[^}]*font-family[\s\S]*?<\/style>/i.test(
    live,
  );
}

/**
 * Canonical email HTML preparation pipeline shared across:
 * - Live PreviewCanvas (via SizedEmailIframe)
 * - Headless screenshot captures (via Browserless)
 * - AI vision / builder captures (via captureEmailPng)
 *
 * Guarantees visual 1:1 parity between live interactive canvas and static captures.
 */
export function prepareIframeHtml(
  html: string,
  clientId: string,
  isDarkMode: boolean,
  blockImages = false,
  options?: PrepareIframeHtmlOptions,
): string {
  const mode = isDarkMode ? "dark" : "light";
  const vp = CLIENT_VIEWPORTS[clientId] ?? DEFAULT_VIEWPORT;
  // Pin the email's own dark blocks to this preview's mode BEFORE anything else
  const contentDark = isDarkMode && darkReachesContent(html, clientId);
  const pinned = pinPrefersColorScheme(html, contentDark);
  const mutated = applyClientMutations(pinned, clientId);
  const imaged = blockImages ? blockImagesInHtml(mutated) : mutated;
  const shelled = wrapInShell(imaged);
  const shellStyle = buildShellStyle(
    clientId,
    mode,
    bodyDeclaresFont(mutated),
    BODY_CANVAS_CLIENTS.has(clientId) && !isDarkMode
      ? bodyCanvas(mutated)
      : undefined,
  );

  // Mobile: inject viewport meta so responsive media queries fire correctly
  const viewportMeta = vp.isMobile
    ? `<meta name="viewport" content="width=device-width, initial-scale=1">`
    : "";

  // For clients that trigger prefers-color-scheme (Apple Mail, Samsung, etc.),
  // inject color-scheme meta and root styling
  const colorSchemeMeta = contentDark
    ? `<meta name="color-scheme" content="dark light"><style>:root{color-scheme:dark}</style>`
    : "";

  // For top-level headless captures: mobile non-responsive emails scale down to
  // fit the phone screen width, exactly as SizedEmailIframe scales its outer iframe.
  let scaleStyle = "";
  if (
    options?.scaleToFit &&
    vp.isMobile &&
    !isResponsiveEmail(html) &&
    !isMungeClient(clientId)
  ) {
    const fit = mobileShrink(clientId, getEffectiveWidth(clientId, html), null);
    scaleStyle = shrinkToFitStyle(fit.naturalWidth, fit.scale);
  }

  const doc = injectStyleIntoHtml(
    shelled,
    viewportMeta +
      colorSchemeMeta +
      (hasSegoe(clientId) ? FONT_FACE_TAG : NO_SEGOE_FACE_TAG) +
      (isApple(clientId) ? APPLE_SYSTEM_TAG : "") +
      (clientId === "outlook-windows-legacy" ? WORD_FONT_METRICS_TAG : "") +
      (clientId === "gmail-android" ? GMAIL_ANDROID_FONTS_TAG : "") +
      SCROLLBAR_STYLE +
      shellStyle +
      scaleStyle,
  );
  return platformFonts(
    clientId === "protonmail" ? prependToHead(doc, PROTON_MESSAGE_CSS) : doc,
    clientId,
  );
}

// Proton web's message iframe stylesheet, the rules that move layout (WebClients
// packages/mail-renderer/src/helpers/MessageIframe.raw.scss). Proton puts it
// ahead of the email's head styles, so the email wins a tie of specificity.
// `body *` gives every element its own line-height: nothing inherits one, so
// an h1 in a line-height:1.1 cell draws at 1.5 (VQs6sjeqLmY5, qCRl2f88rRPV).
// With its base reset (styles/scss/base/_reset.scss): 14px body text, block
// margins zeroed but a paragraph's, auto table layout, purple links.
const PROTON_MESSAGE_CSS =
  "<style>body{font-size:14px}" +
  "p,ul,ol,dl,blockquote,pre,menu,td,th{font-size:1em;margin-inline:0}" +
  "blockquote,dl,ol,p,pre,td,th,ul{margin-block:0}p{margin-block:1em}" +
  "table{margin-block-end:0;table-layout:auto}" +
  "ul,ol,menu{padding-inline-start:2.5em}" +
  "blockquote{margin:0;padding:0 0 0 16px;border-left:4px solid #e5e5e5}" +
  "small{font-size:80%}a{color:#6d4aff;text-decoration:underline}" +
  "body *{line-height:1.5}code{line-height:1}</style>";

function prependToHead(html: string, tag: string): string {
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${tag}`)
    : tag + html;
}
