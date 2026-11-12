import { describe, expect, test } from "bun:test";
import { parseColor, simulateDarkMode } from "../index";
import { FIT, HELDOUT, type Row } from "./apple-mail-dark.data";

function simulated(client: string, [role, sent]: Row): string {
  const style = role === "bg" ? `background-color:${sent};color:#000000` : `background-color:#ffffff;color:${sent}`;
  const html = `<html><body><table><tr><td style="${style}">x</td></tr></table></body></html>`;
  const out = simulateDarkMode(html, client).html.match(/<td style="([^"]*)"/)![1];
  const prop = role === "bg" ? "background-color" : "color";
  return out.split(";").map((d) => d.split(":").map((s) => s.trim())).find((d) => d[0] === prop)![1];
}

const off = (a: string, b: string) => {
  const x = parseColor(a)!, y = parseColor(b)!;
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
};

for (const client of ["apple-mail-macos", "apple-mail-ios"])
  for (const [name, rows] of [["fitted", FIT], ["held-out", HELDOUT]] as const) {
    describe(`${client} forced dark mode matches the real app (${name} colours)`, () => {
      for (const row of rows) {
        test(`${row[0]} ${row[1]} -> ${row[2]}`, () => {
          expect(off(simulated(client, row), row[2])).toBeLessThanOrEqual(3);
        });
      }
    });
  }

test("a pure black background is the app's canvas: #242a2b on Mac, black on iPad", () => {
  const html = `<html><body><table><tr><td bgcolor="#000000" style="background-color:#000000">x</td></tr></table></body></html>`;
  expect(simulateDarkMode(html, "apple-mail-macos").html).toContain("background-color: #242a2b");
  expect(simulateDarkMode(html, "apple-mail-ios").html).toContain("background-color: #000000");
});

test("an email that declares dark support keeps its own colours", () => {
  const html = `<html><head><meta name="color-scheme" content="light dark"></head><body><table><tr><td style="background-color:#ffffff;color:#000000">x</td></tr></table></body></html>`;
  expect(simulateDarkMode(html, "apple-mail-macos").html).toContain("background-color:#ffffff");
});
