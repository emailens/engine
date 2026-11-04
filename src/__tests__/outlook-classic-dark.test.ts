import { describe, expect, test } from "bun:test";
import { parseColor, simulateDarkMode, transformForClient } from "../index";
import { CONTROL, FIT, HELDOUT, type Row } from "./outlook-classic-dark.data";

function simulated([role, sent]: Row): string {
  const style = role === "bg" ? `background-color:${sent};color:#000000` : `background-color:#ffffff;color:${sent}`;
  const html = `<html><body><table><tr><td style="${style}">x</td></tr></table></body></html>`;
  const out = simulateDarkMode(html, "outlook-windows-legacy").html.match(/<td style="([^"]*)"/)![1];
  const prop = role === "bg" ? "background-color" : "color";
  return out.split(";").map((d) => d.split(":").map((s) => s.trim())).find((d) => d[0] === prop)![1];
}

const off = (a: string, b: string) => {
  const x = parseColor(a)!, y = parseColor(b)!;
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
};

// Word turns the most saturated blues and violets toward cyan as it lightens
// them (#2222c3 -> #00bcff), and darkens strong yellows less than the rule. Both
// are colours the rule pushes out of gamut; these cells are off by 20 or more.
const KNOWN_MISSES = new Set([
  "bg #b8b82e", "bg #e0e085", "fg #c3c322", "fg #e4e467",
  "bg #ba08fd", "bg #6818ec", "bg #5422f0", "fg #2222c3", "fg #9c0fec", "fg #3551f4", "fg #5039de",
]);

for (const [name, rows] of [["fitted", FIT], ["held-out", HELDOUT], ["control", CONTROL]] as const) {
  describe(`outlook-windows-legacy dark mode matches the real app (${name} colours)`, () => {
    for (const row of rows) {
      test(`${row[0]} ${row[1]} -> ${row[2]}`, () => {
        expect(off(simulated(row), row[2]) <= 4).toBe(!KNOWN_MISSES.has(`${row[0]} ${row[1]}`));
      });
    }
  });
}

test("an unset background is Outlook's #262626, like white", () => {
  const html = `<html><body><p>x</p></body></html>`;
  expect(simulateDarkMode(html, "outlook-windows-legacy").html).toContain("background-color: #262626");
});

test("a VML button keeps its fill and stroke; its label is recoloured", () => {
  // Real KVWdnnChGCCI, dark: the #1F4D3A roundrect stayed green, its #F6F1E7
  // label went dark, while the same green on a <td> turned pale mint.
  const html = `<html><body><table><tr><td><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:60px;v-text-anchor:middle;width:320px;" arcsize="14%" strokecolor="#E07A3F" strokeweight="2px" fillcolor="#1F4D3A"><w:anchorlock/><center style="color:#F6F1E7;font-size:19px;">Go</center></v:roundrect><![endif]--></td></tr></table></body></html>`;
  const word = transformForClient(html, "outlook-windows-legacy").html;
  const dark = simulateDarkMode(word, "outlook-windows-legacy").html;
  const button = dark.match(/<div data-vml="roundrect"[^>]*style="([^"]*)"/)![1];
  expect(button).toMatch(/#1F4D3A/i);
  expect(button).toMatch(/#E07A3F/i);
  expect(dark).not.toMatch(/color:\s*#F6F1E7/i);
});

test("a border shorthand's colour flips like border-color", () => {
  // Real KVWdnnChGCCI, dark: its 1px solid #E6DDCB card borders and dividers went dark.
  const html = `<html><head><style>.c{border-top:1px solid #E6DDCB}</style></head><body><table><tr><td style="border:1px solid #E6DDCB">x</td></tr></table></body></html>`;
  const dark = simulateDarkMode(html, "outlook-windows-legacy").html;
  expect(dark).not.toMatch(/#E6DDCB/i);
  expect(dark).toMatch(/border:\s*1px solid #53482e/);
});
