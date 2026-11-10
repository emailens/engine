// Image links every reader would see broken, fetched by our server so no
// browser extension can hide or break one (docs/fidelity/score-from-render.md).
// Only what is certain counts: a timeout, a 5xx or a 403 may be ours alone.

import { load } from "cheerio";

// A placeholder an ESP fills per send: not an address yet.
const PLACEHOLDER = /\{\{|\}\}|\*\||\|\*|%%|\$\{|\[\[/;
const CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
const tiny = (v: string | undefined) => !!v && Number.parseFloat(v) <= 2;

/** The visible images of `html`, once each: what a reader would see empty. */
export function imageUrls(html: string): string[] {
  const $ = load(html);
  const found: string[] = [];
  $("img").each((_, el) => {
    const img = $(el);
    const style = img.attr("style") ?? "";
    // A tracking pixel: nobody sees it either way.
    if (
      tiny(img.attr("width")) ||
      tiny(img.attr("height")) ||
      tiny(/(?:^|;)\s*width\s*:\s*([\d.]+)px/.exec(style)?.[1]) ||
      tiny(/(?:^|;)\s*height\s*:\s*([\d.]+)px/.exec(style)?.[1])
    )
      return;
    found.push(img.attr("src") ?? "");
  });
  $("[background]").each((_, el) => {
    found.push($(el).attr("background") ?? "");
  });
  const css = [
    ...$("[style]")
      .map((_, el) => $(el).attr("style") ?? "")
      .get(),
    ...$("style")
      .map((_, el) => $(el).text())
      .get(),
  ];
  for (const text of css)
    for (const m of text.matchAll(CSS_URL)) found.push(m[1]);
  const urls = found
    .map((u) => u.trim())
    .filter((u) => u && !/^(data|cid|about|blob):/i.test(u))
    .filter((u) => !PLACEHOLDER.test(u))
    .map((u) => (u.startsWith("//") ? `https:${u}` : u));
  return [...new Set(urls)];
}

/**
 * One fetch of an image address, as the caller's fetcher answers it. The
 * caller owns the network: it must refuse private addresses (SSRF), cap the
 * body and time out.
 */
export type ImageAnswer =
  | { ok: true; contentType: string }
  | {
      ok: false;
      kind: "bad_status" | "unreachable" | "timeout" | "too_large" | string;
      status?: number;
    };
export type ImageFetcher = (url: string) => Promise<ImageAnswer>;
type Fetcher = ImageFetcher;

const DEAD_STATUS = new Set([400, 404, 410]);

/** One answer: dead, alive, or not sure ("unreachable" is asked twice). */
function judge(r: ImageAnswer): "dead" | "alive" | "unsure" {
  if (r.ok)
    return /^text\/html|^application\/(json|xml)/i.test(r.contentType)
      ? "dead"
      : "alive";
  if (r.kind === "bad_status" && r.status && DEAD_STATUS.has(r.status))
    return "dead";
  if (r.kind === "too_large") return "alive";
  return r.kind === "unreachable" ? "dead" : "unsure";
}

async function dead(url: string, fetcher: Fetcher) {
  // No inbox resolves a relative address.
  if (!/^https?:\/\//i.test(url)) return true;
  // ponytail: http:// is not judged; the fetcher is https-only. Gmail's
  // proxy still loads most http images, so it is not a certain break.
  if (url.startsWith("http://")) return false;
  const first = await fetcher(url);
  if (first.ok || first.kind !== "unreachable") return judge(first) === "dead";
  // A host that does not answer may be a blip: asked once more.
  return judge(await fetcher(url)) === "dead";
}

/** The image links in `html` that are broken for every reader. */
export async function deadImages(
  html: string,
  fetcher: Fetcher,
): Promise<string[]> {
  const urls = imageUrls(html);
  // ponytail: 6 at a time; an email with hundreds of images waits its turn.
  const out: string[] = [];
  for (let i = 0; i < urls.length; i += 6) {
    const batch = urls.slice(i, i + 6);
    const flags = await Promise.all(batch.map((u) => dead(u, fetcher)));
    out.push(...batch.filter((_, j) => flags[j]));
  }
  return out;
}
