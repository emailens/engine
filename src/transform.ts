import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import type { CSSWarning, Framework, TransformResult } from "./types";
import {
  CSS_SUPPORT,
  GMAIL_STRIPPED_PROPERTIES,
  OUTLOOK_WORD_UNSUPPORTED,
  STRUCTURAL_FIX_PROPERTIES,
} from "./rules/css-support";
import { getCodeFix, getSuggestion, isCodeFixGenericFallback } from "./fix-snippets";
import { parseInlineStyle, serializeStyle } from "./style-utils";

// --- Inline <style> blocks into elements using css-tree ---
function inlineStyles($: cheerio.CheerioAPI): void {
  const styleBlocks: string[] = [];
  $("style").each((_, el) => {
    styleBlocks.push($(el).text());
  });

  if (styleBlocks.length === 0) return;

  for (const block of styleBlocks) {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(block, { parseCustomProperty: true });
    } catch {
      // If css-tree can't parse it, skip this block
      continue;
    }

    csstree.walk(ast, {
      visit: "Rule",
      enter(node: csstree.CssNode) {
        if (node.type !== "Rule" || node.prelude.type !== "SelectorList") return;

        // Generate the declarations string from the block
        const declarations = csstree.generate(node.block);
        // Strip the outer braces: "{ color: red; }" -> "color: red;"
        const declText = declarations.slice(1, -1).trim();
        if (!declText) return;

        // Get the selector text
        const selectorText = csstree.generate(node.prelude);

        // Skip pseudo-selectors for inlining (can't be applied as inline styles)
        if (selectorText.includes(":hover") ||
            selectorText.includes(":focus") ||
            selectorText.includes(":active") ||
            selectorText.includes("::")) {
          return;
        }

        try {
          $(selectorText).each((_, el) => {
            const existing = $(el).attr("style") || "";
            $(el).attr("style", existing ? `${existing}; ${declText}` : declText);
          });
        } catch {
          // Invalid selector for cheerio, skip
        }
      },
    });
  }
}

/** Build a CSSWarning with framework-aware suggestion + fix + fallback flag. */
function makeWarning(
  base: Omit<CSSWarning, "suggestion" | "fix" | "fixIsGenericFallback" | "fixType">,
  prop: string,
  clientId: string,
  framework?: Framework,
): CSSWarning {
  const sug = getSuggestion(prop, clientId, framework);
  const fix = getCodeFix(prop, clientId, framework);
  const isFallback = framework && (
    (sug?.isGenericFallback) ||
    (fix && isCodeFixGenericFallback(prop, clientId, framework))
  );
  return {
    ...base,
    ...(sug ? { suggestion: sug.text } : {}),
    ...(fix ? { fix } : {}),
    ...(isFallback ? { fixIsGenericFallback: true } : {}),
    fixType: STRUCTURAL_FIX_PROPERTIES.has(prop) ? "structural" : "css",
  };
}

// =============================================================================
// Per-Client Transformers
// =============================================================================

function transformGmail(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Check for @font-face BEFORE removing <style> blocks
  let hasAtFontFace = false;
  $("style").each((_, el) => {
    try {
      const ast = csstree.parse($(el).text());
      csstree.walk(ast, {
        enter(node: csstree.CssNode) {
          if (node.type === "Atrule" && node.name === "font-face") {
            hasAtFontFace = true;
          }
        },
      });
    } catch { /* skip unparseable CSS */ }
  });
  if (hasAtFontFace) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "@font-face",
      message: "Gmail does not support custom web fonts.",
    }, "@font-face", clientId, framework));
  }

  // Gmail strips <style> blocks — inline them first
  inlineStyles($);
  $("style").remove();
  $("link[rel='stylesheet']").remove();

  // Gmail also strips MSO conditional comments (<!--[if mso]>...<![endif]-->)
  // Cheerio treats these as HTML comments; remove any that contain <style>
  $("*")
    .contents()
    .filter(function () {
      return this.type === "comment";
    })
    .each(function () {
      const commentText = (this as unknown as { data: string }).data || "";
      if (commentText.includes("<style") || commentText.includes("[if mso]") || commentText.includes("[if gte mso")) {
        $(this).remove();
      }
    });

  const styleSug = getSuggestion("<style>:partial", clientId, framework);
  warnings.push({
    severity: "info",
    client: clientId,
    property: "<style>",
    message: "Gmail partially supports <style> blocks (head only, 16KB limit). Inlining recommended for safety.",
    suggestion: styleSug.text,
  });

  // Strip unsupported CSS properties from inline styles
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    const removed: string[] = [];

    props.forEach((value, prop) => {
      if (GMAIL_STRIPPED_PROPERTIES.has(prop)) {
        removed.push(prop);
        props.delete(prop);
      }
      // Gmail supports display:flex but NOT display:grid
      if (prop === "display" && value.includes("grid")) {
        removed.push(prop);
        props.delete(prop);
      }
      // Gmail strips gradient values from background shorthand
      if ((prop === "background") &&
          (value.includes("linear-gradient") || value.includes("radial-gradient"))) {
        removed.push(prop);
        props.delete(prop);
      }
    });

    if (removed.length > 0) {
      $(el).attr("style", serializeStyle(props));
      for (const prop of removed) {
        warnings.push(makeWarning({
          severity: "warning",
          client: clientId,
          property: prop,
          message: `Gmail strips "${prop}" from inline styles.`,
        }, prop, clientId, framework));
      }
    }
  });

  // Gmail removes <svg> elements
  if ($("svg").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<svg>",
      message: "Gmail does not support inline SVG elements.",
    }, "<svg>", clientId, framework));
    $("svg").each((_, el) => {
      $(el).replaceWith('<img alt="[SVG not supported]" />');
    });
  }

  // Gmail removes <form> elements
  if ($("form").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<form>",
      message: "Gmail strips all form elements.",
    }, "<form>", clientId, framework));
    $("form").each((_, el) => {
      $(el).replaceWith($(el).html() || "");
    });
  }

  return { clientId, html: $.html(), warnings };
}

function transformOutlookWindows(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Outlook Windows uses Word rendering — keep <style> blocks but strip unsupported properties
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    const removed: string[] = [];

    props.forEach((value, prop) => {
      if (OUTLOOK_WORD_UNSUPPORTED.has(prop)) {
        removed.push(prop);
        props.delete(prop);
      }
      // Outlook doesn't support gradient values in background shorthand
      if ((prop === "background" || prop === "background-image") &&
          (value.includes("linear-gradient") || value.includes("radial-gradient"))) {
        removed.push(prop);
        props.delete(prop);
      }
    });

    if (removed.length > 0) {
      $(el).attr("style", serializeStyle(props));
      for (const prop of removed) {
        warnings.push(makeWarning({
          severity: "warning",
          client: clientId,
          property: prop,
          message: `Outlook Windows (Word engine) does not support "${prop}".`,
        }, prop, clientId, framework));
      }
    }
  });

  // Outlook doesn't support border-radius
  const borderRadiusElements = $("[style*='border-radius']");
  if (borderRadiusElements.length > 0) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "border-radius",
      message:
        "Outlook Windows ignores border-radius. Buttons and containers will have sharp corners.",
    }, "border-radius", clientId, framework));
  }

  // Outlook doesn't support max-width
  const maxWidthElements = $("[style*='max-width']");
  if (maxWidthElements.length > 0) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "max-width",
      message: "Outlook Windows ignores max-width.",
    }, "max-width", clientId, framework));
  }

  // Check for div-based layouts (Outlook prefers tables)
  const hasDivLayout =
    $("div[style*='display']").length > 0 ||
    $("div[style*='flex']").length > 0 ||
    $("div[style*='grid']").length > 0;

  if (hasDivLayout) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "display:flex",
      message:
        "Outlook Windows uses Microsoft Word for rendering. Flexbox and Grid layouts will break.",
    }, "display:flex", clientId, framework));
  }

  // Warn about background images needing VML
  if (
    $("[style*='background-image']").length > 0 ||
    $("[style*='background:']").filter((_, el) =>
      ($(el).attr("style") || "").includes("url(")
    ).length > 0
  ) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "background-image",
      message:
        "Outlook Windows requires VML for background images.",
    }, "background-image", clientId, framework));
  }

  return { clientId, html: $.html(), warnings };
}

function transformOutlookWeb(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Outlook.com supports <style> blocks but strips some properties
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    const removed: string[] = [];

    const outlookWebUnsupported = new Set([
      "position",
      "transform",
      "animation",
      "transition",
    ]);

    props.forEach((_, prop) => {
      if (outlookWebUnsupported.has(prop)) {
        removed.push(prop);
        props.delete(prop);
      }
    });

    if (removed.length > 0) {
      $(el).attr("style", serializeStyle(props));
      for (const prop of removed) {
        warnings.push(makeWarning({
          severity: "warning",
          client: clientId,
          property: prop,
          message: `Outlook 365 Web does not support "${prop}".`,
        }, prop, clientId, framework));
      }
    }
  });

  return { clientId, html: $.html(), warnings };
}

function transformAppleMail(
  html: string,
  clientId: string,
  _framework?: Framework,
): TransformResult {
  const warnings: CSSWarning[] = [];

  // Apple Mail is the most standards-compliant — minimal transformations needed
  // Just flag potential dark mode issues
  const $ = cheerio.load(html);

  // Check for dark mode issues
  const imgsWithTransparentBg = $("img").filter((_, el) => {
    const src = $(el).attr("src") || "";
    return src.endsWith(".png") || src.endsWith(".svg");
  });

  if (imgsWithTransparentBg.length > 0) {
    warnings.push({
      severity: "info",
      client: clientId,
      property: "dark-mode",
      message:
        "PNG/SVG images with transparent backgrounds may become invisible in Apple Mail dark mode.",
      suggestion:
        "Add a white background or padding around images, or use dark-mode-friendly image variants.",
    });
  }

  return { clientId, html: $.html(), warnings };
}

function transformYahooMail(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Yahoo rewrites CSS class names by prefixing them
  warnings.push({
    severity: "info",
    client: clientId,
    property: "class",
    message:
      "Yahoo Mail rewrites CSS class names with a prefix. Class-based selectors in <style> blocks will still work but the names change.",
  });

  // Yahoo has limited support for background shorthand with images
  if (
    $("[style*='background']").filter((_, el) =>
      ($(el).attr("style") || "").includes("url(")
    ).length > 0
  ) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "background-image",
      message:
        "Yahoo Mail has inconsistent support for CSS background images.",
    }, "background-image", clientId, framework));
  }

  // Yahoo strips position, box-shadow, transform
  const yahooStripped = new Set([
    "position",
    "box-shadow",
    "transform",
    "animation",
    "transition",
    "opacity",
  ]);

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    const removed: string[] = [];

    props.forEach((_, prop) => {
      if (yahooStripped.has(prop)) {
        removed.push(prop);
        props.delete(prop);
      }
    });

    if (removed.length > 0) {
      $(el).attr("style", serializeStyle(props));
      for (const prop of removed) {
        warnings.push(makeWarning({
          severity: "warning",
          client: clientId,
          property: prop,
          message: `Yahoo Mail strips "${prop}" from styles.`,
        }, prop, clientId, framework));
      }
    }
  });

  return { clientId, html: $.html(), warnings };
}

function transformSamsungMail(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Samsung Mail supports @media queries which is useful
  // But has some quirks with certain CSS properties
  const samsungPartial = new Set([
    "box-shadow",
    "transform",
    "animation",
    "transition",
    "opacity",
  ]);

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);

    props.forEach((_, prop) => {
      if (samsungPartial.has(prop)) {
        warnings.push(makeWarning({
          severity: "info",
          client: clientId,
          property: prop,
          message: `Samsung Mail has limited support for "${prop}".`,
        }, prop, clientId, framework));
      }
    });
  });

  return { clientId, html: $.html(), warnings };
}

function transformThunderbird(
  html: string,
  clientId: string,
  _framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Thunderbird is Gecko-based, very standards-compliant
  // Check for animation/transition in inline styles and <style> blocks
  let hasAnimationOrTransition = false;

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    props.forEach((_, prop) => {
      if (
        prop === "animation" ||
        prop === "transition" ||
        prop.startsWith("animation-") ||
        prop.startsWith("transition-")
      ) {
        hasAnimationOrTransition = true;
      }
    });
  });

  if (!hasAnimationOrTransition) {
    $("style").each((_, el) => {
      try {
        const ast = csstree.parse($(el).text());
        csstree.walk(ast, {
          enter(node: csstree.CssNode) {
            if (node.type === "Declaration") {
              const prop = node.property.toLowerCase();
              if (prop === "animation" || prop === "transition" ||
                  prop.startsWith("animation-") || prop.startsWith("transition-")) {
                hasAnimationOrTransition = true;
              }
            }
          },
        });
      } catch { /* skip unparseable CSS */ }
    });
  }

  if (hasAnimationOrTransition) {
    warnings.push({
      severity: "info",
      client: clientId,
      property: "animation",
      message:
        "Thunderbird does not support CSS animations or transitions.",
    });
  }

  return { clientId, html: $.html(), warnings };
}

function transformHeyMail(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // HEY Mail uses WebKit rendering and is standards-compliant
  // but strips certain CSS properties and elements for security
  const heyStripped = new Set([
    "transform",
    "animation",
    "transition",
  ]);

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    const removed: string[] = [];

    props.forEach((value, prop) => {
      if (heyStripped.has(prop)) {
        removed.push(prop);
        props.delete(prop);
      }
      // HEY strips fixed/sticky positioning
      if (prop === "position" && (value.includes("fixed") || value.includes("sticky"))) {
        removed.push(prop);
        props.delete(prop);
      }
    });

    if (removed.length > 0) {
      $(el).attr("style", serializeStyle(props));
      for (const prop of removed) {
        warnings.push(makeWarning({
          severity: "warning",
          client: clientId,
          property: prop,
          message: `HEY Mail strips "${prop}" for security and rendering consistency.`,
        }, prop, clientId, framework));
      }
    }
  });

  // HEY strips <form> elements
  if ($("form").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<form>",
      message: "HEY Mail removes form elements for security.",
    }, "<form>", clientId, framework));
    $("form").each((_, el) => {
      $(el).replaceWith($(el).html() || "");
    });
  }

  // HEY strips external stylesheets
  if ($("link[rel='stylesheet']").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<link>",
      message: "HEY Mail does not load external stylesheets.",
    }, "<link>", clientId, framework));
    $("link[rel='stylesheet']").remove();
  }

  // HEY supports dark mode — warn if no dark mode styles present
  if (!html.includes("prefers-color-scheme")) {
    warnings.push({
      severity: "info",
      client: clientId,
      property: "dark-mode",
      message: "HEY Mail supports @media (prefers-color-scheme: dark). Consider adding dark mode styles.",
      suggestion: "Add a @media (prefers-color-scheme: dark) block to optimize for HEY's audience.",
    });
  }

  return { clientId, html: $.html(), warnings };
}

function transformSuperhuman(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];

  // Superhuman uses Blink/Chromium — very strong modern CSS support
  // It strips <form> elements and external stylesheets for security

  if ($("form").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<form>",
      message: "Superhuman removes form elements.",
    }, "<form>", clientId, framework));
    $("form").each((_, el) => {
      $(el).replaceWith($(el).html() || "");
    });
  }

  if ($("link[rel='stylesheet']").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<link>",
      message: "Superhuman does not load external stylesheets.",
    }, "<link>", clientId, framework));
    $("link[rel='stylesheet']").remove();
  }

  // Check for animation usage — may be disabled per OS accessibility settings.
  // Both shorthand ("animation", "transition") and sub-properties
  // ("animation-duration", "transition-delay", etc.) are checked so that
  // elements using only sub-properties don't silently bypass the warning.
  let hasAnimation = false;
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    props.forEach((_, prop) => {
      if (
        prop === "animation" ||
        prop === "transition" ||
        prop.startsWith("animation-") ||
        prop.startsWith("transition-")
      ) {
        hasAnimation = true;
      }
    });
  });

  if (!hasAnimation) {
    $("style").each((_, el) => {
      try {
        const ast = csstree.parse($(el).text());
        csstree.walk(ast, {
          enter(node: csstree.CssNode) {
            if (node.type === "Declaration") {
              const prop = node.property.toLowerCase();
              if (prop === "animation" || prop === "transition" ||
                  prop.startsWith("animation-") || prop.startsWith("transition-")) {
                hasAnimation = true;
              }
            }
          },
        });
      } catch { /* skip unparseable CSS */ }
    });
  }

  if (hasAnimation) {
    warnings.push({
      severity: "info",
      client: clientId,
      property: "animation",
      message: "Superhuman may honor OS-level 'reduce motion' preferences, disabling animations.",
      suggestion: "Use @media (prefers-reduced-motion: reduce) to provide static fallbacks.",
    });
  }

  warnings.push({
    severity: "info",
    client: clientId,
    property: "<style>",
    message: "Superhuman uses Chromium rendering with excellent CSS support. Flexbox, Grid, CSS variables, and modern properties all work.",
  });

  return { clientId, html: $.html(), warnings };
}

// =============================================================================
// Main transform dispatcher
// =============================================================================

const TRANSFORMERS: Record<
  string,
  (html: string, clientId: string, framework?: Framework) => TransformResult
> = {
  "gmail-web": transformGmail,
  "gmail-android": transformGmail,
  "gmail-ios": transformGmail,
  "outlook-web": transformOutlookWeb,
  "outlook-windows": transformOutlookWindows,
  "apple-mail-macos": transformAppleMail,
  "apple-mail-ios": transformAppleMail,
  "yahoo-mail": transformYahooMail,
  "samsung-mail": transformSamsungMail,
  "thunderbird": transformThunderbird,
  "hey-mail": transformHeyMail,
  "superhuman": transformSuperhuman,
};

export function transformForClient(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  if (!html || !html.trim()) {
    return { clientId, html: html || "", warnings: [] };
  }

  const transformer = TRANSFORMERS[clientId];
  if (!transformer) {
    return {
      clientId,
      html,
      warnings: [
        {
          severity: "info",
          client: clientId,
          property: "unknown",
          message: `No transformation rules available for client "${clientId}".`,
        },
      ],
    };
  }
  return transformer(html, clientId, framework);
}

export function transformForAllClients(html: string, framework?: Framework): TransformResult[] {
  return Object.keys(TRANSFORMERS).map((clientId) =>
    transformForClient(html, clientId, framework)
  );
}
