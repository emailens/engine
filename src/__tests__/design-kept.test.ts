import { describe, expect, test } from "bun:test";
import type { DomNode } from "../design/dom";
import { keptOf, verdictOf } from "../design/kept";

const node = (
  text: string,
  box: Partial<DomNode> = {},
  style: Record<string, string> = {},
): DomNode => ({
  tag: "td",
  text,
  x: 0,
  y: 0,
  w: 600,
  h: 40,
  inline: "",
  ...box,
  style: {
    "padding-top": "24px",
    "border-radius": "0px",
    "background-color": "rgba(0, 0, 0, 0)",
    "background-image": "none",
    "border-top-width": "0px",
    color: "rgb(0, 0, 0)",
    ...style,
  },
});

const design = () => [
  node("Header", { y: 0 }),
  node("Left column", { x: 0, y: 40, w: 300 }),
  node("Right column", { x: 300, y: 40, w: 300 }),
  node("Footer", { y: 80 }),
];
const edit = (text: string, box: Partial<DomNode>, of = design()) =>
  of.map((n) => (n.text === text ? { ...n, ...box } : n));
const scaled = (of: DomNode[], s: number) =>
  of.map((n) => ({ ...n, x: n.x * s, y: n.y * s, w: n.w * s, h: n.h * s }));

describe("keptOf: content", () => {
  test("the design untouched is kept whole", () => {
    const k = keptOf(design(), design());
    expect(k).toMatchObject({ content: 1, columns: 1, width: 1, lost: [] });
    expect(k.changed).toEqual({});
  });

  test("nothing to compare is nothing lost", () => {
    expect(keptOf([], [])).toMatchObject({ content: 1, columns: 1, width: 1 });
  });

  test("a paragraph the client drops is lost content", () => {
    const k = keptOf(
      design(),
      design().filter((n) => n.text !== "Footer"),
    );
    expect(k.content).toBe(0.75);
    expect(k.lost).toEqual(["Footer"]);
  });

  test("an element the client hides is lost, though it is still in the DOM", () => {
    expect(keptOf(design(), edit("Footer", { w: 0, h: 0 })).lost).toEqual([
      "Footer",
    ]);
    expect(keptOf(design(), edit("Footer", { h: 0 })).lost).toEqual(["Footer"]);
    expect(keptOf(design(), edit("Footer", { w: 0 })).lost).toEqual(["Footer"]);
  });

  test("a 1px divider is drawn, so losing it is lost content", () => {
    const rule = (box: Partial<DomNode>) => node("—", box);
    expect(
      keptOf([...design(), rule({ h: 1 })], [...design(), rule({ h: 0 })]).lost,
    ).toEqual(["—"]);
    expect(
      keptOf([...design(), rule({ w: 1 })], [...design(), rule({ w: 0 })]).lost,
    ).toEqual(["—"]);
  });

  test("a lost image is named by its file", () => {
    const img = node("", { tag: "img", src: "hero.png" });
    expect(keptOf([...design(), img], design()).lost).toEqual(["hero.png"]);
  });
});

describe("keptOf: layout", () => {
  test("columns that stack break the layout", () => {
    const stacked = edit("Right column", { x: 0, y: 80 });
    expect(keptOf(design(), stacked).columns).toBe(0);
  });

  test("one column of three that stacks breaks one row in three", () => {
    const three = [
      node("A", { x: 0, w: 200 }),
      node("B", { x: 200, w: 200 }),
      node("C", { x: 400, w: 200 }),
    ];
    // Stacked: below the others, the full width.
    expect(
      keptOf(three, edit("C", { x: 0, y: 40, w: 600 }, three)).columns,
    ).toBe(1 / 3);
  });

  test("the first column stacking counts the same as the last", () => {
    const three = [
      node("A", { x: 0, w: 200 }),
      node("B", { x: 200, w: 200 }),
      node("C", { x: 400, w: 200 }),
    ];
    expect(keptOf(three, edit("A", { y: 40, w: 600 }, three)).columns).toBe(
      1 / 3,
    );
  });

  test("a right column first in the HTML is still a row", () => {
    // Overlapping a pixel, the line itself.
    const rtl = [{ ...design()[2], x: 299 }, design()[1]];
    const stacked = [{ ...design()[2], x: 0, y: 80 }, design()[1]];
    expect(keptOf(rtl, stacked).columns).toBe(0);
  });

  test("a box is never beside itself, not even a 1px rule", () => {
    const rule = (w: number) => [node("|", { w })];
    expect(keptOf(rule(1), rule(2)).columns).toBe(1);
  });

  test("side by side only in the client is no row the design had", () => {
    const stacked = edit("Right column", { x: 0, y: 80 });
    expect(keptOf(stacked, design()).columns).toBe(1);
  });

  // Resend on Gmail Android: larger text shifts each card's name, so boxes
  // that shared a row no longer do, yet the grid's columns hold.
  test("columns that shift up or down but stay apart hold", () => {
    const shifted = edit("Right column", { y: 140 });
    expect(keptOf(design(), shifted).columns).toBe(1);
  });

  test("columns that stay side by side, a little narrower, hold", () => {
    const tighter = edit("Right column", { x: 314, w: 272 });
    expect(keptOf(design(), tighter).columns).toBe(1);
  });

  // A row counts as side by side when the boxes share half the shorter's height.
  test("side by side means sharing at least half the height", () => {
    const tall = [
      node("A", { w: 300, h: 40 }),
      node("B", { x: 300, w: 300, y: 20, h: 40 }),
    ];
    expect(keptOf(tall, edit("B", { x: 0, y: 40 }, tall)).columns).toBe(0);
    const offset = [
      node("A", { w: 300, h: 40 }),
      node("B", { x: 300, w: 300, y: 21, h: 40 }),
    ];
    // Under half shared: no row to keep, so nothing breaks.
    expect(keptOf(offset, edit("B", { x: 0, y: 40 }, offset)).columns).toBe(1);
  });

  test("boxes that only touch are side by side; one pixel of overlap is allowed", () => {
    const touching = edit("Right column", { x: 299 });
    expect(keptOf(touching, touching).columns).toBe(1);
    const stacked = edit("Right column", { x: 0, y: 80 }, touching);
    expect(keptOf(touching, stacked).columns).toBe(0);
  });

  test("a client that zooms the whole email out keeps the layout", () => {
    const k = keptOf(design(), scaled(design(), 0.66), 0.66);
    expect(k).toMatchObject({ columns: 1, width: 1 });
  });

  test("an email the client moves sideways keeps its width", () => {
    const moved = design().map((n) => ({ ...n, x: n.x + 30 }));
    expect(keptOf(design(), moved).width).toBe(1);
  });

  // Foodpanda on Gmail web: a 1x1 open pixel at the page's left edge, the
  // email centred differently, read as a width change (0.74).
  test("a tracking pixel at the edge is no part of the email's width", () => {
    const pixel = node("", { tag: "img", src: "open", w: 1, h: 1 });
    const centred = design().map((n) => ({ ...n, x: n.x + 240 }));
    expect(keptOf([pixel, ...centred], [pixel, ...design()]).width).toBe(1);
  });

  test("2px or less either way is a spacer, 3px and up is the email", () => {
    const centred = design().map((n) => ({ ...n, x: n.x + 240 }));
    const at = (box: Partial<DomNode>) => {
      const s = node("", { tag: "img", src: "s.gif", ...box });
      return keptOf([s, ...centred], [s, ...design()]).width;
    };
    expect(at({ w: 2, h: 2 })).toBe(1);
    expect(at({ w: 2, h: 400 })).toBe(1);
    expect(at({ w: 400, h: 2 })).toBe(1);
    expect(at({ w: 3, h: 3 })).toBeLessThan(1);
  });

  test("an email the client blows up to twice its width has lost its width", () => {
    expect(keptOf(design(), scaled(design(), 2)).width).toBe(0.5);
  });

  test("the same blow-up is no change when the client zoomed by that much", () => {
    expect(keptOf(design(), scaled(design(), 2), 2).width).toBe(1);
  });

  test("a link as wide as its text is no layout, when the font widens it", () => {
    const link = (w: number) =>
      node("Learn more", { tag: "a", x: 0, y: 200, w }, { display: "inline" });
    const k = keptOf([...design(), link(80)], [...design(), link(800)]);
    expect(k.width).toBe(1);
  });

  test("an image keeps its width whatever its display", () => {
    const img = (w: number) =>
      node("", { tag: "img", y: 200, w }, { display: "inline" });
    expect(
      keptOf([...design(), img(300)], [...design(), img(1200)]).width,
    ).toBe(0.5);
  });
});

describe("keptOf: what changed", () => {
  test("padding the client strips is named, with the element", () => {
    const sim = design().map((n) =>
      n.text === "Header"
        ? { ...n, style: { ...n.style, "padding-top": "0px" } }
        : n,
    );
    expect(keptOf(design(), sim).changed.spacing).toEqual({
      count: 1,
      example: {
        text: "Header",
        prop: "padding-top",
        design: "24px",
        client: "0px",
      },
    });
  });

  // Read on real rows (2026-11-11): an image "changed font", a width 0.53px
  // off and an image's max-width were listed as changes a reader can see.
  test("text style counts only where there is text", () => {
    const img = (font: string) => [
      {
        ...node("", { tag: "img", src: "logo.png" }),
        style: { ...node("").style, "font-family": font },
      },
    ];
    expect(keptOf(img("Inter"), img("Arial")).changed.type).toBeUndefined();
  });
  test("a size within 2% is the same size, past it a change", () => {
    const w = (v: string) => [node("Go", {}, { width: v })];
    expect(keptOf(w("95.72px"), w("96.25px")).changed.layout).toBeUndefined();
    expect(keptOf(w("100px"), w("103px")).changed.layout?.count).toBe(1);
  });
  test("max-width is no change by itself: what it does shows in the width", () => {
    const m = (v: string) => [node("Go", {}, { "max-width": v })];
    expect(keptOf(m("none"), m("592px")).changed.layout).toBeUndefined();
  });

  const card = (style: Record<string, string>) => [
    node("Card", {}, { "border-radius": "8px", ...style }),
  ];
  const square = (of: DomNode[]) =>
    of.map((n) => ({ ...n, style: { ...n.style, "border-radius": "0px" } }));

  test("square corners count where the corner is visible, not on a bare box", () => {
    const filled = card({ "background-color": "rgb(138, 117, 68)" });
    expect(keptOf(filled, square(filled)).changed.corners?.count).toBe(1);
    expect(keptOf(card({}), square(card({}))).changed.corners).toBeUndefined();
  });

  test("a corner shows on a border or a background image too", () => {
    for (const style of [
      { "border-top-width": "1px" },
      { "background-image": "url(a.png)" },
    ]) {
      const c = card(style);
      expect(keptOf(c, square(c)).changed.corners?.count).toBe(1);
    }
  });

  test("a client that drops a card's fill and its corners: the corners count", () => {
    const d = card({ "background-color": "rgb(138, 117, 68)" });
    expect(keptOf(d, [node("Card")]).changed.corners?.count).toBe(1);
  });

  test("a property one side did not record is no change", () => {
    const d = [node("Card", {}, { "box-shadow": "0 1px 2px #000" })];
    expect(keptOf(d, [node("Card")]).changed.effects).toBeUndefined();
    expect(keptOf([node("Card")], d).changed.effects).toBeUndefined();
  });
});

describe("keptOf: one component", () => {
  // A 600px email: a full-width text block, a centred button, an image.
  const fill = { "background-color": "rgb(255, 102, 0)" };
  const email = () => [
    node("Intro", { y: 0 }),
    node("Go", { x: 250, y: 40, w: 100 }, { display: "inline-block", ...fill }),
    node("", { tag: "img", src: "hero.png", x: 150, y: 100, w: 300, h: 200 }),
  ];
  const kinds = (client: DomNode[], zoom = 1) =>
    keptOf(email(), client, zoom).components.map((c) => c.kind);

  test("nothing wrong, no component named", () => {
    expect(keptOf(email(), email()).components).toEqual([]);
  });

  test("a centred button pushed to the left is moved, with where it was and is", () => {
    expect(keptOf(email(), edit("Go", { x: 24 }, email())).components).toEqual([
      {
        text: "Go",
        kind: "moved",
        design: "centre at 50%",
        client: "centre at 12%",
        breaks: true,
      },
    ]);
  });

  test("a few pixels off is in place: 3% of the email's width", () => {
    expect(kinds(edit("Go", { x: 268 }, email()))).toEqual([]);
    expect(kinds(edit("Go", { x: 270 }, email()))).toEqual(["moved"]);
  });

  test("a whole email zoomed out moves and resizes nothing", () => {
    expect(kinds(scaled(email(), 0.5), 0.5)).toEqual([]);
  });

  test("a running link is no component: its width is its text", () => {
    const link = node(
      "more",
      { tag: "a", x: 0, y: 320, w: 40 },
      { display: "inline" },
    );
    const moved = { ...link, x: 300 };
    expect(keptOf([...email(), link], [...email(), moved]).components).toEqual(
      [],
    );
  });

  test("a resized component is told at the design's scale", () => {
    const shrunk = scaled(edit("Go", { x: 270, w: 60 }, email()), 0.5);
    expect(keptOf(email(), shrunk, 0.5).components).toEqual([
      {
        text: "Go",
        kind: "resized",
        design: "100px",
        client: "60px",
        breaks: true,
      },
    ]);
  });

  test("a button whose padding collapses is resized", () => {
    expect(kinds(edit("Go", { x: 270, w: 60 }, email()))).toEqual(["resized"]);
  });

  test("an image drawn at another size is resized; up to 20% is not", () => {
    const img = (w: number) =>
      email().map((n) => (n.tag === "img" ? { ...n, x: 300 - w / 2, w } : n));
    expect(kinds(img(200))).toEqual(["resized"]);
    expect(kinds(img(240))).toEqual([]);
    expect(kinds(img(361))).toEqual(["resized"]);
    expect(kinds(img(360))).toEqual([]);
  });

  // Graded 2026-11-10, 95 pairs: a component breaks the email past 15% of
  // its width moved, or 1.65x resized; nearer, it changes it.
  const breaks = (client: DomNode[]) =>
    keptOf(email(), client).components.map((c) => c.breaks);
  test("a component moved up to 15% of the email's width only changes it", () => {
    expect(breaks(edit("Go", { x: 340 }, email()))).toEqual([false]);
    expect(breaks(edit("Go", { x: 341 }, email()))).toEqual([true]);
  });
  test("a component resized up to 1.65x only changes it", () => {
    const img = (w: number) =>
      email().map((n) => (n.tag === "img" ? { ...n, x: 300 - w / 2, w } : n));
    expect(breaks(img(185))).toEqual([false]);
    expect(breaks(img(180))).toEqual([true]);
    expect(breaks(img(490))).toEqual([false]);
    expect(breaks(img(500))).toEqual([true]);
  });

  test("a text block at another width is no resized component: its box is the column's", () => {
    expect(kinds(edit("Intro", { w: 400, x: 100 }, email()))).toEqual([]);
  });

  test("a fill the client drops or changes is named", () => {
    const style = (st: Record<string, string>) =>
      email().map((n) =>
        n.text === "Go" ? { ...n, style: { ...n.style, ...st } } : n,
      );
    expect(kinds(style({ "background-color": "rgba(0, 0, 0, 0)" }))).toEqual([
      "fill",
    ]);
    // Graded 2026-11-10: Make's CTA losing its gradient changes the email.
    expect(
      keptOf(email(), style({ "background-color": "rgba(0, 0, 0, 0)" }))
        .components[0].breaks,
    ).toBe(false);
    expect(kinds(style({ "background-color": "rgb(0, 0, 255)" }))).toEqual([
      "fill",
    ]);
    const pictured = email().map((n) =>
      n.text === "Intro"
        ? { ...n, style: { ...n.style, "background-image": "url(bg.png)" } }
        : n,
    );
    const bare = email();
    expect(keptOf(pictured, bare).components.map((c) => c.kind)).toEqual([
      "fill",
    ]);
  });

  // Graded 2026-11-10: AliExpress on Yahoo, broken. The sim dropped
  // background-size: cover, so each product photo drew at its own size.
  test("a background picture drawn at another size breaks the email", () => {
    const photo = (size: string) =>
      email().map((n) =>
        n.text === "Intro"
          ? {
              ...n,
              picture: true,
              style: {
                ...n.style,
                "background-image": "url(shoe.png)",
                "background-size": size,
              },
            }
          : n,
      );
    expect(keptOf(photo("cover"), photo("auto")).components).toEqual([
      {
        text: "Intro",
        kind: "resized",
        design: "background-size: cover",
        client: "background-size: auto",
        breaks: true,
      },
    ]);
    expect(keptOf(photo("cover"), photo("cover")).components).toEqual([]);
  });

  test("an empty cell's picture is found by its picture, not its text", () => {
    const cell = (size: string, picture = true) =>
      node(
        "",
        { tag: "td", x: 150, y: 320, w: 300, h: 200, picture },
        {
          "background-image": 'url("https://x.test/shoe.png")',
          "background-size": size,
        },
      );
    expect(
      keptOf(
        [...email(), cell("cover")],
        [...email(), cell("auto")],
      ).components.map((c) => [c.text, c.client]),
    ).toEqual([["shoe.png", "background-size: auto"]]);
  });

  // Graded kept 2026-11-10: colorlib~5 on Yahoo, whose hero photo is a dead
  // address. Sized or not, nothing draws.
  test("a picture that never drew is no wrong size", () => {
    const cell = (size: string, picture?: boolean) =>
      node(
        "",
        { tag: "td", x: 150, y: 320, w: 300, h: 200, picture },
        { "background-image": "url(dead.jpg)", "background-size": size },
      );
    for (const drew of [false, undefined])
      expect(
        keptOf([...email(), cell("cover", drew)], [...email(), cell("auto")])
          .components,
      ).toEqual([]);
  });

  test("an image with no address is told by its tag", () => {
    const img = node("", { tag: "img", y: 320, w: 50, h: 50 });
    expect(keptOf([...email(), img], email()).lost).toEqual(["img"]);
  });

  test("a background size with no picture to size is nothing", () => {
    const sized = (size: string) =>
      email().map((n) =>
        n.text === "Intro"
          ? { ...n, style: { ...n.style, "background-size": size } }
          : n,
      );
    expect(keptOf(sized("cover"), sized("auto")).components).toEqual([]);
  });

  test("a fill the client adds is no lost design", () => {
    const filled = email().map((n) =>
      n.text === "Intro" ? { ...n, style: { ...n.style, ...fill } } : n,
    );
    expect(keptOf(email(), filled).components).toEqual([]);
  });

  test("rounded corners squared off, where they show, are named", () => {
    const round = email().map((n) =>
      n.text === "Go"
        ? { ...n, style: { ...n.style, "border-radius": "8px" } }
        : n,
    );
    expect(keptOf(round, email()).components).toEqual([
      {
        text: "Go",
        kind: "corners",
        design: "8px",
        client: "0px",
        breaks: false,
      },
    ]);
  });
});

describe("verdictOf", () => {
  const whole = {
    content: 1,
    columns: 1,
    width: 1,
    components: [],
    changed: {},
  };
  test("kept when content, layout and pixels hold", () => {
    expect(verdictOf(whole, 0.02)).toBe("kept");
  });
  // Graded 2026-11-10: spacing shifts of 2.5-5% of pixels read as changed.
  test("changed from 2.5% of pixels off", () => {
    expect(verdictOf(whole, 0.03)).toBe("changed");
  });
  // The email page has no pixels, only the two DOMs (lib/design-check/run.ts).
  test("without pixels, kept when no design property changed", () => {
    expect(verdictOf(whole)).toBe("kept");
  });
  test("without pixels, a changed property changes the email", () => {
    const font = {
      type: {
        count: 1,
        example: {
          text: "Hi",
          prop: "font-family",
          design: "Inter",
          client: "Arial",
        },
      },
    };
    expect(verdictOf({ ...whole, changed: font })).toBe("changed");
  });
  test("without pixels, a component near its place changes the email", () => {
    const near = {
      text: "Go",
      kind: "moved" as const,
      design: "centre at 50%",
      client: "centre at 46%",
      breaks: false,
    };
    expect(verdictOf({ ...whole, components: [near] })).toBe("changed");
  });
  test("without pixels, lost content still breaks it", () => {
    expect(verdictOf({ ...whole, content: 0.8 })).toBe("broken");
  });
  test("broken when content is lost", () => {
    expect(verdictOf({ ...whole, content: 0.8 }, 0.02)).toBe("broken");
  });
  test("broken when columns stack", () => {
    expect(verdictOf({ ...whole, columns: 0.5 }, 0.02)).toBe("broken");
  });
  test("broken when the email loses its width", () => {
    expect(verdictOf({ ...whole, width: 0.6 }, 0.02)).toBe("broken");
  });
  // The owner, 2026-11-10: "it can be just one component with the wrong
  // visual or position"; the grades put the line far out (keptOf above).
  test("broken by one component far out of place, changed by one near", () => {
    const go = (breaks: boolean) => ({
      text: "Go",
      kind: "moved" as const,
      design: "centre at 50%",
      client: "centre at 40%",
      breaks,
    });
    expect(verdictOf({ ...whole, components: [go(true)] }, 0.01)).toBe(
      "broken",
    );
    expect(verdictOf({ ...whole, components: [go(false)] }, 0.01)).toBe(
      "changed",
    );
  });
  // Graded 2026-11-10: a CTA losing its gradient (Make on Yahoo) and
  // squared-off buttons in Outlook Classic are changed, not broken.
  const wrong = (
    text: string,
    kind: "moved" | "resized" | "fill" | "corners",
  ) => ({
    text,
    kind,
    design: "x",
    client: "y",
    breaks: false,
  });
  test("changed, not broken, when an element is wrong in one way", () => {
    for (const kind of ["moved", "resized", "fill", "corners"] as const)
      expect(
        verdictOf({ ...whole, components: [wrong("Go", kind)] }, 0.01),
      ).toBe("changed");
  });
  // The owner, 2026-11-11, on Skeyon's CTA in Outlook Classic: squared,
  // padding gone, flush to the card edge. Each under its line, together a
  // button a strict QA client rejects.
  test("broken when one element is wrong in two ways", () => {
    expect(
      verdictOf(
        {
          ...whole,
          components: [wrong("Go", "resized"), wrong("Go", "corners")],
        },
        0.01,
      ),
    ).toBe("broken");
  });
  test("two elements each wrong in one way only change the email", () => {
    expect(
      verdictOf(
        {
          ...whole,
          components: [wrong("Go", "corners"), wrong("Logo", "moved")],
        },
        0.01,
      ),
    ).toBe("changed");
  });
  test("changed when it holds together but looks different", () => {
    expect(verdictOf(whole, 0.09)).toBe("changed");
  });
  test("the cuts themselves hold at their line", () => {
    expect(
      verdictOf({ ...whole, content: 0.95, columns: 0.9, width: 0.85 }, 0.0249),
    ).toBe("kept");
    expect(verdictOf(whole, 0.025)).toBe("changed");
  });
});
