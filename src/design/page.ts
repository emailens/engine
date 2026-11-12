/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// ponytail: the DOM types are for the functions that run inside a page; tsc
// makes them visible program-wide, so keep page code to these two files.
// The two pages the design check compares, built the same way wherever they
// are drawn: in local Chrome by the fidelity bench (fidelity/bench/shoot.ts,
// through Playwright) and in the viewer's browser by the email page
// (./run.ts). The functions taking a Document run inside that page, so they
// use nothing from outside themselves.

import {
  buildShellStyle,
  CLIENT_VIEWPORTS,
  DEFAULT_VIEWPORT,
  FONT_FACE_STYLE,
  injectStyleIntoHtml,
} from "./shell";

export const viewOf = (client: string) =>
  CLIENT_VIEWPORTS[client] ?? DEFAULT_VIEWPORT;

/**
 * The design itself: `html` as a plain web page in the frame the sim gave it
 * (`frameWidth`, from frameOf), at the client's window width, and nothing
 * else of the client: no colours or rewrites. Media queries see the
 * client's window, as in the sim; the email column gets the width the sim
 * laid it out at. Guessing the frame instead failed three ways (2026-11-10):
 * a phone's own width rewrapped a non-responsive email, a widened window
 * un-stacked Cerberus on Gmail Android, and raw HTML read as non-responsive
 * where the client's rewrite did not (Resend on Samsung).
 *
 * Fonts: the sim's metric-compatible stand-ins (Arimo for Arial, …), so a
 * face is drawn the same on both pages and the host's own fonts do not count
 * as a change (2026-11-12: real Arial read 0.015 on Windows, Liberation Sans
 * 0.033 on a bare Linux runner, for a table the client keeps).
 *
 * `fits`: the sim fits images to their column there; run releaseImages.
 */
export function designDoc(html: string, client: string, frameWidth: number) {
  // The sim's gutters (its shell padding) inside that width: the frame, not
  // a change to the design.
  const shellStyle = buildShellStyle(client, "light", false);
  const shell = /\.emailens-shell\{([^}]*)\}/.exec(shellStyle)?.[1] ?? "";
  const gutter = /padding:\s*\S+\s+(\d+px)/.exec(shell)?.[1] ?? "0px";
  const fits = /\.emailens-shell img\{/.test(shellStyle);
  // :root and !important: Cerberus's own html{width:100%!important} beat a
  // plain html rule and laid the design out at the phone's width.
  const doc = injectStyleIntoHtml(
    html,
    `<style>${FONT_FACE_STYLE}html,body{margin:0!important}:root{box-sizing:border-box!important;width:${frameWidth}px!important;padding:0 ${gutter}!important}${fits ? "img{max-width:100%;height:auto}" : ""}</style>`,
  );
  return { doc, fits };
}

/**
 * In the design's page, when `fits`: the sim fits images to their column
 * (max-width:100%) where the client does, and so does the design, from the
 * start: a table then sizes without them (Resend's 602px image fits its
 * phone). A shrunk image that fits without it is let go: in a shrink-to-fit
 * cell the percentage resolves against the image itself and drew Matte's
 * 20px icons at 14 (2026-11-10). "Fits" is tried, not guessed: released, the
 * page must not overflow its frame (Resend's 276px cards fit the email but
 * not their columns).
 */
export function releaseImages(doc: Document, frame: number) {
  const root = doc.documentElement;
  for (const img of doc.images) {
    const own = Number.parseFloat(img.getAttribute("width") ?? "");
    if (!own || img.getBoundingClientRect().width >= own) continue;
    img.style.maxWidth = "none";
    if (root.scrollWidth > frame) img.style.maxWidth = "";
  }
}

/** In the sim's page: how far right the email draws, from its shell's left. */
export function emailWidth(doc: Document) {
  const shell = doc.querySelector(".emailens-shell") ?? doc.body;
  const left = shell.getBoundingClientRect().left;
  const right = [...shell.querySelectorAll("*")]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0)
    .reduce((m, r) => Math.max(m, r.right), left);
  return Math.ceil(right - left);
}

/**
 * In the sim's page: the frame it gave the email, the email column's
 * laid-out width (gutters included) and how far it zoomed it
 * (shrinkToFitStyle's transform), drawn over laid-out width.
 */
export function frameOf(root: Element) {
  const width = (root as HTMLElement).offsetWidth || 1;
  return { width, zoom: root.getBoundingClientRect().width / width };
}
