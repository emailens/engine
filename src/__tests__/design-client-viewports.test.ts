import { describe, expect, test } from "bun:test";
import { EMAIL_CLIENTS } from "../index";
import {
  buildShellStyle,
  CLIENT_VIEWPORTS,
  DEFAULT_VIEWPORT,
  wrapInShell,
} from "../design/shell";

/**
 * The client list lives in the engine and the render config lives here, so
 * nothing makes them agree except someone remembering. Yahoo Mail Android and
 * Yahoo Mail iOS were added to the engine and never added here, so they fell
 * through to DEFAULT_VIEWPORT, a 640px desktop pane. The engine called them
 * mobile, the mobile-only findings were scoped off that category, and the
 * preview drew a desktop client. Nothing failed; it was just quietly wrong for
 * two of the twenty-one.
 *
 * The invariant worth enforcing is the device class. Exact pixel sizes are a
 * judgement call and a missing desktop entry degrades to a plausible desktop
 * pane, but a phone rendered at 640px wide is not a smaller mistake, it is a
 * different one: it is the width at which a broken responsive email looks fine.
 */
describe("every mobile client renders as a phone", () => {
  const mobileClients = EMAIL_CLIENTS.filter((c) => c.category === "mobile");

  test("the engine still has mobile clients to check", () => {
    // Guards the guard. If the category is ever renamed, the loop below would
    // silently pass over an empty list.
    expect(mobileClients.length).toBeGreaterThan(0);
  });

  for (const client of mobileClients) {
    test(`${client.id} has a mobile viewport`, () => {
      const vp = CLIENT_VIEWPORTS[client.id];
      expect(vp).toBeDefined();
      expect(vp!.isMobile).toBe(true);
      // A phone is narrower than the desktop fallback. This catches an entry
      // that exists and carries the flag but was copied from a desktop row.
      expect(vp!.width).toBeLessThan(DEFAULT_VIEWPORT.width);
    });
  }
});

describe("no desktop or webmail client claims to be a phone", () => {
  // The other direction, which would put a desktop client in the phone frame
  // and cap its width at a device size it never has.
  for (const client of EMAIL_CLIENTS.filter((c) => c.category !== "mobile")) {
    test(`${client.id} is not flagged mobile`, () => {
      expect(CLIENT_VIEWPORTS[client.id]?.isMobile ?? false).toBe(false);
    });
  }
});

describe("the shell's side padding", () => {
  const padX = (id: string) =>
    Number(buildShellStyle(id, "light").match(/padding:\d+px (\d+)px/)?.[1]);

  test("a phone keeps its padding", () => {
    expect(padX("gmail-android")).toBe(16);
  });
  test("a narrow desktop pane gives way to a 600px email, centred", () => {
    // HEY is 580 wide: no room beside a 600px email, so none of its own 24.
    expect(padX("hey-mail")).toBe(0);
  });
  test("new Outlook lays the email out across its whole pane", () => {
    // The worker's new Outlook, pane at 620 CSS px: a fluid email's text runs
    // from the pane's edge to edge (heldout-theresanaiforthat, 2026-11-10);
    // the 10px each side made the sim wrap every line earlier.
    expect(padX("outlook-windows")).toBe(0);
  });
  test("an unknown client gets the default shell's padding", () => {
    expect(padX("no-such-client")).toBe(16);
  });
});

describe("new Outlook's unstyled text", () => {
  // heldout-theresanaiforthat sets no font: the worker's new Outlook drew it
  // 15px and #242424 (its most common dark pixel), the sim 16px and black.
  test("is 15px and #242424 in light mode", () => {
    const css = buildShellStyle("outlook-windows", "light");
    expect(css).toContain("font-size:15px");
    expect(css).toContain("color:#242424");
  });
  test("keeps no light text colour in dark mode", () => {
    expect(buildShellStyle("outlook-windows", "dark")).not.toContain(
      "color:#242424",
    );
  });
});

describe("the email's <body> under the shell", () => {
  const wrap = (style: string) =>
    wrapInShell(`<html><body ${style}><p>x</p></body></html>`);

  test("only text styles move inside the shell", () => {
    const out = wrap(`style="display:flex;COLOR:#333;background:#eee"`);
    expect(out).toContain(
      `<div class="emailens-shell"><div style="COLOR:#333">`,
    );
  });
  test("a single-quoted style is read too", () => {
    expect(wrap(`style='color:#333'`)).toContain(`<div style="color:#333">`);
  });
  test("layout properties leave the body, others stay", () => {
    expect(wrap(`style="DISPLAY:flex;background:#eee"`)).toContain(
      `<body style="background:#eee">`,
    );
  });
  test("a body left with no style loses the attribute", () => {
    expect(wrap(`style="display:flex"`)).toContain(
      `<body><div class="emailens-shell">`,
    );
  });
});

describe("images in the reading pane", () => {
  // Measured 2026-11-10 on the fidelity bench's real captures: Yahoo and
  // Proton draw images at the email's own size (409 of 585 and 335 of 474
  // with max-width none; the rest set by the email). Fitting them anyway
  // drew konsav's 50px icons at 27 and collapsed Barebone's 48px images to
  // nothing, in a shrink-to-fit cell.
  const fits = (client: string) =>
    buildShellStyle(client, "light").includes(".emailens-shell img{");
  test("webmail that draws images as authored does not fit them", () => {
    for (const client of ["yahoo-mail", "protonmail", "gmail-web"])
      expect(fits(client)).toBe(false);
  });
  test("an unmeasured client keeps the fit", () => {
    expect(fits("apple-mail-ios")).toBe(true);
  });
});
