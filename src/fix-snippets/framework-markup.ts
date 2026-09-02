/**
 * Advice for markup the framework wrote, not the author.
 *
 * The engine grades compiled HTML, because that is what a client receives. But
 * a compiler emits a great deal the author never typed: MJML puts `align`,
 * `role`, `width` and a doctype into its output, Maizzle's markup transformer
 * adds `role` to layout tables, React Email's `<Html>` renders the doctype. A
 * finding on one of those is true about the email and useless as an
 * instruction, because the file it names is not a file the author has.
 *
 * Each entry answers the only question worth answering there: is there
 * something to do in the source, and if not, why is it safe to leave.
 *
 * Keys are `property::framework`, matching tier 2 of the lookup in `index.ts`.
 */
export const FRAMEWORK_MARKUP_SUGGESTIONS: Record<string, string> = {
  // ── The doctype ───────────────────────────────────────────────────────
  // Every client that "does not support" it simply rewrites it, and none of
  // the three frameworks lets you omit it. There is nothing to do.
  "doctype::mjml":
    "MJML writes the doctype itself, and the clients that replace it do so without changing how the email renders. Nothing to change in your MJML.",
  "doctype::maizzle":
    "Your Maizzle layout writes the doctype, and the clients that replace it do so without changing how the email renders. Nothing to change.",
  "doctype::jsx":
    "React Email's <Html> renders the doctype, and the clients that replace it do so without changing how the email renders. Nothing to change.",

  // ── lang and dir ──────────────────────────────────────────────────────
  // Dropped, these cost screen-reader language and bidi hints, not layout.
  "[lang]::mjml":
    "MJML sets lang on <html> from the lang attribute on <mjml>. Where a client drops it only assistive technology notices, so leave it: removing it helps nobody.",
  "[lang]::maizzle":
    "Your Maizzle layout sets lang on <html>. Where a client drops it only assistive technology notices, so leave it.",
  "[lang]::jsx":
    "React Email renders this from <Html lang=…>. Where a client drops it only assistive technology notices, so leave it.",
  "[dir]::mjml":
    "MJML sets dir from the dir attribute on <mjml>. For a right-to-left email, also set align on mj-text and mj-section, which those clients do honour.",
  "[dir]::maizzle":
    "Your Maizzle layout sets dir. For a right-to-left email, also set align on the cells, which these clients do honour.",
  "[dir]::jsx":
    "React Email renders this from <Html dir=…>. For a right-to-left email, also set textAlign on the components, which these clients do honour.",

  // ── role ──────────────────────────────────────────────────────────────
  // All three add it to their layout tables. Dropping it loses the
  // screen-reader hint and nothing visual.
  "[role]::mjml":
    'MJML adds role="presentation" to the tables it generates. A client that strips it announces the layout table to screen readers, which is worth knowing but is not something you can change from your MJML.',
  "[role]::maizzle":
    "Maizzle's markup transformer adds role to layout tables. A client that strips it announces the table to screen readers; you can turn the transformer off, but the attribute is better present than absent.",
  "[role]::jsx":
    "React Email's layout components add role to their tables. A client that strips it announces the table to screen readers, which is not something to fix in your component.",

  // ── align ─────────────────────────────────────────────────────────────
  "[align]::mjml":
    "MJML writes align onto the cells it generates. Set it through the align attribute on mj-section, mj-column, mj-image or mj-text; for the clients that ignore it, add text-align through mj-style and a css-class.",
  "[align]::maizzle":
    "Maizzle writes align onto your table cells. For the clients that ignore it, add a text-align utility as well: those survive inlining.",
  "[align]::jsx":
    "React Email components render align. For the clients that ignore it, pass textAlign in the style prop too, which is inlined and survives.",

  // ── width and height ──────────────────────────────────────────────────
  "[width]::mjml":
    "MJML writes width from mj-image's or mj-section's width attribute. A client that drops it sizes the element by its content, so also set width through mj-style and a css-class.",
  "[width]::maizzle":
    "Maizzle writes width onto the table it generates. A client that drops it sizes by content, so keep a width utility on the element as well: inlined CSS survives where the attribute does not.",
  "[width]::jsx":
    "React Email renders width from the component's width prop. A client that drops it sizes by content, so set width in the style prop too.",
  "[height]::mjml":
    "MJML writes height from mj-image's height attribute. A client that drops it sizes by content, which for an image means reflow while it loads; set height through mj-style and a css-class as well.",
  "[height]::maizzle":
    "Maizzle writes height onto the element. A client that drops it sizes by content, so keep a height utility on it as well.",
  "[height]::jsx":
    "React Email renders height from the component's height prop. Set it in the style prop too, so the clients that drop the attribute still reserve the space.",

  // ── <body> ────────────────────────────────────────────────────────────
  "<body>::mjml":
    "MJML styles <body> from mj-body's background-color. Clients that replace <body> with a <div> lose it, so set background-color on mj-section too and the page still fills.",
  "<body>::maizzle":
    "Your layout styles <body>. Clients that replace it with a <div> lose those styles, so put the background on a full-width wrapper table as well.",
  "<body>::jsx":
    "React Email's <Body> carries your style prop. Clients that replace <body> with a <div> lose it, so put the background on a wrapping <Section> too.",
};

/**
 * Framework-aware notes for the style-survival rules, keyed `rule::framework`.
 *
 * These rules are about a stylesheet, and in all three frameworks the author
 * does not write the stylesheet that ships: MJML assembles it from mj-style,
 * Maizzle inlines and may minify it, React Email renders it from components.
 * The note says where in the source the offending CSS came from.
 */
export const STYLE_SURVIVAL_NOTES: Record<string, string> = {
  "gmail-space-separated-color::mjml":
    "The block comes from mj-style; write the colour with commas there.",
  "gmail-space-separated-color::maizzle":
    "Maizzle rewrites colours it inlines, but a rule left in a <style> block passes through untouched. Fix it in your CSS source.",
  "gmail-space-separated-color::jsx":
    "The block comes from a <style> element in your component; write the colour with commas.",

  "gmail-space-separated-color-inline::mjml":
    "MJML builds inline styles from component attributes, so the colour came from one of them: write it with commas.",
  "gmail-space-separated-color-inline::maizzle":
    "This survived inlining, so it was written inline in your template rather than in a utility class. Write it with commas.",
  "gmail-space-separated-color-inline::jsx":
    "The colour is in a style prop object; write it with commas.",

  "outlook-double-brace::mjml":
    "The stylesheet is assembled from mj-style. Put a newline before the closing brace of the media query, or stop minifying that block.",
  "outlook-double-brace::maizzle":
    "Maizzle's minifier produces this. Leave a space between the braces in the source, or exclude the <style> block from minification.",
  "outlook-double-brace::jsx":
    "The stylesheet comes from a <style> element in your component. Put a newline before the media query's closing brace.",

  "yahoo-attribute-selector-semicolon::mjml":
    "The selector is in mj-style; split it into [style^=…][style$=…] there.",
  "yahoo-attribute-selector-semicolon::maizzle":
    "The selector is in your CSS source; split it into [style^=…][style$=…] there.",
  "yahoo-attribute-selector-semicolon::jsx":
    "The selector is in a <style> element in your component; split it into [style^=…][style$=…].",

  "outlook-web-chained-class::mjml":
    "css-class takes several names, and MJML passes them through as written. Give the element one class carrying both rules instead.",
  "outlook-web-chained-class::maizzle":
    "A compound like .a.b usually comes from @apply or an arbitrary variant. Flatten it into a single class in your component layer.",
  "outlook-web-chained-class::jsx":
    "Give the element one class carrying both rules, or move the declarations into the style prop, which is inlined and unaffected.",

  "outlook-first-class-only::mjml":
    "The classes come from css-class. Merge the conflicting ones into a single class in mj-style.",
  "outlook-first-class-only::maizzle":
    "Inlining sidesteps this entirely, and Maizzle inlines by default. If you turned it off, merge the conflicting utilities into one component class.",
  "outlook-first-class-only::jsx":
    "Merge the conflicting classes, or move the declarations into the style prop, which is inlined and unaffected by this.",

  "outlook-first-class-descendants::mjml":
    "The rule is in mj-style. Target the child directly with its own css-class rather than through a descendant selector.",
  "outlook-first-class-descendants::maizzle":
    "Inlining sidesteps this, and Maizzle inlines by default. Otherwise put the rule on the child element rather than on an ancestor's class.",
  "outlook-first-class-descendants::jsx":
    "Put the declarations on the child component, through its own class or its style prop, rather than through a descendant selector.",
};
