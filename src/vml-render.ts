/**
 * Resolve the Outlook branch of an email and translate its VML into CSS a
 * browser can draw.
 *
 * Every preview of a Word-engine Outlook has, until now, rendered the wrong
 * half of the email: the `<!--[if mso]>` blocks stayed commented and the
 * `<!--[if !mso]>` fallback stayed live, so the screenshot showed precisely
 * what Outlook does *not* render and hid what it does.
 *
 * Resolving the branch alone makes that worse rather than better. VML has been
 * dead in browsers since IE9, so `<v:rect>` parses as an HTMLUnknownElement:
 * `display:inline`, no box, no fill. The content inside would render as bare
 * inline text. Resolution and translation therefore ship together and are not
 * useful apart.
 *
 * ponytail: a mapping for the two shapes that occur in practice, not a VML
 * renderer. Measured across a reported production email and MJML's output,
 * `roundrect` and `rect` are the whole surface. Anything else is left alone
 * rather than approximated.
 *
 * How Word *mis*-renders a nested shape is emulated, but only the parts with
 * evidence behind them. This note used to say the failure was not emulated at
 * all, on the grounds that reproducing it meant perturbing Chromium into a
 * picture wrong in a third way. That argument does not survive contact with
 * the specific effects:
 *
 *   - the container's fill and geometry disappear    -> drop the box. Exact.
 *   - VML shapes further down stop drawing text      -> blank their labels.
 *                                                       Exact, and scoped to
 *                                                       shapes we created.
 *   - the table structure terminates early, so later
 *     content escapes the frame                      -> WITHDRAWN. It had no
 *                                                       methodology, and the
 *                                                       fixture built to
 *                                                       measure it contradicts
 *                                                       it.
 *
 * Two of the three needed no distortion at all; the third turned out not to be
 * a rendering problem but an evidence problem. Refusing to draw any of it
 * meant the preview showed a tidy box with a button in it, a picture no Word
 * engine produces, sitting beside a finding that said the region was
 * destroyed. Between a warning and a screenshot, people believe the
 * screenshot.
 *
 * Affected regions carry `data-vml-outlook` so a surface can label them, since
 * a blank button should read as "Outlook does this" and not as our bug.
 */

/** Read a length that VML wrote, tolerating a bare number or a px suffix. */
function px(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = value.trim().match(/^(-?[\d.]+)(?:px)?$/i);
  return m ? parseFloat(m[1]) : undefined;
}

function styleProps(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g)) {
    out[(m[1] ?? m[3]).toLowerCase()] = m[2] ?? m[4];
  }
  return out;
}

/**
 * `arcsize` is a VgFraction: a proportion of *half the shape's shorter side*,
 * where 0% is square and 100% fully circular. Values outside that are clamped
 * rather than rejected, which is why 120% and 100% draw the identical corner.
 * Verified against Outlook Classic.
 */
export function arcsizeToRadius(arcsize: string, width: number, height: number): number {
  const raw = arcsize.trim();
  const pct = raw.endsWith("%") ? parseFloat(raw) : parseFloat(raw) * 100;
  if (!Number.isFinite(pct)) return 0;
  return (Math.min(100, Math.max(0, pct)) / 100) * (Math.min(width, height) / 2);
}

/**
 * The opener of a downlevel-revealed block. It has two spellings in the wild
 * and no canonical one:
 *
 *   <!--[if !mso]><!-->       the shorthand, `<!--` closed by a bare `>`
 *   <!--[if !mso]><!-- -->    an ordinary empty comment
 *
 * Matching only the first left the fallback in place for the Word engine, so
 * a preview drew both the VML button and the HTML button written to replace
 * it: two stacked CTAs in a render whose whole job is to be trusted. Outlook
 * sees `[if !mso]`, evaluates it false and skips to `[endif]` whichever
 * spelling closed the opener, so both must resolve the same way here.
 *
 * The condition is matched by *containing* a negated mso/vml term rather than
 * starting with one, because `[if (!mso)&(!IE)]` is as common in real email as
 * the bare `[if !mso]`.
 */
const DOWNLEVEL_REVEALED =
  /<!--\[if[^\]]*!\s*(?:mso|vml)[^\]]*\]>\s*<!--(?:>|\s*-->)([\s\S]*?)<!--\s*<!\[endif\]-->/gi;

/**
 * A downlevel-hidden block: the markup only Outlook reads.
 *
 * The lookahead keeps this off negated conditions. Without it a revealed block
 * whose opener we failed to match would then be unwrapped by this pass, which
 * turns a missed deletion into markup shown to the one client written to never
 * see it. Failing towards "left something in" is recoverable; failing towards
 * "revealed the hidden branch" is not.
 */
const DOWNLEVEL_HIDDEN =
  /<!--\[if(?![^\]]*!)[^\]]*(?:mso|vml)[^\]]*\]>([\s\S]*?)<!\[endif\]-->/gi;

/**
 * Uncomment the Outlook-only blocks and delete the downlevel-revealed branch,
 * leaving the markup a Word-engine client actually parses.
 */
export function resolveMsoBranch(html: string): string {
  return html.replace(DOWNLEVEL_REVEALED, "").replace(DOWNLEVEL_HIDDEN, "$1");
}

/** Translate the VML shapes a browser cannot draw into divs it can. */
export function vmlToCss(html: string): string {
  let out = html;

  // ── v:roundrect → a flex-centred box with a border radius ───────────────
  out = out.replace(
    /<v:roundrect([^>]*)>([\s\S]*?)<\/v:roundrect>/gi,
    (_m, rawAttrs: string, inner: string) => {
      const a = attrs(rawAttrs);
      const s = styleProps(a.style ?? "");
      const w = px(s.width) ?? 0;
      const h = px(s.height) ?? 0;
      // No arcsize means the VML default of 0.2, not a square corner.
      const radius = a.arcsize ? arcsizeToRadius(a.arcsize, w, h) : 0.2 * (Math.min(w, h) / 2);
      const fill = a.fillcolor ?? "transparent";
      const stroked = !(a.stroke === "f" || a.stroke === "false");
      const middle = /middle/i.test(s["v-text-anchor"] ?? "");
      // <w:anchorlock/> and <center> are scaffolding around the label; the
      // label itself is what a reader sees, so keep only that.
      const label = inner.replace(/<\/?(?:w:anchorlock|center)[^>]*>/gi, "").trim();
      const box = [
        w ? `width:${w}px` : "",
        h ? `height:${h}px` : "",
        `border-radius:${radius}px`,
        `background:${fill}`,
        stroked ? `border:1px solid ${a.strokecolor ?? "#000"}` : "border:none",
        "display:inline-flex",
        "justify-content:center",
        `align-items:${middle ? "center" : "flex-start"}`,
        "overflow:hidden",
        "text-align:center",
      ].filter(Boolean).join(";");
      const href = a.href ? ` data-href="${a.href}"` : "";
      return `<div data-vml="roundrect"${href} style="${box}">${label}</div>`;
    },
  );

  // ── v:rect (+ v:fill, + v:textbox) → a sized box with a background ──────
  out = out.replace(
    /<v:rect([^>]*)>([\s\S]*?)<\/v:rect>/gi,
    (_m, rawAttrs: string, inner: string) => {
      const a = attrs(rawAttrs);
      const s = styleProps(a.style ?? "");
      const w = px(s.width);
      const h = px(s.height);

      const fillTag = inner.match(/<v:fill([^>]*?)\/?>/i);
      const f = fillTag ? attrs(fillTag[1]) : {};
      const type = (f.type ?? "solid").toLowerCase();
      let background = "";
      if (f.src && type === "tile") {
        background = `background-image:url('${f.src}');background-repeat:repeat;`;
      } else if (f.src) {
        background = `background-image:url('${f.src}');background-size:cover;background-position:center;`;
      } else if (type === "gradient" || type === "gradientradial") {
        const from = f.color ?? a.fillcolor ?? "transparent";
        const to = f.color2 ?? from;
        const angle = f.angle ? `${parseFloat(f.angle)}deg` : "180deg";
        background = type === "gradientradial"
          ? `background-image:radial-gradient(${from},${to});`
          : `background-image:linear-gradient(${angle},${from},${to});`;
      }
      const solid = f.color ?? a.fillcolor;

      const tb = inner.match(/<v:textbox([^>]*)>([\s\S]*?)<\/v:textbox>/i);
      const inset = tb ? attrs(tb[1]).inset : undefined;
      const padding = inset
        ? inset.split(",").map((p) => `${px(p.trim()) ?? 0}px`).join(" ")
        : "0";
      const content = tb ? tb[2] : inner.replace(/<v:fill[^>]*?\/?>/gi, "");

      // A missing or malformed dimension is left unset rather than guessed at,
      // so the box collapses the way the broken source implies instead of the
      // preview quietly inventing a size the email never asked for.
      const box = [
        w !== undefined ? `width:${w}px` : "",
        h !== undefined ? `height:${h}px` : "",
        solid ? `background-color:${solid}` : "",
        `padding:${padding}`,
      ].filter(Boolean).join(";");
      // Outlook does not draw a shape containing another shape: the
      // container's fill and geometry disappear and the inner shape is left
      // stranded. Confirmed on Outlook Classic in T1a and T1c. Emulated rather
      // than approximated, because "drop the box" is precisely what was
      // observed and needs no distortion of the surrounding layout: the
      // children stay exactly where they were, minus the frame around them.
      //
      // Detection rides on pass order: roundrect is translated above, so a
      // shape nested here already carries `data-vml`. That covers
      // roundrect-inside-rect, the reported production case and what
      // MJML-shaped email produces. Exotic nesting is left to `checkVml`,
      // which reads tag sequences rather than depending on this order.
      if (/data-vml="/.test(content)) {
        return `<div data-vml="rect" data-vml-outlook="container-dropped">${content}</div>`;
      }
      return `<div data-vml="rect" style="${background}${box}">${content}</div>`;
    },
  );

  // Property elements have no visual role once their parent shape is gone.
  out = out.replace(/<\/?v:(?:fill|textbox|stroke|shadow|imagedata|path|formulas|handles)[^>]*?\/?>/gi, "");
  return blankLabelsAfterNestedShape(out);
}

/**
 * The second confirmed consequence of a nested shape: every VML shape further
 * down the email stops drawing its text, so buttons and headings after that
 * point ship as blank coloured blocks.
 *
 * This is the effect with the best evidence behind it, confirmed with
 * byte-identical probes either side of one nested shape, the one before it
 * rendering its labels and the one after it not. It is also the one that makes
 * the failure worth previewing at all: it explains damage far from the shape
 * the author edited, which is exactly what a person cannot find by reading
 * their own template.
 *
 * Scoped to shapes this translator created, which is both what was observed
 * and the only thing we can blank precisely. Plain HTML after the shape is
 * left alone: `T1c` shows it rendering in place, and blanking it would be
 * inventing a failure rather than reproducing one.
 *
 * The geometry stays. A blank coloured block is the observed result, so the
 * fill and size are the render, not leftovers.
 */
function blankLabelsAfterNestedShape(html: string): string {
  const at = html.indexOf('data-vml-outlook="container-dropped"');
  if (at === -1) return html;
  // Everything from the nested container onward, which includes the stranded
  // inner shape itself: T1c recorded that pill as unlabelled too.
  const tail = html.slice(at).replace(
    /(<div data-vml="roundrect")([^>]*>)([\s\S]*?)(<\/div>)/gi,
    (whole, open: string, rest: string, label: string, close: string) =>
      label.trim() ? `${open}${rest.slice(0, -1)} data-vml-outlook="label-dropped">${close}` : whole,
  );
  return html.slice(0, at) + tail;
}

/**
 * Render the branch a Word-engine Outlook actually sees.
 *
 * Returns the input unchanged when there is nothing Outlook-only in it, so an
 * email without conditional comments is never rewritten for no reason.
 */
export function renderOutlookBranch(html: string): string {
  if (!/<!--\[if/i.test(html)) return html;
  return vmlToCss(resolveMsoBranch(html));
}
