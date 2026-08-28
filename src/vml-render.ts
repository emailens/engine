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
 * Deliberately NOT emulated: how Word *mis*-renders a nested shape. That is a
 * real and confirmed failure (the container disappears and text stops drawing
 * further down the document), but reproducing it means perturbing Chromium's
 * layout into a picture that is wrong in a third way, different from both the
 * correct render and Outlook's. `checkVml` reports it with a line number
 * instead, which is more useful and cannot mislead.
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
 * Uncomment the Outlook-only blocks and delete the downlevel-revealed branch,
 * leaving the markup a Word-engine client actually parses.
 */
export function resolveMsoBranch(html: string): string {
  return html
    .replace(/<!--\[if\s*!\s*(?:mso|vml)[^\]]*\]><!-->([\s\S]*?)<!--<!\[endif\]-->/gi, "")
    .replace(/<!--\[if[^\]]*(?:mso|vml)[^\]]*\]>([\s\S]*?)<!\[endif\]-->/gi, "$1");
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
      return `<div data-vml="rect" style="${background}${box}">${content}</div>`;
    },
  );

  // Property elements have no visual role once their parent shape is gone.
  return out.replace(/<\/?v:(?:fill|textbox|stroke|shadow|imagedata|path|formulas|handles)[^>]*?\/?>/gi, "");
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
