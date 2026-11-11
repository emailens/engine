// "Design kept": does the email in a client still look like the email its
// author wrote? The engine's score counts CSS rules that fire, so a layout
// that collapses with no rule behind it scores 100. This compares the
// client's render (the live preview) against the design itself: the same
// HTML drawn as a plain web page at the client's width. Pure: two DOM dumps
// (./dom.ts) in, numbers out. The email page renders them in the viewer's
// browser (./run.ts); fidelity/kept/measure.ts in local Chrome.

import { type DomNode, matchNodes, sameValue } from "./dom";

/** The design properties a reader sees, grouped as an author talks about them. */
const ASPECTS = {
  // max-width is not listed: what it does shows in the width (an image's
  // max-width:100% read as a change on every image, 2026-11-11).
  layout: ["display", "float", "width", "text-align"],
  spacing: [
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
  ],
  corners: ["border-radius"],
  borders: ["border-top-width", "border-top-style", "border-top-color"],
  color: ["color", "background-color", "background-image"],
  type: [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "text-transform",
  ],
  effects: ["box-shadow", "opacity"],
} as const;
export type Aspect = keyof typeof ASPECTS;

export interface Kept {
  /** Share of the design's drawn content (texts, images) the client still draws. */
  content: number;
  /** Share of the design's side-by-side boxes still side by side: 0 when columns stack. */
  columns: number;
  /** The email's width in the client against the design's, after the client's zoom: under 1 when it blows up or collapses. */
  width: number;
  /** Design properties the client changed: how often, and one example. */
  changed: Partial<
    Record<
      Aspect,
      {
        count: number;
        example: { text: string; prop: string; design: string; client: string };
      }
    >
  >;
  /** What the design draws and the client does not. */
  lost: string[];
  /** Single components the client drew wrong: one is enough to break the email. */
  components: Component[];
}

export interface Component {
  text: string;
  kind: "moved" | "resized" | "fill" | "corners" | "flush";
  design: string;
  client: string;
  /** Far enough off to break the email; nearer, it only changes it. */
  breaks: boolean;
}

const drawn = (n: DomNode) => n.w > 0 && n.h > 0;
const picture = (n: DomNode) =>
  n.style["background-image"].match(/([^/"()]+)"?\)$/)?.[1];
const label = (n: DomNode) => n.text || n.src || picture(n) || n.tag;

/**
 * Boxes painted with a picture and no text of their own (AliExpress's
 * product cells), which matchNodes cannot pair: paired by the picture, in
 * order. The sim keeps the address; a real client's proxy would not.
 */
function pictured(design: DomNode[], client: DomNode[], paired: Set<DomNode>) {
  const free = client.filter((c) => c.style["background-image"] !== "none");
  return design.flatMap((d): Pair[] => {
    if (paired.has(d) || !d.picture) return [];
    const i = free.findIndex(
      (c) => c.style["background-image"] === d.style["background-image"],
    );
    return i < 0 ? [] : [[d, free.splice(i, 1)[0]]];
  });
}
const CLEAR = /^(rgba\(0, 0, 0, 0\)|transparent)$/;

/** A corner shows only on a box with a fill or a border. */
const cornerShows = (n: DomNode) =>
  !CLEAR.test(n.style["background-color"]) ||
  n.style["background-image"] !== "none" ||
  n.style["border-top-width"] !== "0px";

const PX = /^(-?[\d.]+)px$/;
/** Sizes within 2% read as one: a box 0.53px wider after a font swap is not a change. */
const near = (a: string, b: string) => {
  const [pa, pb] = [PX.exec(a), PX.exec(b)];
  if (!pa || !pb) return false;
  const [x, y] = [Number(pa[1]), Number(pb[1])];
  return (
    Math.abs(x - y) <= Math.max(0.5, 0.02 * Math.max(Math.abs(x), Math.abs(y)))
  );
};

/** The client drew `p` differently, where a reader can see it. */
function differs(aspect: Aspect, p: string, d: DomNode, c: DomNode) {
  const [dv, cv] = [d.style[p], c.style[p]];
  if (
    dv === undefined ||
    cv === undefined ||
    sameValue(p, dv, cv) ||
    near(dv, cv)
  )
    return false;
  // Text style shows only on text: an image's font is nobody's.
  if (aspect === "type") return d.text !== "";
  return aspect !== "corners" || cornerShows(d) || cornerShows(c);
}

function changedOf(pairs: [DomNode, DomNode][]): Kept["changed"] {
  const changed: Kept["changed"] = {};
  for (const [d, c] of pairs)
    for (const [aspect, props] of Object.entries(ASPECTS) as [
      Aspect,
      readonly string[],
    ][])
      for (const p of props) {
        if (!differs(aspect, p, d, c)) continue;
        const [dv, cv] = [d.style[p], c.style[p]];
        changed[aspect] ??= {
          count: 0,
          example: { text: label(d), prop: p, design: dv, client: cv },
        };
        changed[aspect].count++;
      }
  return changed;
}

type Pair = [DomNode, DomNode];

/** Apart across, a pixel of overlap allowed: in different columns. */
const apart = (a: DomNode, b: DomNode) =>
  a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1;

/** Side by side in the design: apart, and sharing half the shorter's height. */
const besides = (a: DomNode, b: DomNode) => {
  const shared = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return apart(a, b) && shared >= Math.min(a.h, b.h) / 2;
};

/**
 * Share of the design's side-by-side pairs the client keeps in different
 * columns. Only apart is asked of the client: stacking puts two boxes in the
 * same band across, while a card a few pixels lower (larger text, Resend on
 * Gmail Android) is still in its column.
 */
function columnsOf(boxes: Pair[]) {
  // ponytail: every pair of boxes, O(n^2); a few hundred keyed boxes per email.
  const rows = boxes.flatMap((p, i) =>
    boxes
      .slice(i + 1)
      .filter((q) => besides(p[0], q[0]))
      .map((q) => [p, q]),
  );
  const kept = rows.filter(([p, q]) => apart(p[1], q[1]));
  return rows.length ? kept.length / rows.length : 1;
}

const left = (ns: DomNode[]) => Math.min(...ns.map((n) => n.x));
const extent = (ns: DomNode[]) =>
  ns.length ? Math.max(...ns.map((n) => n.x + n.w)) - left(ns) : 1;

const filled = (n: DomNode) =>
  !CLEAR.test(n.style["background-color"]) ||
  n.style["background-image"] !== "none";

// A component is off when its centre moves more than 3% of the email's width
// (18px at 600) or its width leaves 80-120%. Provisional, as the cuts below.
const MOVED = 0.03;
const [SMALLER, LARGER] = [0.8, 1.2];
// Where one breaks the email, fitted to 95 owner grades (2026-11-10; fit on
// round 2, held out on round 1: kappa 0.38 -> 0.49): 15% of the width moved,
// or 1.65x resized either way (|ln| 0.5).
const FAR_MOVED = 0.15;
const FAR_RESIZED = 0.5;

/** Where a box sits across its email, 0 at the left edge, 1 at the right. */
type Frame = { x0: number; w: number };
const across = (n: DomNode, f: Frame) => (n.x + n.w / 2 - f.x0) / f.w;
const pct = (v: number) => `centre at ${Math.round(v * 100)}%`;

/**
 * One component the client drew wrong, by the owner's rule (2026-11-10): "it
 * can be just one component with the wrong visual or position". A component
 * is what a reader sees as a thing: an image, or a box with a fill or a
 * border (a button, a card). A text block is not: its box is its column's,
 * and a font swap rewraps it.
 */
function componentsOf(boxes: Pair[], fd: Frame, fc: Frame, zoom: number) {
  return boxes.flatMap(([d, c]) => [
    ...(d.tag === "img" || cornerShows(d) ? placed(d, c, fd, fc, zoom) : []),
    ...painted(d, c),
  ]);
}

/**
 * The box a reader sees as a filled element: the outermost box of its own
 * colour around it, narrower than half the email, named as the element.
 * Vercel's link in Outlook Classic shrank to 93px inside a dark 138x48 box
 * that kept its corners (2026-11-11): the box is the button.
 */
function seen(n: DomNode, all: DomNode[], colour: string, f: Frame): DomNode {
  const box = all
    .filter(
      (o) =>
        drawn(o) &&
        o.style["background-color"] === colour &&
        o.w <= f.w / 2 &&
        holds(o, n),
    )
    .reduce((a, o) => (a.w * a.h >= o.w * o.h ? a : o), n);
  return box === n ? n : { ...box, text: n.text, src: n.src };
}

/** Each filled text element as its painted box, on both sides. */
function asSeen(
  pairs: Pair[],
  design: DomNode[],
  client: DomNode[],
  fd: Frame,
  fc: Frame,
): Pair[] {
  return pairs.map(([d, c]) => {
    const colour = d.style["background-color"];
    if (d.tag === "img" || !d.text || CLEAR.test(colour)) return [d, c];
    return [seen(d, design, colour, fd), seen(c, client, colour, fc)];
  });
}

/** Moved or resized: where and how big the client drew a component. */
function placed(d: DomNode, c: DomNode, fd: Frame, fc: Frame, zoom: number) {
  const out: Component[] = [];
  const text = label(d);
  const [ad, ac] = [across(d, fd), across(c, fc)];
  // Rounded: 318/600 - 300/600 is 0.03000000000000003, not over 3%.
  const off = +Math.abs(ad - ac).toFixed(4);
  if (off > MOVED)
    out.push({
      text,
      kind: "moved",
      design: pct(ad),
      client: pct(ac),
      breaks: off > FAR_MOVED,
    });
  const cw = c.w / zoom;
  if (cw / d.w < SMALLER || cw / d.w > LARGER)
    out.push({
      text,
      kind: "resized",
      design: `${Math.round(d.w)}px`,
      client: `${Math.round(cw)}px`,
      breaks: Math.abs(Math.log(cw / d.w)) > FAR_RESIZED,
    });
  return out;
}

const holds = (o: DomNode, n: DomNode) =>
  o.x <= n.x + 0.5 &&
  o.y <= n.y + 0.5 &&
  o.x + o.w >= n.x + n.w - 0.5 &&
  o.y + o.h >= n.y + n.h - 0.5;
const smallest = (ns: DomNode[]) =>
  ns.reduce<DomNode | undefined>(
    (a, n) => (a && a.w * a.h <= n.w * n.h ? a : n),
    undefined,
  );

// Skeyon's button in Outlook Classic (2026-11-11): 24px inside the card in
// the design, 2px in the client, while the text above kept its inset.
const [INSET, FLUSH] = [8, 2];

/**
 * How far a button sits inside its card, across: from its painted box (the
 * filled boxes holding `n` in one colour, the outermost: Skeyon's link and
 * its cell are both orange) to the sides of the card around it (the smallest
 * larger box filled in another colour). Undefined when `n` sits in no
 * painted box narrower than half the email, or no card holds it.
 */
// ponytail: scans the whole dump per text node, O(n^2); a few hundred nodes.
function insetOf(n: DomNode, all: DomNode[], f: Frame) {
  const fills = all.filter((o) => drawn(o) && filled(o) && holds(o, n));
  const colour = smallest(fills)?.style["background-color"];
  const card = smallest(
    fills.filter((o) => o.style["background-color"] !== colour),
  );
  const paint = fills
    .filter(
      (o) =>
        o.style["background-color"] === colour && (!card || holds(card, o)),
    )
    .reduce<DomNode | undefined>(
      (a, o) => (a && a.w * a.h >= o.w * o.h ? a : o),
      undefined,
    );
  if (!paint || !card || paint.w > f.w / 2) return undefined;
  return Math.min(paint.x - card.x, card.x + card.w - paint.x - paint.w);
}

/** Buttons the client pushes against their card's edge: one per label. */
function flushOf(
  pairs: Pair[],
  design: DomNode[],
  client: DomNode[],
  fd: Frame,
  fc: Frame,
  zoom: number,
) {
  const out = new Map<string, Component>();
  for (const [d, c] of pairs) {
    if (!d.text || out.has(label(d))) continue;
    const di = insetOf(d, design, fd);
    const ci = insetOf(c, client, fc);
    if (di === undefined || ci === undefined) continue;
    if (di >= INSET && ci / zoom <= FLUSH)
      out.set(label(d), {
        text: label(d),
        kind: "flush",
        design: `${Math.round(di)}px`,
        client: `${Math.round(ci / zoom)}px`,
        // Also when the whole card's padding goes (Protocol in Outlook
        // Classic, graded broken by the owner): the text touches the edge too.
        breaks: true,
      });
  }
  return [...out.values()];
}

/** A fill dropped or changed, rounded corners squared off. */
function painted(d: DomNode, c: DomNode) {
  const out: Component[] = [];
  const text = label(d);
  const fill = ["background-color", "background-image"].find(
    (p) => !sameValue(p, d.style[p], c.style[p]),
  );
  if (filled(d) && fill)
    out.push({
      text,
      kind: "fill",
      design: d.style[fill],
      client: c.style[fill],
      breaks: false,
    });
  // A picture fill drawn at another size: AliExpress's product photos at
  // their own size once the sim dropped `cover` (graded broken, 2026-11-10).
  const [ds, cs] = [d.style["background-size"], c.style["background-size"]];
  if (d.picture === true && ds !== undefined && cs !== undefined && ds !== cs)
    out.push({
      text,
      kind: "resized",
      design: `background-size: ${ds}`,
      client: `background-size: ${cs}`,
      breaks: true,
    });
  if (differs("corners", "border-radius", d, c) && cornerShows(d))
    out.push({
      text,
      kind: "corners",
      design: d.style["border-radius"],
      client: c.style["border-radius"],
      breaks: false,
    });
  return out;
}

/**
 * The design against the client. `zoom` is how far the client drew the
 * email out (or in), measured on its page: a phone zooming a 600px email to
 * fit keeps the design.
 *
 * Layout is read as structure, not pixels: columns that stack and an email
 * that blows up or collapses break it; a block a few pixels narrower or
 * further down (a padding change, a font swap) does not. Placing every box
 * within a pixel tolerance failed twice on emails that held (2026-11-10:
 * Matte on Apple Mail Mac, 14px less padding; mysigmail on Outlook web).
 */
export function keptOf(design: DomNode[], client: DomNode[], zoom = 1): Kept {
  const { pairs, realOnly } = matchNodes(design, client);
  const shown = pairs.filter(([d]) => drawn(d));
  const kept = shown.filter(([, c]) => drawn(c));
  const lost = [
    ...realOnly.filter(drawn),
    ...shown.filter(([, c]) => !drawn(c)).map(([d]) => d),
  ];
  const total = kept.length + lost.length;
  // Boxes the layout sizes: an inline link or span is as wide as its text,
  // so a font swap moves it, and that is a type change, not the layout.
  const boxes = kept.filter(
    ([d]) => d.tag === "img" || d.style.display !== "inline",
  );
  // The email's width from what it draws: a tracking pixel or spacer (2px or
  // less) sits wherever the page starts (Foodpanda on Gmail web read 0.74).
  const sized = boxes.filter(([d]) => d.w > 2 && d.h > 2);
  const [sd, sc] = [sized.map(([d]) => d), sized.map(([, c]) => c)];
  const [fd, fc] = [
    { x0: left(sd), w: extent(sd) },
    { x0: left(sc), w: extent(sc) },
  ];
  const [wd, wc] = [fd.w, fc.w / zoom];
  return {
    content: total ? kept.length / total : 1,
    columns: columnsOf(boxes),
    width: Math.min(wd, wc) / Math.max(wd, wc),
    changed: changedOf(kept),
    lost: lost.map(label),
    components: [
      ...componentsOf(asSeen(sized, design, client, fd, fc), fd, fc, zoom),
      ...flushOf(kept, design, client, fd, fc, zoom),
      ...pictured(design, client, new Set(pairs.map(([d]) => d))).flatMap(
        ([d, c]) => painted(d, c),
      ),
    ],
  };
}

export type Verdict = "kept" | "changed" | "broken";

// Provisional cuts, to be fitted to the owner's grades (calibrate step in
// docs/fidelity/design-kept.md). Pixel line as in real-checks/gap.ts SAME.
export const CONTENT = 0.95;
export const COLUMNS = 0.9;
export const WIDTH = 0.85;
// Fitted to the owner's 57 grades (2026-11-10, kappa 0.28 -> see doc): spacing
// shifts from 2.5% of pixels read as changed.
const SAME = 0.025;

/**
 * kept: the design holds; changed: holds together but looks different (a
 * font swap, spacing); broken: content lost, columns stacked, the email blown
 * up or collapsed, or any one component moved or resized far (FAR_MOVED,
 * FAR_RESIZED). A component nearer, or one that only loses its fill or
 * corners, changes the email (graded 2026-11-10), even wrong in several of
 * those ways at once: a narrower, squared button still reads (Vercel in
 * Outlook Classic; 16 of 18 such pairs graded changed, 2026-11-11). The DOM
 * decides a break: the pixel fit cannot line up a sparse white email
 * (colorlib~10 on Apple Mail iOS, match 0.51, the same design).
 */
export function verdictOf(
  k: Pick<Kept, "content" | "columns" | "width" | "components" | "changed">,
  /** Share of pixels off, when screenshots were taken. Without them (the
   * email page) any changed design property changes the email: kappa 0.68
   * against 0.82 with pixels on the 95 graded pairs, broken calls the same. */
  pixelDiff?: number,
): Verdict {
  if (
    k.content < CONTENT ||
    k.columns < COLUMNS ||
    k.width < WIDTH ||
    k.components.some((c) => c.breaks)
  )
    return "broken";
  const looksSame =
    pixelDiff === undefined ? !Object.keys(k.changed).length : pixelDiff < SAME;
  return looksSame && !k.components.length ? "kept" : "changed";
}

/** Something a client would paint: visible text or an image in the body, scripts and styles aside. */
export function isEmail(html: string): boolean {
  const body = (/<body\b[\s\S]*/i.exec(html)?.[0] ?? html).replace(
    /<(script|style)\b[\s\S]*?<\/\1>/gi,
    "",
  );
  return /<img\b/i.test(body) || /\S/.test(body.replace(/<[^>]*>/g, ""));
}

/**
 * Something with a design a plain page can draw. Not a template source
 * (front matter, JSX, Maizzle, MJML: six Maizzle starters reached the 2026-11-09
 * bench uncompiled), nor AMP, whose body stays hidden until the AMP runtime
 * runs, which a page with scripts off never does.
 */
export function hasDesign(html: string): boolean {
  const head = html.slice(0, 300);
  return (
    isEmail(html) &&
    !/^\s*(---|import\s)|<extends|<x-|<mj-/.test(head) &&
    !/<html[^>]*(⚡|amp)4email/i.test(head)
  );
}
