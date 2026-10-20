import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
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
  // Points are VML's native unit and what generators emit (`width:103.5pt`).
  const m = value.trim().match(/^(-?[\d.]+)(px|pt)?$/i);
  if (!m) return undefined;
  return m[2]?.toLowerCase() === "pt" ? (parseFloat(m[1]) * 4) / 3 : parseFloat(m[1]);
}

/** VML opacity: "50%", "0.5", or 16.16 fixed point ("32768f"). Absent is opaque. */
function opacity(value: string | undefined): number {
  if (!value) return 1;
  const v = value.trim();
  const n = parseFloat(v);
  if (Number.isNaN(n)) return 1;
  const o = v.endsWith("%") ? n / 100 : v.endsWith("f") ? n / 65536 : n;
  return Math.min(1, Math.max(0, o));
}

/** A fill colour at the fill's opacity; undefined when fully transparent. */
function fillColor(color: string | undefined, o: number): string | undefined {
  if (!color || o === 0) return undefined;
  return o < 1 ? `color-mix(in srgb, ${color} ${Math.round(o * 100)}%, transparent)` : color;
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
 * The opener of a downlevel-revealed block. It has three spellings in the wild
 * and no canonical one:
 *
 *   <!--[if !mso]><!-->       the shorthand, `<!--` closed by a bare `>`
 *   <!--[if !mso]><!-- -->    an ordinary empty comment
 *   <!--[if !mso]><! -->      howtotarget's form. Without the space, t-online.de hides the block too
 *
 * Matching only the first left the fallback in place for the Word engine, so
 * a preview drew both the VML button and the HTML button written to replace
 * it: two stacked CTAs in a render whose whole job is to be trusted. Outlook
 * sees `[if !mso]`, evaluates it false and skips to `[endif]` whichever
 * spelling closed the opener, so each must resolve the same way here.
 *
 * The closer has a second spelling too. Dynamics 365 writes
 * `<!--[if !mso]> <!---->` ... `<!--[endif]---->`, an ordinary comment where
 * the canonical form has `<!--<![endif]-->`. A real campaign built that way
 * rendered in Outlook 2016 with the block skipped, so both closers end it.
 *
 * The condition is matched by *containing* a negated mso/vml term rather than
 * starting with one, because `[if (!mso)&(!IE)]` is as common in real email as
 * the bare `[if !mso]`.
 */
const DOWNLEVEL_REVEALED =
  /<!--\[if[^\]]*!\s*(?:mso|vml)[^\]]*\]>\s*<(?:!-->|!--\s*-->|!\s*-->)([\s\S]*?)(?:<!--\s*<!\[endif\]-->|<!--\[endif\]-*-->)/gi;

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
 * The Office configuration an `[if mso]` block carries beside its markup:
 *
 *   <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>…</xml>
 *
 * Word reads it as a directive and draws nothing. A browser has never heard of
 * `<o:PixelsPerInch>`, so it treats it as an unknown *inline* element and paints
 * the text content, which is how a bare "96" ended up above every template that
 * carries this boilerplate , which is most of them. And because `<xml>` is not
 * legal inside `<head>`, the parser evicts the block into the body, which is why
 * it landed on the first line rather than out of sight.
 *
 * Only the closed form is stripped. An unclosed `<xml>` is left alone for the
 * same reason an unmatched conditional is: failing towards "left something in"
 * is recoverable, failing the other way is not.
 */
const OFFICE_SETTINGS = /<xml\b[^>]*>[\s\S]*?<\/xml>/gi;

/**
 * Uncomment the Outlook-only blocks and delete the downlevel-revealed branch,
 * leaving the markup a Word-engine client actually parses.
 */
export function resolveMsoBranch(html: string): string {
  return html
    .replace(DOWNLEVEL_REVEALED, "")
    .replace(DOWNLEVEL_HIDDEN, "$1")
    // After the unwrap, never before: the settings block is inside the
    // conditional we just opened.
    .replace(OFFICE_SETTINGS, "");
}

/** `mso-hide:all`, in either spacing. */
const MSO_HIDE = /mso-hide\s*:\s*all/i;

/**
 * Make `mso-hide:all` actually hide something.
 *
 * It is the only way to hide an element from the Word engine, because Outlook
 * Classic ignores `display:none` , that is the whole reason the property
 * exists. The transform is right to preserve it. But a browser has never heard
 * of it either, so a preheader hidden *correctly* still painted at the top of
 * the render: we showed the failure to the one author who had already written
 * the fix.
 *
 * So translate it into something this renderer can act on, for exactly the
 * reason `vmlToCss` exists. The preview is Chromium standing in for Word, and
 * it can only draw what it understands.
 *
 * Must run AFTER the transform's strip pass, never before: `display` is on the
 * Word unsupported list, so an earlier `display:none` would be stripped right
 * back out and this would silently do nothing.
 *
 * ponytail: inline styles only. Catching `mso-hide` in a <style> block means
 * resolving its selector against the DOM; every preheader in the wild is inline.
 */
export function applyMsoHide(html: string): string {
  if (!MSO_HIDE.test(html)) return html;
  return releaseNestedTables(hideMsoHidden(html));
}

/**
 * A table inside a `<div>` hidden with `mso-hide:all` is still drawn by Word.
 *
 * `mso-hide:all` hides the element's own text, but it does not reach a nested
 * table: the table needs `mso-hide:all` of its own. This is why a "mobile only"
 * block that is hidden everywhere else turns up in Outlook, and a preview that
 * hides it shows the author a clean email that their Outlook readers never see.
 *
 * Observed identically on Outlook 2007, 2010, 2013, 2016 and 2019 and on
 * Windows 10 Mail (Emailens probe sheet 07-style-delivery, 2026-10-13): a
 * `<div style="display:none;mso-hide:all">` wrapping a table rendered the
 * table at full size, with or without a stylesheet rule on the wrapper.
 *
 * The same holds for a hidden cell and a hidden row: a table inside
 * `<td style="display:none">` or under `<tr style="display:none">` was drawn
 * on every version (probe sheet 09-follow-ups c21, c22). A hidden `<span>`
 * around a table was not tested and is left hidden.
 *
 * A browser cannot show a child of a `display:none` parent, so the wrapper is
 * un-hidden and everything in it except the escaping tables is hidden instead.
 */
function releaseNestedTables(html: string): string {
  if (!/<table/i.test(html) || !/<(?:div|td|th|tr)\b/i.test(html)) return html;
  const $ = cheerio.load(html, null, /<html[\s>]/i.test(html));
  const isHidden = (el: AnyNode) =>
    MSO_HIDE.test($(el).attr("style") ?? "");
  /** Tables under `wrapper` that carry no mso-hide themselves, nor does anything in between. */
  const escaping = (wrapper: Element) =>
    $(wrapper)
      .find("table")
      .toArray()
      .filter(
        (table) =>
          !isHidden(table) &&
          $(table).parentsUntil(wrapper).toArray().every((el) => !isHidden(el)),
      );
  const HIDE = "display:none!important";
  const withoutDisplayNone = (style: string) =>
    style.replace(/(?:^|;)\s*display\s*:\s*none\s*(?:!important)?\s*(?=;|$)/gi, "").replace(/^;/, "");

  const release = (wrapper: Element) => {
    const el = $(wrapper);
    el.attr("style", withoutDisplayNone(el.attr("style") ?? ""));
    for (const child of el.contents().toArray()) {
      if (child.type === "text") {
        if (child.data.trim()) $(child).replaceWith(`<span style="${HIDE}">${$.html(child)}</span>`);
        continue;
      }
      if (child.type !== "tag") continue;
      if (child.name === "table" && !isHidden(child)) continue;
      if (isHidden(child)) continue; // already hidden by its own mso-hide
      if (escaping(child).length > 0) {
        release(child);
        continue;
      }
      const style = $(child).attr("style") ?? "";
      $(child).attr("style", `${style}${style.trim() === "" || /;\s*$/.test(style) ? "" : ";"}${HIDE}`);
    }
  };

  let changed = false;
  // A hidden row hands its hiding to its cells, which are then wrappers like
  // any other; the row itself is only a container.
  $("tr[style]").each((_, row) => {
    if (!isHidden(row) || escaping(row).length === 0) return;
    const el = $(row);
    const rowStyle = el.attr("style") ?? "";
    el.attr("style", withoutDisplayNone(rowStyle).replace(/(?:^|;)\s*mso-hide\s*:[^;]*/gi, "").replace(/^;/, ""));
    el.children("td,th").each((_i, cell) => {
      if (isHidden(cell)) return;
      const style = $(cell).attr("style") ?? "";
      $(cell).attr("style", `${style}${style.trim() === "" || /;\s*$/.test(style) ? "" : ";"}mso-hide:all;${HIDE}`);
    });
    changed = true;
  });
  $("div[style], td[style], th[style]").each((_, div) => {
    if (!isHidden(div)) return;
    // Only the outermost hidden wrapper; anything nested is reached from it.
    if ($(div).parents().toArray().some((el) => isHidden(el))) return;
    if (escaping(div).length === 0) return;
    release(div);
    changed = true;
  });
  // Untouched emails keep their exact bytes: no parse-and-serialise round trip.
  return changed ? $.html() : html;
}

function hideMsoHidden(html: string): string {
  // Each quote style gets its own alternative so the *other* quote may appear
  // inside the value. One character class excluding both cannot cross
  // `font-family:'Segoe UI'`, which is how the canonical preheader is written,
  // so the single element this exists for was the one it skipped.
  return html.replace(
    /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi,
    (whole, lead: string, dq: string | undefined, sq: string | undefined) => {
      const quote = dq === undefined ? "'" : '"';
      const style = dq === undefined ? (sq as string) : dq;
      if (!MSO_HIDE.test(style)) return whole;
      // `!important`, because the author may have written `display:block
      // !important` for the clients that are not Word. A plain `display:none`
      // appended after that loses the cascade and the element stays painted.
      const sep = style.trim() === "" || /;\s*$/.test(style) ? "" : ";";
      return `${lead}${quote}${style}${sep}display:none!important${quote}`;
    },
  );
}

/**
 * A VML path as SVG path data, split into what is filled and what is stroked
 * (`nf` and `ns` turn either off for one subpath). Supports the commands
 * hand-written email VML uses: m, l, c, qx, qy (elliptical quadrants), x, e.
 * Returns null on anything else, so an unknown path is left alone rather than
 * drawn wrong.
 */
export function vmlPathToSvg(path: string): { fill: string; stroke: string } | null {
  const tokens = path.trim().split(/[\s,]+/).filter(Boolean);
  let fill = "";
  let stroke = "";
  let sub = "";
  let noFill = false;
  let noStroke = false;
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => {
    const n = Number(tokens[i++]);
    if (Number.isNaN(n)) throw new Error("bad path");
    return n;
  };
  const endSub = () => {
    if (!sub) return;
    if (!noFill) fill += sub;
    if (!noStroke) stroke += sub;
    sub = "";
    noFill = false;
    noStroke = false;
  };
  try {
    while (i < tokens.length) {
      const cmd = tokens[i++].toLowerCase();
      if (cmd === "m") { x = num(); y = num(); sub += `M${x} ${y}`; }
      else if (cmd === "l") { x = num(); y = num(); sub += `L${x} ${y}`; }
      else if (cmd === "c") {
        const p = [num(), num(), num(), num(), num(), num()];
        sub += `C${p.join(" ")}`;
        x = p[4]; y = p[5];
      } else if (cmd === "qx" || cmd === "qy") {
        const nx = num();
        const ny = num();
        const dx = nx - x;
        const dy = ny - y;
        // The quadrant leaves along x (qx) or y (qy); it turns clockwise when
        // the end lies clockwise of that first tangent.
        const tx = cmd === "qx" ? Math.sign(dx) : 0;
        const ty = cmd === "qy" ? Math.sign(dy) : 0;
        const sweep = tx * dy - ty * dx > 0 ? 1 : 0;
        sub += `A${Math.abs(dx)} ${Math.abs(dy)} 0 0 ${sweep} ${nx} ${ny}`;
        x = nx; y = ny;
      } else if (cmd === "x") sub += "Z";
      else if (cmd === "nf") noFill = true;
      else if (cmd === "ns") noStroke = true;
      else if (cmd === "e") endSub();
      else return null;
    }
  } catch {
    return null;
  }
  endSub();
  return { fill, stroke };
}

/** Translate the VML shapes a browser cannot draw into divs it can. */
export function vmlToCss(html: string): string {
  let out = html;

  // The prefix is whatever the email binds to the VML namespace. `v:` is the
  // convention, not a rule: a real campaign wrote `<a:roundrect xmlns:a=...>`
  // and Outlook 2016 drew the button. Rewrite any other prefix to `v:`.
  for (const [, prefix] of html.matchAll(/xmlns:([\w-]+)\s*=\s*["']urn:schemas-microsoft-com:vml["']/gi)) {
    if (prefix.toLowerCase() !== "v") out = out.replace(new RegExp(`(</?)${prefix}:`, "gi"), "$1v:");
  }

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
      // A <v:fill> inside paints the shape: an image (the rounded-picture
      // idiom), or its own colour. Image sizing follows v:rect below.
      const fillTag = inner.match(/<v:fill([^>]*?)\/?>/i);
      const f = fillTag ? attrs(fillTag[1]) : {};
      // <v:imagedata> paints the picture over the shape, stretched to it: the
      // form real Outlook 2016 and 2019 draw (they leave a frame fill blank).
      const imageData = inner.match(/<v:imagedata([^>]*?)\/?>/i);
      const imageSrc = imageData ? attrs(imageData[1]).src : undefined;
      const tile = (f.type ?? "").toLowerCase() === "tile";
      const fill = f.color ?? a.fillcolor ?? "transparent";
      const image = imageSrc
        ? `;background-image:url('${imageSrc}');background-size:100% 100%;background-repeat:no-repeat`
        : f.src
          ? `;background-image:url('${f.src}');${tile ? "background-repeat:repeat" : "background-size:cover;background-position:center;background-repeat:no-repeat"}`
          : "";
      const stroked = !(a.stroke === "f" || a.stroke === "false");
      const middle = /middle/i.test(s["v-text-anchor"] ?? "");
      // <w:anchorlock/> is scaffolding. <center> is where the label's colour
      // and font live (white on a dark button), so it becomes a span that
      // keeps its style rather than vanishing and leaving dark-on-dark text.
      const label = inner
        .replace(/<v:fill[^>]*?\/?>(?:\s*<\/v:fill>)?/gi, "")
        .replace(/<v:imagedata[^>]*?\/?>(?:\s*<\/v:imagedata>)?/gi, "")
        .replace(/<\/?w:anchorlock[^>]*>/gi, "")
        .replace(/<center\b/gi, "<span")
        .replace(/<\/center>/gi, "</span>")
        .trim();
      const box = [
        w ? `width:${w}px` : "",
        h ? `height:${h}px` : "",
        `border-radius:${radius}px`,
        `background:${fill}${image}`,
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

  // ── v:image under a rect laid over it ───────────────────────────────────
  // The Email on Acid pattern: a <v:image> paints the picture and an
  // absolutely positioned <v:rect>, usually with a transparent fill, holds the
  // text on top. The rect's position is not translated, so carry the image
  // into the rect as its backdrop instead of leaving it stranded above it.
  out = out.replace(
    /<v:image\b([^>]*?)\/?>\s*(?:<\/v:image>\s*)?(?=<v:rect\b)/gi,
    (_m, rawAttrs: string) => {
      const src = attrs(rawAttrs).src;
      return src ? `<v:rect-image src="${src}"/>` : "";
    },
  );
  out = out.replace(/<v:rect-image src="([^"]*)"\/>\s*<v:rect\b/gi, '<v:rect data-vml-image="$1"');
  // A standalone image is just a picture.
  out = out.replace(/<v:image\b([^>]*?)\/?>/gi, (_m, rawAttrs: string) => {
    const a = attrs(rawAttrs);
    const s = styleProps(a.style ?? "");
    const size = [px(s.width) ? `width:${px(s.width)}px` : "", px(s.height) ? `height:${px(s.height)}px` : ""].filter(Boolean).join(";");
    return a.src ? `<img data-vml="image" src="${a.src}" alt="" style="display:block;${size}">` : "";
  });
  out = out.replace(/<\/v:image>/gi, "");

  // ── v:background → the body's background ────────────────────────────────
  out = out.replace(
    /<v:background\b([^>]*?)(?:\/>|>([\s\S]*?)<\/v:background>)/gi,
    (_m, rawAttrs: string, inner = "") => {
      const a = attrs(rawAttrs);
      const fillTag = inner.match(/<v:fill([^>]*?)\/?>/i);
      const f = fillTag ? attrs(fillTag[1]) : {};
      const color = f.color ?? a.fillcolor;
      const tile = (f.type ?? "tile").toLowerCase() === "tile";
      const rules = [
        color ? `background-color:${color}` : "",
        f.src ? `background-image:url('${f.src}')` : "",
        f.src ? (tile ? "background-repeat:repeat" : "background-size:cover;background-position:center") : "",
      ].filter(Boolean).join(";");
      return rules ? `<style data-vml="background">body{${rules}}</style>` : "";
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
      const o = opacity(f.opacity);
      let background = "";
      if (!f.src && a["data-vml-image"]) {
        background = `background-image:url('${a["data-vml-image"]}');background-size:cover;background-position:center;`;
      } else if (f.src && type === "tile") {
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
      // A fill with opacity="0" is the overlay idiom: Outlook paints nothing,
      // so the image under it shows. Painting the colour solid hid it.
      const solid = fillColor(f.color ?? a.fillcolor, o);

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

  // ── an empty roundrect with its label in a shape laid over it ───────────
  // Dynamics 365 draws a button as two shapes: a filled <v:roundrect> with
  // nothing in it, then a <v:shape> of the same size positioned over it that
  // holds the text and the link. Outlook 2016 drew one 172x40 button with the
  // label inside. Translated separately, the label landed under the box, in a
  // cell too short for it, and was clipped. The label moves into the box.
  out = out.replace(
    /(<div data-vml="roundrect")([^>]*>)\s*<\/div>\s*(?:<v:shapetype\b[\s\S]*?<\/v:shapetype>\s*)?<v:shape\b([^>]*)>([\s\S]*?)<\/v:shape>/gi,
    (whole, open: string, rest: string, shapeAttrs: string, inner: string) => {
      const box = styleProps((/style="([^"]*)"/i.exec(rest) ?? [])[1] ?? "");
      const shape = styleProps(attrs(shapeAttrs).style ?? "");
      // Only when the shape really sits on the box: same size, or no size of its own.
      const sameSize = (prop: "width" | "height") => shape[prop] === undefined || px(shape[prop]) === px(box[prop]);
      if (!sameSize("width") || !sameSize("height")) return whole;
      const label = inner.replace(/<\/?(?:v:textbox|w:anchorlock|center)[^>]*>/gi, (tag) =>
        /^<center/i.test(tag) ? tag.replace(/^<center/i, "<span") : /^<\/center/i.test(tag) ? "</span>" : "",
      ).trim();
      const href = attrs(shapeAttrs).href;
      return `${open}${href && !/data-href=/.test(rest) ? ` data-href="${href}"` : ""}${rest}${label}</div>`;
    },
  );

  // ── a <v:shape> drawn by a path → the same path in SVG ──────────────────
  // How rounded corners are built around content Word cannot put inside a
  // shape (a card holding a VML button): quarter discs in the corner cells.
  // Only empty shapes: one holding text is a label, handled above or by the
  // tag strip below.
  out = out.replace(
    /<v:shape\b([^>]*?)(?:\/>|>\s*<\/v:shape>)/gi,
    (whole, rawAttrs: string) => {
      const a = attrs(rawAttrs);
      if (!a.path) return whole;
      const s = styleProps(a.style ?? "");
      const w = px(s.width);
      const h = px(s.height);
      const [cw, ch] = (a.coordsize ?? `${w ?? 1000},${h ?? 1000}`).split(",").map(Number);
      const parsed = vmlPathToSvg(a.path);
      if (!parsed || !w || !h) return whole;
      const filled = !(a.filled === "f" || a.filled === "false");
      const stroked = !(a.stroked === "f" || a.stroked === "false" || a.stroke === "f");
      const fill = filled && parsed.fill ? `<path d="${parsed.fill}" fill="${a.fillcolor ?? "#fff"}"/>` : "";
      const stroke = stroked && parsed.stroke
        ? `<path d="${parsed.stroke}" fill="none" stroke="${a.strokecolor ?? "#000"}" stroke-width="${(px(a.strokeweight) ?? 1) * (cw / w)}"/>`
        : "";
      return `<svg data-vml="shape" width="${w}" height="${h}" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none" style="display:block">${fill}${stroke}</svg>`;
    },
  );

  // Property elements have no visual role once their parent shape is gone, and
  // a shape definition draws nothing by itself.
  out = out.replace(/<v:shapetype\b[\s\S]*?<\/v:shapetype>/gi, "");
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
