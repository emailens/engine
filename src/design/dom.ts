/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// ponytail: the DOM types are for the functions that run inside a page; tsc
// makes them visible program-wide, so keep page code to these two files.
// An email's page as data: every element's box and the computed styles a
// reader sees, and the pairing of two such dumps by text.
//
// dumpDom and markPictures run in a page (serialised by the caller's browser
// driver), so they read styles through the element's own window and use
// nothing from outside themselves.

export interface DomNode {
  tag: string;
  /** The element's own text, collapsed, first 80 characters; "" when none. */
  text: string;
  /** Image file name, for <img>. */
  src?: string;
  /** Box relative to the email root, CSS px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Computed values of STYLE_PROPS. */
  style: Record<string, string>;
  /** The style attribute as the client left it. */
  inline: string;
  /** Its background picture decoded (set by shootDesign; unknown when absent). */
  picture?: boolean;
}

/**
 * What identifies a node on both sides: its text; any image is just "an
 * image", paired by its place among the texts, since clients proxy image
 * addresses (Gmail: googleusercontent).
 */
const keyOf = (n: DomNode) =>
  n.text ? `t:${n.text}` : n.tag === "img" ? "img" : null;

/**
 * Pairs real and sim nodes by key, keeping document order (longest common
 * subsequence), so a repeated label never pairs across the email.
 */
export function matchNodes(real: DomNode[], sim: DomNode[]) {
  const a = real.filter(keyOf);
  const b = sim.filter(keyOf);
  const ka = a.map(keyOf);
  const kb = b.map(keyOf);
  // ponytail: O(n*m) table; a few thousand keyed nodes per email is fine.
  const L = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] =
        ka[i] === kb[j]
          ? L[i + 1][j + 1] + 1
          : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs: [DomNode, DomNode][] = [];
  const realOnly: DomNode[] = [];
  const simOnly: DomNode[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) pairs.push([a[i++], b[j++]]);
    else if (L[i + 1][j] >= L[i][j + 1]) realOnly.push(a[i++]);
    else simOnly.push(b[j++]);
  }
  realOnly.push(...a.slice(i));
  simOnly.push(...b.slice(j));
  return { pairs, realOnly, simOnly };
}

const PX = /^(-?[\d.]+)px$/;
const family = (v: string) => v.toLowerCase().replace(/["'\s]/g, "");

/** Two computed values the same for judging: px within half a pixel, families loosely. */
export function sameValue(prop: string, a: string, b: string): boolean {
  if (prop === "font-family") return family(a) === family(b);
  const [pa, pb] = [PX.exec(a), PX.exec(b)];
  if (pa && pb) return Math.abs(Number(pa[1]) - Number(pb[1])) <= 0.5;
  return a === b;
}

/**
 * Marks each node painted with a picture whether that picture decodes. A
 * dead address draws nothing, so its size cannot be wrong (colorlib's
 * bg_1.jpg). Runs in the page after dumpDom, over the same elements.
 */
export async function markPictures(root: Element, nodes: DomNode[]) {
  const els = [...root.querySelectorAll("*")];
  const url = (el: Element) =>
    (el.ownerDocument.defaultView ?? window)
      .getComputedStyle(el)
      .backgroundImage.match(/^url\("?(.*?)"?\)$/)?.[1];
  const tries = new Map<string, Promise<boolean>>();
  const decodes = (src: string) => {
    if (!tries.has(src)) {
      const img = new Image();
      img.src = src;
      const timeout = new Promise<boolean>((r) =>
        setTimeout(() => r(false), 5000),
      );
      tries.set(
        src,
        Promise.race([
          img.decode().then(
            () => true,
            () => false,
          ),
          timeout,
        ]),
      );
    }
    return tries.get(src) as Promise<boolean>;
  };
  await Promise.all(
    els.map(async (el, i) => {
      const src = url(el);
      if (src) nodes[i].picture = await decodes(src);
    }),
  );
  return nodes;
}

/**
 * Every element under `root`, in document order. Self-contained: it is
 * serialised into the page, so it may not reference anything outside itself.
 */
export function dumpDom(root: Element): DomNode[] {
  const PROPS = [
    "display",
    "visibility",
    "position",
    "float",
    "width",
    "height",
    "max-width",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-top-style",
    "border-top-color",
    "border-radius",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "text-align",
    "text-decoration-line",
    "text-transform",
    "vertical-align",
    "color",
    "background-color",
    "background-image",
    "background-size",
    "box-shadow",
    "opacity",
  ];
  const view = root.ownerDocument.defaultView ?? window;
  const origin = root.getBoundingClientRect();
  const out: DomNode[] = [];
  for (const el of root.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    const cs = view.getComputedStyle(el);
    const style: Record<string, string> = {};
    for (const p of PROPS) style[p] = cs.getPropertyValue(p);
    let own = "";
    for (const c of el.childNodes) if (c.nodeType === 3) own += c.textContent;
    const node: DomNode = {
      tag: el.tagName.toLowerCase(),
      text: own.replace(/\s+/g, " ").trim().slice(0, 80),
      x: Math.round((r.left - origin.left) * 10) / 10,
      y: Math.round((r.top - origin.top) * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      style,
      inline: el.getAttribute("style") ?? "",
    };
    if (el.tagName === "IMG")
      node.src = (el.getAttribute("src") ?? "")
        .split(/[?#]/)[0]
        .split("/")
        .pop();
    out.push(node);
  }
  return out;
}

