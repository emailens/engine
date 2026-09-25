import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import { MAX_HTML_SIZE } from "./constants";
import { parseColor, relativeLuminance } from "./color-utils";
import { parseInlineStyle, serializeStyle } from "./style-utils";
import type { CSSWarning } from "./types";
import { getClient } from "./clients";

/** Luminance threshold: colors above this are considered "light" */
export const LIGHT_THRESHOLD = 0.7;
/** Luminance threshold; colors below this are considered "dark" */
const DARK_THRESHOLD = 0.15;

/**
 * Clients whose `simulateDarkMode` branch below treats `prefers-color-scheme`
 * as honoured, i.e. the ones that actually run an email's dark-mode CSS.
 * Single source of truth, also used by `dark-mode-checker.ts`.
 * Keep in sync with the switch below.
 */
export const PREFERS_COLOR_SCHEME_CLIENTS = [
  "apple-mail-macos",
  "apple-mail-ios",
  "samsung-mail",
] as const;

/**
 * Simulate dark mode rendering for an email.
 * Email clients apply dark mode differently:
 * - Some invert colors (Gmail Android)
 * - Some use prefers-color-scheme media query (Apple Mail)
 * - Some do partial inversion (Outlook.com)
 *
 * Last verified: 2026-09-22
 * Sources: Litmus dark mode guide (2025-02-27 chart), Parcel dark mode guide,
 * caniemail.com prefers-color-scheme (last tested 2023-03-08), Courier dark-mode primer
 */
export function simulateDarkMode(
  html: string,
  clientId: string
): { html: string; warnings: CSSWarning[] } {
  if (!html || !html.trim()) {
    return { html: html || "", warnings: [] };
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Check for images with transparent backgrounds
  $("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (src.endsWith(".png") || src.endsWith(".svg") || src.endsWith(".webp")) {
      warnings.push({
        severity: "warning",
        client: clientId,
        property: "dark-mode",
        message: "Image with potentially transparent background may disappear in dark mode.",
        suggestion:
          'Add a background-color to the parent element, or use a non-transparent image format.',
      });
    }
  });

  // Determine dark mode behavior based on client
  switch (clientId) {
    case "gmail-web":
      // Gmail Web only darkens the UI chrome, not email content
      break;

    case "gmail-ios":
      // Gmail iOS applies full color inversion
      applyColorInversion($, "full", clientId);
      break;

    case "gmail-android":
      // Gmail Android applies partial color inversion
      applyColorInversion($, "partial", clientId);
      break;

    case "outlook-web":
      // Outlook.com applies its own dark mode with partial inversion
      // Also injects [data-ogsc] and [data-ogsb] attributes to store original colors
      applyColorInversion($, "partial", clientId);
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "Outlook.com applies partial color inversion in dark mode.",
          suggestion:
            "Use [data-ogsc] or [data-ogsb] CSS attribute selectors to override Outlook.com's dark mode color changes.",
        });
      }
      break;

    case "outlook-windows":
      // New Outlook (web engine) applies partial inversion like Outlook.com
      applyColorInversion($, "partial", clientId);
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "Outlook (New) applies partial color inversion in dark mode, similar to Outlook.com.",
          suggestion:
            "Use [data-ogsc] or [data-ogsb] CSS attribute selectors to override Outlook's dark mode color changes.",
        });
      }
      break;

    case "outlook-ios":
    case "outlook-android":
      // Litmus 2025-02: partial invert; [data-ogsc] is partial (light BGs darkened).
      applyColorInversion($, "partial", clientId);
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            `${getClient(clientId)?.name ?? clientId} applies partial color inversion in dark mode.`,
          suggestion:
            "Add @media (prefers-color-scheme: dark) styles and duplicate them with [data-ogsc]/[data-ogsb] prefixes. Outlook mobile support for those attributes is partial.",
        });
      }
      break;

    case "outlook-windows-legacy":
      // Classic Outlook (Word engine) applies full color inversion in dark mode
      applyColorInversion($, "full", clientId);
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "Outlook Classic applies full color inversion in dark mode. Colors may shift unexpectedly.",
          suggestion:
            "Test with dark mode enabled. The Word rendering engine offers limited control over dark mode color shifts.",
        });
      }
      break;

    case "apple-mail-macos":
    case "apple-mail-ios":
      // Apple Mail respects prefers-color-scheme but does NOT force inversion when absent;
      // it leaves email content as-is (no color changes) unless the email opts in via
      // <meta name="color-scheme" content="light dark"> or prefers-color-scheme media queries.
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "Apple Mail supports @media (prefers-color-scheme: dark). Without it, email content renders unchanged in dark mode.",
          suggestion:
            "Add a @media (prefers-color-scheme: dark) block with inverted colors for the best dark mode experience.",
        });
      }
      break;

    case "yahoo-mail":
      // Yahoo Mail only darkens the UI chrome, not email content
      break;

    case "samsung-mail":
      // Samsung Mail supports prefers-color-scheme; apply partial inversion only if absent
      if (!html.includes("prefers-color-scheme")) {
        applyColorInversion($, "partial", clientId);
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "Samsung Mail supports @media (prefers-color-scheme: dark). Consider adding dark mode styles.",
          suggestion:
            "Add a @media (prefers-color-scheme: dark) block with inverted colors for the best dark mode experience.",
        });
      }
      break;

    case "thunderbird":
      // Dark Message Mode rewrites colours itself. caniemail and later writeups
      // (Buttondown 2025) treat prefers-color-scheme as unsupported here.
      applyColorInversion($, "full", clientId);
      warnings.push({
        severity: "info",
        client: clientId,
        property: "dark-mode",
        message:
          "Thunderbird Dark Message Mode applies its own full color rewrite; @media (prefers-color-scheme: dark) is not honoured.",
        suggestion:
          "Design so full inversion stays readable. Recipients can toggle Dark Message Mode off per message; authored dark CSS will not run.",
      });
      break;

    case "hey-mail":
      // caniemail: prefers-color-scheme:dark is rewritten to @media (false).
      applyColorInversion($, "partial", clientId);
      warnings.push({
        severity: "info",
        client: clientId,
        property: "dark-mode",
        message:
          "HEY Mail does not honour @media (prefers-color-scheme: dark); the query is rewritten to @media (false).",
        suggestion:
          "Do not rely on a dark media query for HEY. Keep light-mode contrast high enough to survive partial inversion.",
      });
      break;

    case "superhuman":
      // Carbon/Snow is a client theme overlay, not authored prefers-color-scheme.
      applyColorInversion($, "partial", clientId);
      warnings.push({
        severity: "info",
        client: clientId,
        property: "dark-mode",
        message:
          "Superhuman Carbon theme overlays its own dark styling; prefers-color-scheme is not a reliable control surface.",
        suggestion:
          "Test Carbon and Snow inside Superhuman. Authored dark CSS may be overridden by the client theme.",
      });
      break;
  }

  const bodyStyle = ($("body").attr("style") || "").toLowerCase();
  if (!Object.values(SAMPLED_DARK[clientId] ?? {}).some((c) => bodyStyle.includes(c.slice(1)))) {
    $("body").css("background-color", "#1a1a1a");
  }
  $("body").css("color", "#e0e0e0");

  return { html: $.html(), warnings };
}

/**
 * Invert a color value for dark mode.
 * Returns null if the color can't be parsed or shouldn't be inverted.
 */
// ponytail: exact 6-digit hex only. Expand #rgb when a sample arrives that way.
const SAMPLED_DARK: Record<string, Record<string, string>> = {
  "outlook-web": { eeeae4: "#595651" },
  "gmail-ios": { eeeae4: "#4a4438" },
};

function invertColor(value: string, mode: "full" | "partial", clientId?: string): string | null {
  const pinned = clientId && SAMPLED_DARK[clientId]?.[value.trim().replace("#", "").toLowerCase()];
  if (pinned) return pinned;
  const parsed = parseColor(value);
  if (!parsed || parsed.a === 0) return null;

  const lum = relativeLuminance(parsed.r, parsed.g, parsed.b);

  if (mode === "full") {
    // Full inversion: invert both light and dark colors
    if (lum > LIGHT_THRESHOLD) {
      // Light color → dark
      return "#1a1a1a";
    }
    if (lum < DARK_THRESHOLD) {
      // Dark color → light
      return "#e0e0e0";
    }
    return null; // mid-range colors left alone
  } else {
    // Partial inversion: only invert very light backgrounds/very dark text
    if (lum > 0.85) {
      return "#2d2d2d";
    }
    if (lum < 0.05) {
      return "#d4d4d4";
    }
    return null;
  }
}

/** Color-bearing CSS properties */
const COLOR_PROPS = new Set([
  "color", "background-color", "border-color",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "outline-color",
]);

/** Background shorthand: extract color portion */
function extractBackgroundColor(value: string): string | null {
  // Simple heuristic: if background value starts with a color, extract it
  const trimmed = value.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("rgb") || /^[a-z]+$/i.test(trimmed.split(/\s/)[0])) {
    const firstToken = trimmed.split(/\s/)[0];
    if (parseColor(firstToken)) return firstToken;
  }
  return null;
}

function applyColorInversion(
  $: cheerio.CheerioAPI,
  mode: "full" | "partial",
  clientId?: string,
): void {
  // Process inline styles using parseColor for accurate detection
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    let changed = false;

    props.forEach((value, prop) => {
      if (COLOR_PROPS.has(prop)) {
        const inverted = invertColor(value, mode, clientId);
        if (inverted) {
          props.set(prop, inverted);
          changed = true;
        }
      }
      // Handle background shorthand
      if (prop === "background") {
        const bgColor = extractBackgroundColor(value);
        if (bgColor) {
          const inverted = invertColor(bgColor, mode, clientId);
          if (inverted) {
            props.set(prop, value.replace(bgColor, inverted));
            changed = true;
          }
        }
      }
    });

    if (changed) {
      $(el).attr("style", serializeStyle(props));
    }
  });

  // Process <style> blocks
  $("style").each((_, el) => {
    const cssText = $(el).text();
    try {
      const ast = csstree.parse(cssText, { parseCustomProperty: true });
      let modified = false;

      csstree.walk(ast, {
        enter(node: csstree.CssNode) {
          if (node.type !== "Declaration") return;
          const prop = node.property.toLowerCase();
          if (!COLOR_PROPS.has(prop) && prop !== "background") return;

          const valueStr = csstree.generate(node.value);
          if (prop === "background") {
            const bgColor = extractBackgroundColor(valueStr);
            if (bgColor) {
              const inverted = invertColor(bgColor, mode, clientId);
              if (inverted) {
                const newValue = valueStr.replace(bgColor, inverted);
                node.value = csstree.parse(newValue, { context: "value" }) as csstree.Value;
                modified = true;
              }
            }
          } else {
            const inverted = invertColor(valueStr, mode, clientId);
            if (inverted) {
              node.value = csstree.parse(inverted, { context: "value" }) as csstree.Value;
              modified = true;
            }
          }
        },
      });

      if (modified) {
        $(el).text(csstree.generate(ast));
      }
    } catch {
      // If css-tree can't parse it, skip
    }
  });

  // Also handle bgcolor attributes on table elements
  $("[bgcolor]").each((_, el) => {
    const bgcolor = $(el).attr("bgcolor") || "";
    const inverted = invertColor(bgcolor, mode, clientId);
    if (inverted) {
      $(el).attr("bgcolor", inverted);
    }
  });
}
