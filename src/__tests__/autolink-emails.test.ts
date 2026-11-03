import { describe, expect, test } from "bun:test";
import * as cheerio from "cheerio";
import { transformForClient } from "../transform";

// Real-device run C93iCoVV5yas (preview 9OIChQggAtbG), 2026-11-03: a bare
// address in bold dark text, and another in the small grey legal footer, came
// out as links in Gmail web (blue, underlined), Gmail Android (blue, no
// underline), Outlook Classic, Outlook for Mac and Apple Mail on the Mac (blue,
// underlined), bold kept. New Outlook and Apple Mail on the iPad left both as
// plain text. Blues are each client's link default, hue-checked on the
// captures: Gmail #1155cc, Word's MsoHyperlink `blue`, WebKit's #0068da.
const html = `<html><body>
  <p>Usuario:</p>
  <p><span style="color:#262428;font-weight:700">pepito@gmail.com</span></p>
  <p style="font-size:9px;color:#777">Correo electrónico: rgpd@ediversa.com. Finalidad</p>
  <p><a href="mailto:info@ediversa.com" style="color:#27873c">info@ediversa.com</a></p>
</body></html>`;

const links = (clientId: string) => {
  const $ = cheerio.load(transformForClient(html, clientId).html);
  return $("a")
    .toArray()
    .map((a) => ({ text: $(a).text(), href: $(a).attr("href"), style: $(a).attr("style") ?? "" }));
};

describe("clients that turn a bare email address into a link", () => {
  const cases: [string, string, boolean][] = [
    ["gmail-web", "#1155cc", true],
    ["gmail-android", "#1155cc", false],
    ["outlook-windows-legacy", "blue", true],
    ["outlook-macos", "#0068da", true],
    ["apple-mail-macos", "#0068da", true],
  ];
  for (const [client, color, underline] of cases) {
    test(`${client} links both addresses in its own link colour`, () => {
      const found = links(client);
      for (const address of ["pepito@gmail.com", "rgpd@ediversa.com"]) {
        const a = found.find((l) => l.text === address);
        expect(a?.href).toBe(`mailto:${address}`);
        expect(a?.style).toContain(`color:${color}`);
        expect(a?.style).toContain(`text-decoration:${underline ? "underline" : "none"}`);
      }
      // The sender's own link keeps its colour and is not wrapped again.
      expect(found.filter((l) => l.text === "info@ediversa.com")).toEqual([
        { text: "info@ediversa.com", href: "mailto:info@ediversa.com", style: "color:#27873c" },
      ]);
    });
  }

  for (const client of ["outlook-windows", "apple-mail-ios"]) {
    test(`${client} leaves bare addresses as text`, () => {
      expect(links(client).map((l) => l.text)).toEqual(["info@ediversa.com"]);
    });
  }
});
