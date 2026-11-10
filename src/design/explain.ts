// The design check in words a reader of the email page acts on: what
// breaks first, named by its own text, with the designed value next to the
// drawn one. Pure.

import {
  type Aspect,
  COLUMNS,
  CONTENT,
  type Component,
  type Kept,
  type Verdict,
  WIDTH,
} from "./kept";

const SHOWN = 5;

const ASPECT_NAMES: Record<Aspect, string> = {
  layout: "Layout",
  spacing: "Spacing",
  corners: "Corners",
  borders: "Borders",
  color: "Colours",
  type: "Text style",
  effects: "Shadows and opacity",
};

// A label is the element's text, its image's file name, or else its tag.
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const TAGS = new Set([
  "td",
  "th",
  "tr",
  "table",
  "div",
  "a",
  "span",
  "p",
  "center",
  "section",
]);
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

/** How a reader knows the element: its text, its image, or "a box". */
function named(label: string) {
  if (IMAGE.test(label)) return `the image “${label}”`;
  if (TAGS.has(label)) return "a box";
  return `“${short(label)}”`;
}
/** "padding-top" reads "padding top"; a font family is its font. */
const propName = (p: string) =>
  p === "font-family" ? "font" : p.replace(/-/g, " ");
/** A font family by its first font, unquoted; anything else as drawn. */
const drawnValue = (p: string, v: string) =>
  short(p === "font-family" ? v.split(",")[0].replace(/["']/g, "").trim() : v);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NONE = /^(none|transparent|rgba\(0, 0, 0, 0\))$/;

function wrong(c: Component) {
  switch (c.kind) {
    case "moved":
      return `is moved (${c.design} → ${c.client.replace("centre at ", "")} across the email)`;
    case "resized":
      return c.design.startsWith("background-size:")
        ? `has its picture drawn at the wrong size (${c.design.replace("background-size: ", "")} → ${c.client.replace("background-size: ", "")})`
        : `is ${c.client} wide instead of ${c.design}`;
    case "fill":
      return `loses its background (${short(c.design)} → ${NONE.test(c.client) ? "none" : short(c.client)})`;
    case "corners":
      return c.client === "0px"
        ? `loses its rounded corners (${c.design} → square)`
        : `has ${c.client} corners instead of ${c.design}`;
  }
}

/** "a", "a and b", "a, b, and c": the second "is" dropped after the first. */
function sentenceOf(label: string, parts: string[]) {
  const ps = parts.map((p, i) => (i > 0 ? p.replace(/^is /, "") : p));
  const list =
    ps.length < 3
      ? ps.join(" and ")
      : `${ps.slice(0, -1).join(", ")}, and ${ps.at(-1)}`;
  return `${cap(named(label))} ${list}.`;
}

/** Components by element, in order: those that break it, then the rest. */
function elements(components: Component[]) {
  const by = new Map<string, Component[]>();
  for (const c of components) by.set(c.text, [...(by.get(c.text) ?? []), c]);
  const all = [...by].map(([label, cs]) => ({
    breaks: cs.some((c) => c.breaks) || new Set(cs.map((c) => c.kind)).size > 1,
    // Copies of one element (four social icons named alike) say it once.
    line: sentenceOf(label, [...new Set(cs.map(wrong))]),
  }));
  return [...all.filter((e) => e.breaks), ...all.filter((e) => !e.breaks)];
}

function lostLine(lost: string[]) {
  const copies = (l: string) => lost.filter((x) => x === l).length;
  const unique = [...new Set(lost)];
  const names = unique
    .slice(0, 3)
    .map((l) =>
      copies(l) > 1 ? `${named(l)} (${copies(l)} copies)` : named(l),
    );
  const rest = unique.length - names.length;
  const list = rest
    ? `${names.join(", ")} and ${rest} more`
    : names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : names[0];
  return lost.length === 1
    ? `1 part of your email does not show: ${list}.`
    : `${lost.length} parts of your email do not show: ${list}.`;
}

export interface Explained {
  sentence: string;
  /** Most important first, at most SHOWN. */
  reasons: string[];
  /** How many more there were. */
  more: number;
}

export function explainDesign(
  check: { verdict: Verdict; kept: Kept },
  name: string,
): Explained {
  const k = check.kept;
  const els = elements(k.components);
  const all = [
    ...(k.content < CONTENT && k.lost.length ? [lostLine(k.lost)] : []),
    ...(k.columns < COLUMNS
      ? [
          "Columns that sit side by side in your design stack on top of each other.",
        ]
      : []),
    ...(k.width < WIDTH
      ? [
          `The email is drawn at a very different width from your design (${Math.round(k.width * 100)}% of it).`,
        ]
      : []),
    ...els.map((e) => e.line),
    ...(
      Object.entries(k.changed) as [
        Aspect,
        NonNullable<Kept["changed"][Aspect]>,
      ][]
    )
      // Squared corners are said on their element already.
      .filter(
        ([aspect]) =>
          aspect !== "corners" ||
          !k.components.some((c) => c.kind === "corners"),
      )
      .map(
        ([aspect, { count, example: x }]) =>
          `${ASPECT_NAMES[aspect]}: ${named(x.text)} has ${propName(x.prop)} ${drawnValue(x.prop, x.client)} instead of ${drawnValue(x.prop, x.design)}${count > 1 ? ` (${count} changes)` : ""}.`,
      ),
  ];
  const sentence =
    check.verdict === "broken"
      ? `${name} breaks your design.`
      : check.verdict === "changed"
        ? `${name} keeps your layout but changes how it looks.`
        : `${name} keeps your layout, sizes, colours and fonts as you set them.`;
  return {
    sentence,
    reasons: all.slice(0, SHOWN),
    more: Math.max(0, all.length - SHOWN),
  };
}
