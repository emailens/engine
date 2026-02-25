import * as cheerio from "cheerio";
import type { CSSWarning } from "./types";

/**
 * Simulate dark mode rendering for an email.
 * Email clients apply dark mode differently:
 * - Some invert colors (Gmail Android)
 * - Some use prefers-color-scheme media query (Apple Mail)
 * - Some do partial inversion (Outlook.com)
 */
export function simulateDarkMode(
  html: string,
  clientId: string
): { html: string; warnings: CSSWarning[] } {
  if (!html || !html.trim()) {
    return { html: html || "", warnings: [] };
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
    case "gmail-android":
    case "gmail-ios":
      // Gmail does full color inversion on Android,
      // partial on web/iOS
      applyColorInversion($, clientId === "gmail-android" ? "full" : "partial");
      break;

    case "outlook-web":
      // Outlook.com applies its own dark mode with partial inversion
      applyColorInversion($, "partial");
      break;

    case "apple-mail-macos":
    case "apple-mail-ios":
      // Apple Mail respects prefers-color-scheme
      applyColorInversion($, "partial");
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "Apple Mail supports @media (prefers-color-scheme: dark). Consider adding dark mode styles.",
          suggestion:
            "Add a @media (prefers-color-scheme: dark) block with inverted colors for the best dark mode experience.",
        });
      }
      break;

    case "yahoo-mail":
      applyColorInversion($, "partial");
      break;

    case "samsung-mail":
      applyColorInversion($, "full");
      break;

    case "hey-mail":
      // HEY Mail respects prefers-color-scheme; simulate partial inversion
      applyColorInversion($, "partial");
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "HEY Mail supports @media (prefers-color-scheme: dark). Add dark mode styles for the best experience.",
          suggestion:
            "Add a @media (prefers-color-scheme: dark) block with inverted colors.",
        });
      }
      break;

    case "superhuman":
      // Superhuman uses Blink and respects prefers-color-scheme
      applyColorInversion($, "partial");
      if (!html.includes("prefers-color-scheme")) {
        warnings.push({
          severity: "info",
          client: clientId,
          property: "dark-mode",
          message:
            "Superhuman respects @media (prefers-color-scheme: dark). Many Superhuman users run in dark mode.",
          suggestion:
            "Add @media (prefers-color-scheme: dark) styles — Superhuman's power-user audience often prefers dark mode.",
        });
      }
      break;

    case "outlook-windows":
    case "thunderbird":
      // These don't have dark mode
      break;
  }

  // Add dark mode wrapper styling
  $("body").css("background-color", "#1a1a1a");
  $("body").css("color", "#e0e0e0");

  return { html: $.html(), warnings };
}

function applyColorInversion(
  $: cheerio.CheerioAPI,
  mode: "full" | "partial"
): void {
  // Simulate dark mode by inverting light background colors
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";

    if (mode === "full") {
      // Full inversion: swap all light backgrounds to dark
      const updated = style
        .replace(/background-color:\s*(#fff|#ffffff|white|#fafafa|#f5f5f5|#f0f0f0|#fefefe)/gi, "background-color: #1a1a1a")
        .replace(/background:\s*(#fff|#ffffff|white|#fafafa|#f5f5f5|#f0f0f0|#fefefe)/gi, "background: #1a1a1a")
        .replace(/color:\s*(#000|#000000|black|#111|#222|#333)/gi, "color: #e0e0e0")
        .replace(/color:\s*(#fff|#ffffff|white)/gi, "color: #e0e0e0")
        .replace(/border(?:-[a-z]+)?:\s*[^;]*(?:#000|#111|#222|#333|black)/gi, (match) =>
          match.replace(/#000|#111|#222|#333|black/gi, "#555")
        );
      $(el).attr("style", updated);
    } else {
      // Partial inversion: only invert very light backgrounds
      const updated = style
        .replace(/background-color:\s*(#fff|#ffffff|white)/gi, "background-color: #2d2d2d")
        .replace(/background:\s*(#fff|#ffffff|white)/gi, "background: #2d2d2d")
        .replace(/color:\s*(#000|#000000|black)/gi, "color: #d4d4d4");
      $(el).attr("style", updated);
    }
  });

  // Also handle bgcolor attributes on table elements
  $("[bgcolor]").each((_, el) => {
    const bgcolor = ($(el).attr("bgcolor") || "").toLowerCase();
    if (
      bgcolor === "#ffffff" ||
      bgcolor === "#fff" ||
      bgcolor === "white" ||
      bgcolor === "#fafafa" ||
      bgcolor === "#f5f5f5"
    ) {
      $(el).attr("bgcolor", mode === "full" ? "#1a1a1a" : "#2d2d2d");
    }
  });
}
