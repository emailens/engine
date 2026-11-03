import { describe, expect, test } from "bun:test";
import { parseColor, simulateDarkMode } from "../index";
import { CONTROL, FIT, HELDOUT, type Row } from "./outlook-macos-dark.data";

function simulated([role, sent]: Row): string {
  const style = role === "bg" ? `background-color:${sent};color:#000000` : `background-color:#ffffff;color:${sent}`;
  const html = `<html><body><table><tr><td style="${style}">x</td></tr></table></body></html>`;
  const out = simulateDarkMode(html, "outlook-macos").html.match(/<td style="([^"]*)"/)![1];
  const prop = role === "bg" ? "background-color" : "color";
  return out.split(";").map((d) => d.split(":").map((s) => s.trim())).find((d) => d[0] === prop)![1];
}

const off = (a: string, b: string) => {
  const x = parseColor(a)!, y = parseColor(b)!;
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
};

// Pure red text is lifted out of gamut and the app clips it more gently than
// per-channel clipping does (off by 21 in green). One point; not fitted.
const KNOWN_MISSES = new Set(["fg #ff0000"]);

for (const [name, rows] of [["fitted", FIT], ["held-out", HELDOUT], ["control", CONTROL]] as const) {
  describe(`outlook-macos dark mode matches the real app (${name} colours)`, () => {
    for (const row of rows) {
      test(`${row[0]} ${row[1]} -> ${row[2]}`, () => {
        expect(off(simulated(row), row[2]) <= 4).toBe(!KNOWN_MISSES.has(`${row[0]} ${row[1]}`));
      });
    }
  });
}

test("an unset background is the app's #1e1e1e, like white", () => {
  const html = `<html><body><p>x</p></body></html>`;
  expect(simulateDarkMode(html, "outlook-macos").html).toContain("background-color: #1e1e1e");
});
