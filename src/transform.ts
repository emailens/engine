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
import { downlevelCSS } from "./downlevel";
import { MAX_HTML_SIZE } from "./constants";

// =============================================================================
// Shared helpers
// =============================================================================

/** Check if a selector contains pseudo-classes or pseudo-elements. */
function hasPseudoSelector(selector: string): boolean {
  // Match :pseudo or ::pseudo — but not bare : in attribute selectors like [attr:value]
  // This catches :hover, :focus, :nth-of-type, :not(), ::before, ::after, etc.
  return /(?<![[\w])::?[a-z][\w-]*(?:\(|(?=[^(]))/i.test(selector);
}

/** Add !important to all declarations in an at-rule AST node. */
function addImportantToDeclarations(node: csstree.CssNode): void {
  csstree.walk(node, {
    visit: "Declaration",
    enter(decl: csstree.CssNode) {
      if (decl.type !== "Declaration") return;
      if (decl.important) return;
      decl.important = true;
    },
  });
}

/** Inline <style> blocks into elements using css-tree. Returns non-inlinable CSS. */
function inlineStyles($: cheerio.CheerioAPI): string {
  const styleBlocks: string[] = [];
  $("style").each((_, el) => {
    styleBlocks.push($(el).text());
  });

  if (styleBlocks.length === 0) return "";

  const preserved: string[] = [];

  for (const block of styleBlocks) {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(block, { parseCustomProperty: true });
    } catch {
      continue;
    }

    // Collect non-inlinable at-rules (@media, @supports, @keyframes)
    csstree.walk(ast, {
      visit: "Atrule",
      enter(node: csstree.CssNode) {
        if (node.type !== "Atrule") return;
        const name = node.name.toLowerCase();
        if (name === "media" || name === "supports" || name === "keyframes" || name === "-webkit-keyframes" || name === "font-face") {
          // Add !important to declarations inside @media/@supports so they override inline styles
          if (name === "media" || name === "supports") {
            addImportantToDeclarations(node);
          }
          preserved.push(csstree.generate(node));
          return this.skip;
        }
      },
    });

    // Inline regular rules and collect pseudo-selector rules
    csstree.walk(ast, {
      visit: "Rule",
      enter(node: csstree.CssNode) {
        if (node.type !== "Rule" || node.prelude.type !== "SelectorList") return;

        const declarations = csstree.generate(node.block);
        const declText = declarations.slice(1, -1).trim();
        if (!declText) return;

        const selectorText = csstree.generate(node.prelude);

        if (hasPseudoSelector(selectorText)) {
          preserved.push(csstree.generate(node));
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

  return preserved.join("\n");
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

/** Detect animation/transition usage in inline styles and <style> blocks. */
function detectAnimations($: cheerio.CheerioAPI): boolean {
  let found = false;

  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const props = parseInlineStyle(style);
    props.forEach((_, prop) => {
      if (
        prop === "animation" || prop === "transition" ||
        prop.startsWith("animation-") || prop.startsWith("transition-")
      ) {
        found = true;
      }
    });
  });

  if (!found) {
    $("style").each((_, el) => {
      try {
        const ast = csstree.parse($(el).text());
        csstree.walk(ast, {
          enter(node: csstree.CssNode) {
            if (node.type === "Declaration") {
              const prop = node.property.toLowerCase();
              if (prop === "animation" || prop === "transition" ||
                  prop.startsWith("animation-") || prop.startsWith("transition-")) {
                found = true;
              }
            }
          },
        });
      } catch { /* skip unparseable CSS */ }
    });
  }

  return found;
}

// =============================================================================
// Data-driven client config
// =============================================================================

interface ClientTransformConfig {
  id: string;
  /** CSS properties stripped from inline styles */
  strippedProperties: Set<string>;
  /** How stripped properties are treated: "strip" removes them, "info" just warns */
  stripMode: "strip" | "info";
  /** Custom value-level checks (e.g., display:grid but not display:flex) */
  valueStrips?: Array<{ prop: string; pattern: RegExp }>;
  /** Whether to inline <style> blocks and remove them */
  inlineAndStripStyles: boolean;
  /** Whether to strip <link rel="stylesheet"> */
  stripExternalStylesheets: boolean;
  /** Whether to strip <form> elements */
  stripForms: boolean;
  /** Whether to strip <svg> elements */
  stripSvg: boolean;
  /** Additional checks to run (animation detection, dark mode hints, etc.) */
  additionalChecks?: (
    $: cheerio.CheerioAPI,
    clientId: string,
    html: string,
    framework?: Framework,
  ) => CSSWarning[];
}

// -- Shared additional check functions --

function gmailAdditionalChecks(
  $: cheerio.CheerioAPI,
  clientId: string,
  _html: string,
  framework?: Framework,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];

  // Check for @font-face (must happen before style removal — called pre-strip)
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

  return warnings;
}

function gmailPostChecks(
  $: cheerio.CheerioAPI,
  clientId: string,
  _html: string,
  framework?: Framework,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];

  // Remove MSO conditional comments
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

  return warnings;
}

function outlookWindowsAdditionalChecks(
  $: cheerio.CheerioAPI,
  clientId: string,
  _html: string,
  framework?: Framework,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];

  if ($("[style*='border-radius']").length > 0) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "border-radius",
      message: "Outlook Classic ignores border-radius. Buttons and containers will have sharp corners.",
    }, "border-radius", clientId, framework));
  }

  if ($("[style*='max-width']").length > 0) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "max-width",
      message: "Outlook Classic ignores max-width.",
    }, "max-width", clientId, framework));
  }

  const hasDivLayout =
    $("div[style*='display']").length > 0 ||
    $("div[style*='flex']").length > 0 ||
    $("div[style*='grid']").length > 0;

  if (hasDivLayout) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "display:flex",
      message: "Outlook Classic uses Microsoft Word for rendering. Flexbox and Grid layouts will break.",
    }, "display:flex", clientId, framework));
  }

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
      message: "Outlook Classic requires VML for background images.",
    }, "background-image", clientId, framework));
  }

  return warnings;
}

function appleMailAdditionalChecks(
  $: cheerio.CheerioAPI,
  clientId: string,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];

  const imgsWithTransparentBg = $("img").filter((_, el) => {
    const src = $(el).attr("src") || "";
    return src.endsWith(".png") || src.endsWith(".svg");
  });

  if (imgsWithTransparentBg.length > 0) {
    warnings.push({
      severity: "info",
      client: clientId,
      property: "dark-mode",
      message: "PNG/SVG images with transparent backgrounds may become invisible in Apple Mail dark mode.",
      suggestion: "Add a white background or padding around images, or use dark-mode-friendly image variants.",
    });
  }

  return warnings;
}

function yahooAdditionalChecks(
  $: cheerio.CheerioAPI,
  clientId: string,
  _html: string,
  framework?: Framework,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];

  warnings.push({
    severity: "info",
    client: clientId,
    property: "class",
    message: "Yahoo Mail rewrites CSS class names with a prefix. Class-based selectors in <style> blocks will still work but the names change.",
  });

  if (
    $("[style*='background']").filter((_, el) =>
      ($(el).attr("style") || "").includes("url(")
    ).length > 0
  ) {
    warnings.push(makeWarning({
      severity: "warning",
      client: clientId,
      property: "background-image",
      message: "Yahoo Mail has inconsistent support for CSS background images.",
    }, "background-image", clientId, framework));
  }

  return warnings;
}

function thunderbirdAdditionalChecks(
  $: cheerio.CheerioAPI,
  clientId: string,
): CSSWarning[] {
  if (detectAnimations($)) {
    return [{
      severity: "info",
      client: clientId,
      property: "animation",
      message: "Thunderbird does not support CSS animations or transitions.",
    }];
  }
  return [];
}

function heyAdditionalChecks(
  _$: cheerio.CheerioAPI,
  clientId: string,
  html: string,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];

  if (!html.includes("prefers-color-scheme")) {
    warnings.push({
      severity: "info",
      client: clientId,
      property: "dark-mode",
      message: "HEY Mail supports @media (prefers-color-scheme: dark). Consider adding dark mode styles.",
      suggestion: "Add a @media (prefers-color-scheme: dark) block to optimize for HEY's audience.",
    });
  }

  return warnings;
}

function superhumanAdditionalChecks(
  $: cheerio.CheerioAPI,
  clientId: string,
  html: string,
): CSSWarning[] {
  const warnings: CSSWarning[] = [];

  if (detectAnimations($)) {
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

  return warnings;
}

// =============================================================================
// Per-client configurations (declarative data)
// =============================================================================

const EMPTY_SET: Set<string> = new Set();

const CLIENT_CONFIGS: Record<string, ClientTransformConfig> = {
  "gmail-web": {
    id: "gmail-web",
    strippedProperties: GMAIL_STRIPPED_PROPERTIES,
    stripMode: "strip",
    valueStrips: [
      { prop: "display", pattern: /grid/ },
      { prop: "background", pattern: /linear-gradient|radial-gradient/ },
    ],
    inlineAndStripStyles: true,
    stripExternalStylesheets: true,
    stripForms: true,
    stripSvg: true,
    additionalChecks: gmailAdditionalChecks,
  },
  "gmail-android": {
    id: "gmail-android",
    strippedProperties: GMAIL_STRIPPED_PROPERTIES,
    stripMode: "strip",
    valueStrips: [
      { prop: "display", pattern: /grid/ },
      { prop: "background", pattern: /linear-gradient|radial-gradient/ },
    ],
    inlineAndStripStyles: true,
    stripExternalStylesheets: true,
    stripForms: true,
    stripSvg: true,
    additionalChecks: gmailAdditionalChecks,
  },
  "gmail-ios": {
    id: "gmail-ios",
    strippedProperties: GMAIL_STRIPPED_PROPERTIES,
    stripMode: "strip",
    valueStrips: [
      { prop: "display", pattern: /grid/ },
      { prop: "background", pattern: /linear-gradient|radial-gradient/ },
    ],
    inlineAndStripStyles: true,
    stripExternalStylesheets: true,
    stripForms: true,
    stripSvg: true,
    additionalChecks: gmailAdditionalChecks,
  },
  "outlook-windows": {
    id: "outlook-windows",
    strippedProperties: new Set(["position", "transform", "animation", "transition"]),
    stripMode: "strip",
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
  },
  "outlook-windows-legacy": {
    id: "outlook-windows-legacy",
    strippedProperties: OUTLOOK_WORD_UNSUPPORTED,
    stripMode: "strip",
    valueStrips: [
      { prop: "background", pattern: /linear-gradient|radial-gradient/ },
      { prop: "background-image", pattern: /linear-gradient|radial-gradient/ },
    ],
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
    additionalChecks: outlookWindowsAdditionalChecks,
  },
  "outlook-web": {
    id: "outlook-web",
    strippedProperties: new Set(["position", "transform", "animation", "transition"]),
    stripMode: "strip",
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
  },
  "apple-mail-macos": {
    id: "apple-mail-macos",
    strippedProperties: EMPTY_SET,
    stripMode: "strip",
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
    additionalChecks: appleMailAdditionalChecks,
  },
  "apple-mail-ios": {
    id: "apple-mail-ios",
    strippedProperties: EMPTY_SET,
    stripMode: "strip",
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
    additionalChecks: appleMailAdditionalChecks,
  },
  "yahoo-mail": {
    id: "yahoo-mail",
    strippedProperties: new Set(["position", "box-shadow", "transform", "animation", "transition", "opacity"]),
    stripMode: "strip",
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
    additionalChecks: yahooAdditionalChecks,
  },
  "samsung-mail": {
    id: "samsung-mail",
    strippedProperties: new Set(["box-shadow", "transform", "animation", "transition", "opacity"]),
    stripMode: "info",
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
  },
  "thunderbird": {
    id: "thunderbird",
    strippedProperties: EMPTY_SET,
    stripMode: "strip",
    inlineAndStripStyles: false,
    stripExternalStylesheets: false,
    stripForms: false,
    stripSvg: false,
    additionalChecks: thunderbirdAdditionalChecks,
  },
  "hey-mail": {
    id: "hey-mail",
    strippedProperties: new Set(["transform", "animation", "transition"]),
    stripMode: "strip",
    valueStrips: [
      { prop: "position", pattern: /fixed|sticky/ },
    ],
    inlineAndStripStyles: false,
    stripExternalStylesheets: true,
    stripForms: true,
    stripSvg: false,
    additionalChecks: heyAdditionalChecks,
  },
  "superhuman": {
    id: "superhuman",
    strippedProperties: EMPTY_SET,
    stripMode: "strip",
    inlineAndStripStyles: false,
    stripExternalStylesheets: true,
    stripForms: true,
    stripSvg: false,
    additionalChecks: superhumanAdditionalChecks,
  },
};

// =============================================================================
// Shared transform engine
// =============================================================================

function applyTransform(
  html: string,
  config: ClientTransformConfig,
  framework?: Framework,
): TransformResult {
  const $ = cheerio.load(html);
  const warnings: CSSWarning[] = [];
  const clientId = config.id;

  // 1a. Pre-strip additional checks (e.g., Gmail @font-face detection)
  if (config.additionalChecks && config.inlineAndStripStyles) {
    warnings.push(...config.additionalChecks($, clientId, html, framework));
  }

  // 1b. Inline + strip <style> if needed
  if (config.inlineAndStripStyles) {
    const preserved = inlineStyles($);
    $("style").remove();
    if (preserved.trim()) {
      const head = $("head");
      if (head.length > 0) {
        head.append(`<style>${preserved}</style>`);
      } else {
        // If no <head>, prepend to body
        $("body").prepend(`<style>${preserved}</style>`);
      }
    }
  }

  // 2. Strip external stylesheets
  if (config.stripExternalStylesheets) {
    if ($("link[rel='stylesheet']").length > 0) {
      warnings.push(makeWarning({
        severity: "error",
        client: clientId,
        property: "<link>",
        message: `${clientId} does not load external stylesheets.`,
      }, "<link>", clientId, framework));
      $("link[rel='stylesheet']").remove();
    }
  }

  // 3. Strip forms
  if (config.stripForms && $("form").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<form>",
      message: `${clientId} removes form elements.`,
    }, "<form>", clientId, framework));
    $("form").each((_, el) => {
      $(el).replaceWith($(el).html() || "");
    });
  }

  // 4. Strip SVG
  if (config.stripSvg && $("svg").length > 0) {
    warnings.push(makeWarning({
      severity: "error",
      client: clientId,
      property: "<svg>",
      message: `${clientId} does not support inline SVG elements.`,
    }, "<svg>", clientId, framework));
    $("svg").each((_, el) => {
      $(el).replaceWith('<img alt="[SVG not supported]" />');
    });
  }

  // 5. Strip/warn about unsupported CSS properties (shared loop)
  if (config.strippedProperties.size > 0 || (config.valueStrips && config.valueStrips.length > 0)) {
    $("[style]").each((_, el) => {
      const style = $(el).attr("style") || "";
      const props = parseInlineStyle(style);
      const removed: string[] = [];

      props.forEach((value, prop) => {
        // Check stripped properties
        if (config.strippedProperties.has(prop)) {
          if (config.stripMode === "strip") {
            removed.push(prop);
            props.delete(prop);
          } else {
            warnings.push(makeWarning({
              severity: "info",
              client: clientId,
              property: prop,
              message: `${clientId} has limited support for "${prop}".`,
            }, prop, clientId, framework));
          }
          return;
        }

        // Check value-level strips
        for (const vs of config.valueStrips ?? []) {
          if (prop === vs.prop && vs.pattern.test(value)) {
            removed.push(prop);
            props.delete(prop);
            return;
          }
        }
      });

      if (removed.length > 0) {
        $(el).attr("style", serializeStyle(props));
        for (const prop of removed) {
          warnings.push(makeWarning({
            severity: "warning",
            client: clientId,
            property: prop,
            message: `${clientId} strips "${prop}" from styles.`,
          }, prop, clientId, framework));
        }
      }
    });
  }

  // 6. Gmail-specific post-strip checks (MSO comments, partial style info)
  if (config.inlineAndStripStyles) {
    warnings.push(...gmailPostChecks($, clientId, html, framework));
  }

  // 7. Run additional checks (non-Gmail, or non-pre-strip)
  if (config.additionalChecks && !config.inlineAndStripStyles) {
    warnings.push(...config.additionalChecks($, clientId, html, framework));
  }

  return { clientId, html: $.html(), warnings };
}

// =============================================================================
// Public API
// =============================================================================

export function transformForClient(
  html: string,
  clientId: string,
  framework?: Framework,
): TransformResult {
  if (!html || !html.trim()) {
    return { clientId, html: html || "", warnings: [] };
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  const config = CLIENT_CONFIGS[clientId];
  if (!config) {
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

  // Downlevel once per transformForClient call
  const downleveled = downlevelCSS(html);
  return applyTransform(downleveled, config, framework);
}

export function transformForAllClients(html: string, framework?: Framework): TransformResult[] {
  if (!html || !html.trim()) {
    return Object.keys(CLIENT_CONFIGS).map((clientId) => ({
      clientId, html: html || "", warnings: [],
    }));
  }
  if (html.length > MAX_HTML_SIZE) {
    throw new Error(`HTML input exceeds ${MAX_HTML_SIZE / 1024}KB limit.`);
  }

  // Downlevel once, reuse for all 13 clients
  const downleveled = downlevelCSS(html);
  return Object.keys(CLIENT_CONFIGS).map((clientId) =>
    applyTransform(downleveled, CLIENT_CONFIGS[clientId], framework)
  );
}
