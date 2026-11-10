// An email's page as data: every element's box and the computed styles a
// reader sees, and the pairing of two such dumps by text. The dump itself is
// read in a browser page by the caller (the app's design-check/dom.ts).

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
