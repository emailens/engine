import { describe, expect, test } from "bun:test";
import { deadImages, imageUrls } from "../design/images";
import type { ImageAnswer as SafeFetchResult } from "../design/images";

describe("imageUrls: the images a reader would see", () => {
  test("img sources, background attributes and CSS backgrounds, once each", () => {
    const html = `<style>.hero{background-image:url('https://a.co/hero.jpg')}</style>
      <table background="https://a.co/bg.png"><tr><td style="background: #fff url(https://a.co/cell.png) no-repeat">
      <img src="https://a.co/logo.png"><img src="https://a.co/logo.png"></td></tr></table>`;
    expect(imageUrls(html).sort()).toEqual([
      "https://a.co/bg.png",
      "https://a.co/cell.png",
      "https://a.co/hero.jpg",
      "https://a.co/logo.png",
    ]);
  });

  test("tracking pixels, inline images and placeholders are not checked", () => {
    const html = `<img src="https://t.co/open.gif" width="1" height="1">
      <img src="https://t.co/o.gif" style="width:1px;height:1px">
      <img src="data:image/png;base64,AAAA"><img src="cid:logo">
      <img src="{{ logo_url }}"><img src="https://a.co/*|MERGE|*.png">
      <img src="https://a.co/%%img%%.png"><img src="">`;
    expect(imageUrls(html)).toEqual([]);
  });

  test("a protocol-relative address is read as https", () => {
    expect(imageUrls('<img src="//cdn.a.co/x.png">')).toEqual([
      "https://cdn.a.co/x.png",
    ]);
  });

  test("a relative address is kept as written: no inbox can load it", () => {
    expect(imageUrls('<img src="images/logo.png">')).toEqual([
      "images/logo.png",
    ]);
  });
});

const ok = (contentType: string): SafeFetchResult => ({
  ok: true,
  contentType,
});
const fail = (kind: string, status?: number): SafeFetchResult => ({
  ok: false,
  kind,
  status,
});

describe("deadImages: only what is certainly broken for every reader", () => {
  const run = (answers: Record<string, SafeFetchResult[]>) => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return answers[url]?.shift() ?? ok("image/png");
    };
    return { asked, fetcher };
  };
  const img = (...urls: string[]) =>
    urls.map((u) => `<img src="${u}">`).join("");

  test("a 404, a 410, a 400 and a page served as an image are dead", async () => {
    const { fetcher } = run({
      "https://a.co/1.png": [fail("bad_status", 404)],
      "https://a.co/2.png": [fail("bad_status", 410)],
      "https://a.co/3.png": [fail("bad_status", 400)],
      "https://a.co/4.png": [ok("text/html; charset=utf-8")],
    });
    expect(
      await deadImages(
        img(
          "https://a.co/1.png",
          "https://a.co/2.png",
          "https://a.co/3.png",
          "https://a.co/4.png",
          "https://a.co/ok.png",
        ),
        fetcher,
      ),
    ).toEqual([
      "https://a.co/1.png",
      "https://a.co/2.png",
      "https://a.co/3.png",
      "https://a.co/4.png",
    ]);
  });

  test("a host that does not answer twice is dead; once is a blip", async () => {
    const { fetcher } = run({
      "https://gone.co/x.png": [fail("unreachable"), fail("unreachable")],
      "https://blip.co/x.png": [fail("unreachable"), ok("image/png")],
    });
    expect(
      await deadImages(
        img("https://gone.co/x.png", "https://blip.co/x.png"),
        fetcher,
      ),
    ).toEqual(["https://gone.co/x.png"]);
  });

  test("what we cannot be sure of costs nothing", async () => {
    const { fetcher } = run({
      "https://a.co/slow.png": [fail("timeout")],
      "https://a.co/5xx.png": [fail("bad_status", 503)],
      "https://a.co/auth.png": [fail("bad_status", 403)],
      "https://a.co/big.png": [fail("too_large")],
      "https://a.co/bin.png": [ok("application/octet-stream")],
    });
    expect(
      await deadImages(
        img(
          "https://a.co/slow.png",
          "https://a.co/5xx.png",
          "https://a.co/auth.png",
          "https://a.co/big.png",
          "https://a.co/bin.png",
          "http://a.co/plain.png",
        ),
        fetcher,
      ),
    ).toEqual([]);
  });

  test("a relative address is dead without asking anyone", async () => {
    const { asked, fetcher } = run({});
    expect(await deadImages(img("images/logo.png"), fetcher)).toEqual([
      "images/logo.png",
    ]);
    expect(asked).toEqual([]);
  });

  test("http:// is never fetched: the fetcher is https only", async () => {
    const { asked, fetcher } = run({});
    await deadImages(img("http://a.co/x.png"), fetcher);
    expect(asked).toEqual([]);
  });
});
