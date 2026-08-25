import { splitTopLevel } from "./style-utils";
/**
 * WCAG 2.1 color parsing, luminance, and contrast utilities.
 *
 * Handles hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba() (comma and
 * space syntax), hsl()/hsla(), hwb(), oklch(), 148 named CSS colors, and
 * `transparent`. Returns null for unresolvable values like var(), inherit,
 * currentColor.
 */

export interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export type WcagGrade = "AAA" | "AA" | "AA Large" | "Fail";

// 148 CSS named colors (lowercase → [r, g, b])
const NAMED_COLORS: Record<string, [number, number, number]> = {
  aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255],
  aquamarine: [127, 255, 212], azure: [240, 255, 255], beige: [245, 245, 220],
  bisque: [255, 228, 196], black: [0, 0, 0], blanchedalmond: [255, 235, 205],
  blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42],
  burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0],
  chocolate: [210, 105, 30], coral: [255, 127, 80], cornflowerblue: [100, 149, 237],
  cornsilk: [255, 248, 220], crimson: [220, 20, 60], cyan: [0, 255, 255],
  darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11],
  darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169],
  darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47],
  darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0],
  darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139],
  darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209],
  darkviolet: [148, 0, 211], deeppink: [255, 20, 147], deepskyblue: [0, 191, 255],
  dimgray: [105, 105, 105], dimgrey: [105, 105, 105], dodgerblue: [30, 144, 255],
  firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34],
  fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255],
  gold: [255, 215, 0], goldenrod: [218, 165, 32], gray: [128, 128, 128],
  green: [0, 128, 0], greenyellow: [173, 255, 47], grey: [128, 128, 128],
  honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92],
  indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140],
  lavender: [230, 230, 250], lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0],
  lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230], lightcoral: [240, 128, 128],
  lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211],
  lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193],
  lightsalmon: [255, 160, 122], lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250],
  lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153], lightsteelblue: [176, 196, 222],
  lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50],
  linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0],
  mediumaquamarine: [102, 205, 170], mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211],
  mediumpurple: [147, 111, 219], mediumseagreen: [60, 179, 113], mediumslateblue: [123, 104, 238],
  mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133],
  midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225],
  moccasin: [255, 228, 181], navajowhite: [255, 222, 173], navy: [0, 0, 128],
  oldlace: [253, 245, 230], olive: [128, 128, 0], olivedrab: [107, 142, 35],
  orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214],
  palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238],
  palevioletred: [219, 112, 147], papayawhip: [255, 239, 213], peachpuff: [255, 218, 185],
  peru: [205, 133, 63], pink: [255, 192, 203], plum: [221, 160, 221],
  powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153],
  red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225],
  saddlebrown: [139, 69, 19], salmon: [250, 128, 114], sandybrown: [244, 164, 96],
  seagreen: [46, 139, 87], seashell: [255, 245, 238], sienna: [160, 82, 45],
  silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205],
  slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250],
  springgreen: [0, 255, 127], steelblue: [70, 130, 180], tan: [210, 180, 140],
  teal: [0, 128, 128], thistle: [216, 191, 216], tomato: [255, 99, 71],
  turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179],
  white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0],
  yellowgreen: [154, 205, 50],
};

// --- Internal conversion helpers ---

/** Parse an alpha value that may be a number (0-1) or percentage (0%-100%). */
function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const s = raw.trim();
  if (s.endsWith("%")) {
    return Math.min(1, Math.max(0, parseFloat(s) / 100));
  }
  return Math.min(1, Math.max(0, parseFloat(s)));
}

/** Clamp a value to 0-255 and round. */
function clamp255(n: number): number {
  return Math.round(Math.min(255, Math.max(0, n)));
}

/**
 * Convert HSL to RGB.
 * H in degrees [0,360), S and L in [0,1].
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1)      { r1 = c; g1 = x; b1 = 0; }
  else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hp >= 2 && hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hp >= 3 && hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hp >= 4 && hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else                        { r1 = c; g1 = 0; b1 = x; }

  return [
    clamp255((r1 + m) * 255),
    clamp255((g1 + m) * 255),
    clamp255((b1 + m) * 255),
  ];
}

/**
 * Convert HWB to RGB.
 * H in degrees, W and B in [0,1].
 */
function hwbToRgb(h: number, w: number, b: number): [number, number, number] {
  if (w + b >= 1) {
    const gray = clamp255((w / (w + b)) * 255);
    return [gray, gray, gray];
  }
  // Get pure hue as RGB via HSL(h, 100%, 50%)
  const [r0, g0, b0] = hslToRgb(h, 1, 0.5);
  return [
    clamp255(r0 / 255 * (1 - w - b) * 255 + w * 255),
    clamp255(g0 / 255 * (1 - w - b) * 255 + w * 255),
    clamp255(b0 / 255 * (1 - w - b) * 255 + w * 255),
  ];
}

/** Linear-sRGB to sRGB gamma correction. */
function linearToGamma(c: number): number {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * Convert OKLCh to RGB.
 * L in [0,1], C in [0,~0.4], H in degrees [0,360).
 */
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  // oklch → oklab
  const hRad = H * Math.PI / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // oklab → LMS (cubed roots)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // linear sRGB → sRGB gamma → 0-255
  return [
    clamp255(linearToGamma(rLin) * 255),
    clamp255(linearToGamma(gLin) * 255),
    clamp255(linearToGamma(bLin) * 255),
  ];
}

/**
 * Parse a CSS color value to RGBA. Returns null for unresolvable values.
 */
export function parseColor(value: string): RGBA | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();

  // Unresolvable
  if (v === "inherit" || v === "currentcolor" || v === "initial" || v === "unset" || v.startsWith("var(")) {
    return null;
  }

  if (v === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Named colors
  const named = NAMED_COLORS[v];
  if (named) {
    return { r: named[0], g: named[1], b: named[2], a: 1 };
  }

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16) / 255,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
    return null;
  }

  // rgb() / rgba(): comma syntax
  const rgbComma = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+%?))?\s*\)$/);
  if (rgbComma) {
    return {
      r: Math.min(255, parseInt(rgbComma[1], 10)),
      g: Math.min(255, parseInt(rgbComma[2], 10)),
      b: Math.min(255, parseInt(rgbComma[3], 10)),
      a: rgbComma[4] !== undefined ? parseAlpha(rgbComma[4]) : 1,
    };
  }

  // rgb() / rgba(): space syntax: rgb(255 0 0) or rgb(255 0 0 / 0.5) or rgb(255 0 0 / 50%)
  const rgbSpace = v.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (rgbSpace) {
    return {
      r: Math.min(255, parseInt(rgbSpace[1], 10)),
      g: Math.min(255, parseInt(rgbSpace[2], 10)),
      b: Math.min(255, parseInt(rgbSpace[3], 10)),
      a: rgbSpace[4] !== undefined ? parseAlpha(rgbSpace[4]) : 1,
    };
  }

  // hsl() / hsla(): comma syntax: hsl(120, 100%, 50%) or hsla(120, 100%, 50%, 0.5)
  const hslComma = v.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+%?))?\s*\)$/);
  if (hslComma) {
    const h = ((parseFloat(hslComma[1]) % 360) + 360) % 360;
    const s = Math.min(100, parseFloat(hslComma[2])) / 100;
    const l = Math.min(100, parseFloat(hslComma[3])) / 100;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a: hslComma[4] !== undefined ? parseAlpha(hslComma[4]) : 1 };
  }

  // hsl() / hsla(): space syntax: hsl(120 100% 50%) or hsl(120 100% 50% / 0.5)
  const hslSpace = v.match(/^hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (hslSpace) {
    const h = ((parseFloat(hslSpace[1]) % 360) + 360) % 360;
    const s = Math.min(100, parseFloat(hslSpace[2])) / 100;
    const l = Math.min(100, parseFloat(hslSpace[3])) / 100;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a: hslSpace[4] !== undefined ? parseAlpha(hslSpace[4]) : 1 };
  }

  // hwb(): hwb(120 10% 20%) or hwb(120 10% 20% / 0.5)
  const hwbMatch = v.match(/^hwb\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (hwbMatch) {
    const h = ((parseFloat(hwbMatch[1]) % 360) + 360) % 360;
    const w = Math.min(100, parseFloat(hwbMatch[2])) / 100;
    const bk = Math.min(100, parseFloat(hwbMatch[3])) / 100;
    const [r, g, b] = hwbToRgb(h, w, bk);
    return { r, g, b, a: hwbMatch[4] !== undefined ? parseAlpha(hwbMatch[4]) : 1 };
  }

  // oklch(): oklch(0.7 0.15 180) or oklch(0.7 0.15 180 / 0.5)
  const oklchMatch = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (oklchMatch) {
    const L = Math.min(1, Math.max(0, parseFloat(oklchMatch[1])));
    const C = Math.max(0, parseFloat(oklchMatch[2]));
    const H = ((parseFloat(oklchMatch[3]) % 360) + 360) % 360;
    const [r, g, b] = oklchToRgb(L, C, H);
    return { r, g, b, a: oklchMatch[4] !== undefined ? parseAlpha(oklchMatch[4]) : 1 };
  }

  return null;
}

/**
 * Format an RGBA value as an rgb() or rgba() CSS string.
 * Returns `rgba(r, g, b, a)` when alpha < 1, otherwise `rgb(r, g, b)`.
 */
export function formatRgb(rgba: RGBA): string {
  const r = clamp255(rgba.r);
  const g = clamp255(rgba.g);
  const b = clamp255(rgba.b);
  if (rgba.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${rgba.a})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Compute WCAG 2.1 relative luminance for an sRGB color.
 * Input values 0-255.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Compute the WCAG contrast ratio between two relative luminances.
 */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Determine WCAG 2.1 conformance grade for a contrast ratio.
 */
export function wcagGrade(ratio: number): WcagGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

/**
 * Alpha-blend a foreground RGBA onto an opaque background (r, g, b 0-255).
 * Returns the flattened [r, g, b] as 0-255 values.
 */
export function alphaBlend(fg: RGBA, bgR: number, bgG: number, bgB: number): [number, number, number] {
  const a = fg.a;
  return [
    Math.round(fg.r * a + bgR * (1 - a)),
    Math.round(fg.g * a + bgG * (1 - a)),
    Math.round(fg.b * a + bgB * (1 - a)),
  ];
}

/**
 * The solid colour a `background` shorthand paints, if it declares one.
 *
 * `background: #111 url(hero.png) no-repeat` paints #111 behind the image, so
 * the colour is there; it just is not the whole value. Function arguments are
 * skipped so a gradient's own stops are not mistaken for the layer beneath it.
 */
export function backgroundShorthandColor(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (parseColor(trimmed)) return trimmed; // background: #fff / rgb(255 255 255)
  for (const token of trimmed.split(/\s+/)) {
    if (token.includes("(")) continue; // url(), gradients, not a solid colour
    if (parseColor(token)) return token;
  }
  return null;
}

/** Balanced contents of every `(...)` group whose name matches `nameRe`. */
function functionArgs(value: string, nameRe: RegExp): string[] {
  const out: string[] = [];
  const re = new RegExp(nameRe.source + "\\(", nameRe.flags.includes("i") ? "gi" : "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < value.length && depth > 0) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")") depth--;
      i++;
    }
    if (depth === 0) out.push(value.slice(start, i - 1));
    re.lastIndex = i;
  }
  return out;
}

/**
 * Every colour stop declared by the gradients in a background value.
 *
 * A gradient is not opaque to analysis the way a photo is; its colours are
 * right there in the CSS, so text over one can be graded against the worst
 * stop rather than skipped. Direction and position tokens (`45deg`,
 * `to right`, `0%`) are discarded; a fully transparent stop is dropped, since
 * it shows whatever is painted beneath instead of contributing a colour.
 */
export function gradientStops(value: string | undefined): RGBA[] {
  if (!value) return [];
  const stops: RGBA[] = [];
  for (const args of functionArgs(value, /(?:repeating-)?(?:linear|radial|conic)-gradient/i)) {
    for (const part of splitTopLevel(args)) {
      const trimmed = part.trim();
      if (!trimmed || /^(?:to\b|at\b|from\b|in\b|[\d.]+(?:deg|turn|rad|grad)\b)/i.test(trimmed)) continue;
      // A stop is `<color> [position]`; the colour is the leading token,
      // except for functional colours, which carry their own parentheses.
      const fnMatch = trimmed.match(/^(?:rgba?|hsla?|color|lab|lch|oklab|oklch)\([^)]*\)/i);
      const token = fnMatch ? fnMatch[0] : trimmed.split(/\s+/)[0];
      const parsed = parseColor(token);
      if (parsed && parsed.a > 0) stops.push(parsed);
    }
  }
  return stops;
}

/** sRGB gamma to linear-sRGB: the inverse of {@link linearToGamma}. */
function gammaToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Convert sRGB to OKLab.
 *
 * OKLab is built so that straight-line distance between two points matches how
 * different the colours look, which sRGB emphatically does not: `#333` and
 * `#343434` are far apart in RGB terms and identical to a reader.
 */
export function rgbToOklab(rgba: RGBA): [number, number, number] {
  const r = gammaToLinear(rgba.r);
  const g = gammaToLinear(rgba.g);
  const b = gammaToLinear(rgba.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/**
 * Perceptual distance between two colours, as OKLab delta-E.
 *
 * Roughly: under ~0.02 the two are the same colour to a reader, and around
 * ~0.1 they are clearly different.
 */
export function colorDistance(a: RGBA, b: RGBA): number {
  const [l1, a1, b1] = rgbToOklab(a);
  const [l2, a2, b2] = rgbToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
