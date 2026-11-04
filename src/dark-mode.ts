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
      // The WebView's own algorithm, not the generic invert: see gmailAndroidColor.
      applyColorInversion($, "gmail-android", clientId);
      break;

    case "outlook-macos":
      // Measured on the real app: see outlookMacColor.
      applyColorInversion($, "outlook-macos", clientId);
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
      // Measured on the real app: see outlookClassicColor.
      applyColorInversion($, "outlook-classic", clientId);
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
  const canvas = MEASURED_CANVAS[clientId];
  if (canvas) {
    // The body's own colours went through the client's rule above.
    if (!/background(-color)?\s*:/.test(bodyStyle) && !$("body").attr("bgcolor")) $("body").css("background-color", canvas.bg);
    if (!/(^|;)\s*color\s*:/.test(bodyStyle)) $("body").css("color", canvas.fg);
    return { html: $.html(), warnings };
  }
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
/** What the client paints where an email sets no colour, measured. */
const MEASURED_CANVAS: Record<string, { bg: string; fg: string }> = {
  "outlook-macos": { bg: "#1e1e1e", fg: "#ffffff" },
  // ponytail: fg unmeasured; Word's automatic text is black, which maps here.
  "outlook-windows-legacy": { bg: "#262626", fg: "#f6f6f6" },
};

const SAMPLED_DARK: Record<string, Record<string, string>> = {
  "outlook-web": { eeeae4: "#595651" },
  "gmail-ios": { eeeae4: "#4a4438" },
};

/**
 * Gmail Android's dark mode is the WebView's algorithmic darkening: flip CIELAB
 * lightness, L -> min(110 - L, 100), keep a and b. Only text darker than
 * brightness 150 and backgrounds lighter than 206 flip, so mid-tone text gets
 * darker (#16a34a -> #008e37). A few near-whites are the app's own #121212. Text does
 * not depend on its background. The two thresholds are the only fitted numbers:
 * 518 colour pairs measured on the Gmail app, all within 4/255 per channel
 * (emailens.dev apps/app/fidelity/probes/gmail-app-batch.ts, 2026-10-31).
 * Borders follow the background rule.
 */
const hex = (c: { r: number; g: number; b: number }) =>
  "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");

// sRGB adapted to D50, the white point Skia's Lab uses.
// Not a threshold: #fdfdfd, #fafafa and #f8f8f8 flip like any other colour.
// Every pure grey from #e0e0e0 up was measured; only these five go to it.
const APP_BACKGROUND = new Set(["#ffffff", "#fefefe", "#fcfcfc", "#fbfbfb", "#f9f9f9"]);

const D50 = [0.96422, 1, 0.82521];
const TO_XYZ = [
  [0.4360747, 0.3850649, 0.1430804],
  [0.2225045, 0.7168786, 0.0606169],
  [0.0139322, 0.0971045, 0.7141733],
];
const FROM_XYZ = [
  [3.1338561, -1.6168667, -0.4906146],
  [-0.9787684, 1.9161415, 0.033454],
  [0.0719453, -0.2289914, 1.4052427],
];
const dot = (m: number[], v: number[]) => m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const labFInv = (t: number) => (t > 6 / 29 ? t ** 3 : (108 / 841) * (t - 4 / 29));

/** The colour with its CIELAB lightness set by `to(L)`, a and b kept, channels clipped. */
function withLabLightness(
  c: { r: number; g: number; b: number },
  to: (l: number) => number,
  [white, toXyz, fromXyz] = [D50, TO_XYZ, FROM_XYZ],
): string {
  const linear = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const [fx, fy, fz] = toXyz.map((row, i) => labF(dot(row, linear) / white[i]));
  const y = (to(116 * fy - 16) + 16) / 116;
  const xyz = [fx - fy + y, y, y - (fy - fz)].map((t, i) => labFInv(t) * white[i]);
  const [r, g, b] = fromXyz.map((row) => {
    const v = Math.min(1, Math.max(0, dot(row, xyz)));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  });
  return hex({ r, g, b });
}

// sRGB's own white point, which Outlook for Mac's rule is measured against.
const D65: [number[], number[][], number[][]] = [
  [0.95047, 1, 1.08883],
  [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.072175],
    [0.0193339, 0.119192, 0.9503041],
  ],
  [
    [3.2404542, -1.5371385, -0.4985314],
    [-0.969266, 1.8760108, 0.041556],
    [0.0556434, -0.2040259, 1.0572252],
  ],
];

const flipLabLightness = (c: { r: number; g: number; b: number }) =>
  withLabLightness(c, (l) => Math.min(110 - l, 100));

/**
 * Outlook for Mac's dark mode, measured on 223 cells of one probe sheet
 * (emailens.dev apps/app/fidelity/probes/outlook-mac-dark.ts, 2026-11-03).
 * In CIELAB, with a and b kept: a pure grey background inverts along
 * L -> 88.5 - 0.772 L, only ever darker; a background with any hue at all,
 * light or dark, is set to L 34.6, which is why a cream card and a near-black
 * header both turn the same warm grey. Text lighter than L 56.5 is kept; darker
 * text goes to L -> 100 - 0.772 L. bgcolor, inline and <style> are treated alike.
 */
function outlookMacColor(value: string, role: "fg" | "bg"): string | null {
  const c = parseColor(value);
  if (!c || c.a === 0) return null;
  if (role === "fg") return withLabLightness(c, (l) => Math.max(l, 100 - 0.772 * l), D65);
  if (c.r === c.g && c.g === c.b) return withLabLightness(c, (l) => Math.min(l, 88.5 - 0.772 * l), D65);
  return withLabLightness(c, () => 34.6, D65);
}

/**
 * Outlook Classic's (Word's) dark mode, measured on 223 cells of probe sheet 24
 * (emailens.dev apps/app/fidelity/probes/outlook-mac-dark.ts, 2026-11-03); 212
 * land within 4/255. Text and backgrounds take the same rule, and text does not
 * depend on its background. In linear light, luminance Y flips along the
 * measured greys (WORD_DARK_GREYS, in CIELAB L: white -> #262626, black -> #f6f6f6)
 * and each channel keeps its distance from Y scaled by sqrt(Y'/Y), so hue holds:
 * a dark green turns pale mint, a cream turns warm brown. Not modelled: the most
 * saturated blues turn cyan (#2222c3 -> #00bcff) and strong yellows darken less.
 */
const WORD_DARK_GREYS: [number, number][] = [
  [0x00, 0xf6], [0x0f, 0xe9], [0x1e, 0xe1], [0x2d, 0xd8], [0x3c, 0xce], [0x4b, 0xc4],
  [0x5a, 0xb9], [0x69, 0xae], [0x78, 0xa3], [0x87, 0x97], [0x96, 0x8b], [0xa5, 0x7e],
  [0xb4, 0x71], [0xc3, 0x63], [0xd2, 0x55], [0xe1, 0x46], [0xf0, 0x37], [0xff, 0x26],
];
const greyL = (v: number) => {
  const s = v / 255;
  return 116 * labF(s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) - 16;
};
const WORD_DARK_L = WORD_DARK_GREYS.map(([from, to]) => [greyL(from), greyL(to)]);
const wordDarkL = (l: number) => {
  const i = Math.max(1, WORD_DARK_L.findIndex(([x]) => x >= Math.min(l, 100)));
  const [[x0, y0], [x1, y1]] = [WORD_DARK_L[i - 1], WORD_DARK_L[i]];
  return y0 + ((y1 - y0) * (l - x0)) / (x1 - x0);
};

function outlookClassicColor(value: string): string | null {
  const c = parseColor(value);
  if (!c || c.a === 0) return null;
  const linear = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const l = 116 * labF(y) - 16;
  const out = labFInv((wordDarkL(l) + 16) / 116);
  const k = y > 0 ? Math.sqrt(out / y) : 1;
  const [r, g, b] = linear.map((v) => {
    const t = Math.min(1, Math.max(0, out + k * (v - y)));
    return Math.round(255 * (t <= 0.0031308 ? 12.92 * t : 1.055 * t ** (1 / 2.4) - 0.055));
  });
  return hex({ r, g, b });
}

function gmailAndroidColor(value: string, role: "fg" | "bg"): string | null {
  const parsed = parseColor(value);
  if (!parsed || parsed.a === 0) return null;
  const brightness = (parsed.r * 299 + parsed.g * 587 + parsed.b * 114) / 1000;
  if (role === "fg") return brightness < 150 ? flipLabLightness(parsed) : null;
  if (brightness <= 206) return null;
  return APP_BACKGROUND.has(hex(parsed)) ? "#121212" : flipLabLightness(parsed);
}

type InversionMode = "full" | "partial" | "gmail-android" | "outlook-macos" | "outlook-classic";

function invertColor(value: string, mode: InversionMode, clientId?: string, role: "fg" | "bg" = "bg"): string | null {
  if (mode === "gmail-android") return gmailAndroidColor(value, role);
  if (mode === "outlook-macos") return outlookMacColor(value, role);
  if (mode === "outlook-classic") return outlookClassicColor(value);
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

const BORDER_SHORTHAND = /^border(-(top|right|bottom|left))?$/;

/** A border shorthand with its colour inverted like border-color, or null. */
function invertBorder(value: string, mode: InversionMode, clientId?: string): string | null {
  let changed = false;
  const next = value.replace(/#[0-9a-f]{3,8}(?![0-9a-z])|rgba?\([^)]*\)/gi, (token) => {
    const inverted = invertColor(token, mode, clientId);
    if (!inverted) return token;
    changed = true;
    return inverted;
  });
  return changed ? next : null;
}

function applyColorInversion(
  $: cheerio.CheerioAPI,
  mode: InversionMode,
  clientId?: string,
): void {
  // Process inline styles using parseColor for accurate detection
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    let changed = false;
    // Word leaves a VML shape's own fill and stroke alone; its label still
    // flips (real KVWdnnChGCCI: the green roundrect kept green, its text went dark).
    const keepFill = mode === "outlook-classic" && $(el).is("[data-vml]");

    props.forEach((value, prop) => {
      if (keepFill && prop !== "color") return;
      if (COLOR_PROPS.has(prop)) {
        const inverted = invertColor(value, mode, clientId, prop === "color" ? "fg" : "bg");
        if (inverted) {
          props.set(prop, inverted);
          changed = true;
        }
      }
      if (BORDER_SHORTHAND.test(prop)) {
        const inverted = invertBorder(value, mode, clientId);
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
          const border = BORDER_SHORTHAND.test(prop);
          if (!COLOR_PROPS.has(prop) && prop !== "background" && !border) return;

          const valueStr = csstree.generate(node.value);
          if (border) {
            const inverted = invertBorder(valueStr, mode, clientId);
            if (inverted) {
              node.value = csstree.parse(inverted, { context: "value" }) as csstree.Value;
              modified = true;
            }
          } else if (prop === "background") {
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
            const inverted = invertColor(valueStr, mode, clientId, prop === "color" ? "fg" : "bg");
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
