import { describe, expect, test } from "bun:test";
import { renderScores } from "../design/score";

// docs/fidelity/score-from-render.md: a deduction is as strong as the
// evidence that readers see the problem.
describe("renderScores", () => {
  test("a design that holds keeps the engine's score", () => {
    expect(
      renderScores({ "gmail-web": 94 }, { "gmail-web": "changed" }, 0),
    ).toEqual({ "gmail-web": 94 });
  });

  test("a broken design caps a proven client at 49: Broken", () => {
    expect(
      renderScores({ "gmail-web": 100 }, { "gmail-web": "broken" }, 0),
    ).toEqual({ "gmail-web": 49 });
  });

  // Skeyon, 2026-11-11: Outlook Classic at 91, its CTA broken.
  test("a broken design caps an unproven client at 79: Needs work", () => {
    expect(
      renderScores(
        { "outlook-windows-legacy": 91 },
        { "outlook-windows-legacy": "broken" },
        0,
      ),
    ).toEqual({ "outlook-windows-legacy": 79 });
  });

  test("a cap never raises a score", () => {
    expect(
      renderScores(
        { "outlook-windows-legacy": 40 },
        { "outlook-windows-legacy": "broken" },
        0,
      ),
    ).toEqual({ "outlook-windows-legacy": 40 });
  });

  test("each dead image costs 10 in every client, never below 0", () => {
    expect(renderScores({ "gmail-web": 100, "yahoo-mail": 15 }, {}, 2)).toEqual(
      { "gmail-web": 80, "yahoo-mail": 0 },
    );
  });

  test("dead images and a broken design both count", () => {
    expect(
      renderScores({ "gmail-web": 100 }, { "gmail-web": "broken" }, 6),
    ).toEqual({ "gmail-web": 40 });
  });

  test("a client the check did not reach keeps its score", () => {
    expect(renderScores({ "hey-mail": 97 }, {}, 0)).toEqual({ "hey-mail": 97 });
  });
});
