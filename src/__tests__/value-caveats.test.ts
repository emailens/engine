import { describe, expect, it } from "bun:test";
import { analyzeEmail, generateCompatibilityScore } from "../analyze";
import { auditEmail } from "../audit";
import { CSS_SUPPORT, CSS_SUPPORT_NOTES } from "../rules/css-support";
import { caveatApplies, VALUE_CAVEAT_PROPS } from "../rules/value-caveats";
import type { CSSWarning } from "../types";

// =============================================================================
// Value-aware partial support.
//
// A "partial" verdict in caniemail is nearly always value-level: `font-size` is
// partial in Outlook because `rem` is dropped, not because `14px` is. Reporting
// every use of such a property buries the ones that break: 982 of the 1,583
// findings across this repo's fixtures were partial-support info, and almost
// none of them described a value that actually renders differently.
//
// These tests pin the two directions that matter:
//   - the ordinary value is silent (the point of the change), and
//   - the value the note is about is still reported, in exactly the clients
//     whose note is about it (the thing a careless gate would lose).
// =============================================================================

const inline = (decl: string): CSSWarning[] =>
  analyzeEmail(`<html><body><div style="${decl}">x</div></body></html>`);

/** Clients reporting `decl`'s property at info (partial) severity. */
const partialClients = (decl: string): string[] => {
  const prop = decl.split(":")[0].trim().toLowerCase();
  return inline(decl)
    .filter((w) => w.property === prop && w.severity === "info")
    .map((w) => w.client)
    .sort();
};

const OUTLOOK_WORD = ["outlook-windows", "outlook-windows-legacy"];
const YAHOO_AOL = ["aol", "yahoo-mail", "yahoo-mail-android", "yahoo-mail-ios"];
const sorted = (...groups: string[][]) => groups.flat().sort();

describe("value-aware partial support: ordinary values are silent", () => {
  // Each of these is a declaration an email developer writes constantly, and
  // every one of them produced partial-support findings before the gate.
  const ORDINARY = [
    "font-size: 14px",
    "font-size: 16pt",
    "display: none",
    "font-weight: bold",
    "font-weight: 400",
    "font-weight: 700",
    "border-radius: 8px",
    "text-align: center",
    "text-align: left",
    "background: #ffffff",
    "background: white",
    "background: rgba(0, 0, 0, 0.5)",
    "background: transparent",
    "letter-spacing: normal",
    "letter-spacing: 0.5px",
    "margin: 16px",
    "position: static",
    "overflow: hidden",
  ];

  for (const decl of ORDINARY) {
    it(`reports nothing for ${decl}`, () => {
      expect(partialClients(decl)).toEqual([]);
    });
  }
});

describe("value-aware partial support: the value the note is about", () => {
  // Every expectation below is the set of clients whose caniemail note names
  // this value. They are written out rather than derived, so that a resync
  // which changes a note's meaning fails here instead of silently widening or
  // narrowing what the engine reports.

  it("font-size: `rem` is dropped by Outlook 2019+, Yahoo and AOL; `%` is not", () => {
    // "`rem` values are not supported" (Outlook 2019+, Yahoo, AOL) and
    // "`relative` and `percentage` size values not supported" (Outlook 2007-16,
    // Samsung), only the second note covers percentages and `em`.
    const relativeOnly = ["outlook-windows-legacy", "samsung-mail"];
    expect(partialClients("font-size: 1rem")).toEqual(
      sorted(relativeOnly, YAHOO_AOL, ["outlook-windows"]),
    );
    expect(partialClients("font-size: 90%")).toEqual(relativeOnly.sort());
    expect(partialClients("font-size: 1.2em")).toEqual(relativeOnly.sort());
    expect(partialClients("font-size: larger")).toEqual(relativeOnly.sort());
  });

  it("display: Outlook keeps only `none`, Gmail and Yahoo drop a named list", () => {
    // Outlook: "Only supports `display:none`". Gmail: flex, grid, flow-root,
    // contents… are dropped. Yahoo/AOL: flow-root, inline-flex, inline-grid…
    expect(partialClients("display: block")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("display: inline-block")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("display: flex")).toEqual(
      sorted(OUTLOOK_WORD, ["gmail-android", "gmail-ios"]),
    );
    // caniemail writes the two-value form with a space; Yahoo writes it with a
    // dash. Both spellings mean the same value and both must be caught.
    expect(partialClients("display: inline flex")).toEqual(
      sorted(OUTLOOK_WORD, YAHOO_AOL, ["gmail-android", "gmail-ios", "fastmail"]),
    );
  });

  it("font-weight: only numbers that get snapped are reported", () => {
    // Outlook snaps 0-599 to normal and 600-1000 to bold, so 400 and 700 land
    // where they were asked to and 500 does not. Yahoo honours the 100…900
    // steps only.
    expect(partialClients("font-weight: 500")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("font-weight: 350")).toEqual(sorted(OUTLOOK_WORD, YAHOO_AOL));
    expect(partialClients("font-weight: 900")).toEqual(OUTLOOK_WORD.sort());
  });

  it("border-radius: only the elliptical `/` shorthand", () => {
    expect(partialClients("border-radius: 27% 73% 70% 30% / 30% 34% 66% 70%")).toEqual(
      YAHOO_AOL.sort(),
    );
  });

  it("text-align: only the flow-relative and match-parent values", () => {
    expect(partialClients("text-align: start")).toEqual(sorted(OUTLOOK_WORD, YAHOO_AOL));
    expect(partialClients("text-align: match-parent")).toEqual(
      sorted(OUTLOOK_WORD, YAHOO_AOL, ["gmail-android", "samsung-mail"]),
    );
    // Gmail and Samsung name `-webkit-match-parent` as the value that works,
    // in the same note that rules out `match-parent`. Nobody else does, and a
    // client that cannot resolve `match-parent` will not resolve the WebKit
    // spelling of it either, so the prefixed form is still reported there.
    expect(partialClients("text-align: -webkit-match-parent")).toEqual(
      sorted(OUTLOOK_WORD, YAHOO_AOL),
    );
  });

  it("background: Outlook wants a colour; Yahoo loses extra layers", () => {
    expect(partialClients("background: url(a.png)")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("background: linear-gradient(red, blue)")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("background: #fff url(a.png) no-repeat")).toEqual(OUTLOOK_WORD.sort());
    // Two layers: Outlook drops all but the colour, Yahoo eats the comma.
    expect(partialClients("background: url(a.png), url(b.png)")).toEqual(
      sorted(OUTLOOK_WORD, YAHOO_AOL),
    );
    // A comma inside a colour function is not a second layer.
    expect(partialClients("background: rgb(255, 255, 255)")).toEqual([]);
  });

  it("letter-spacing: negatives everywhere, `em` only where the note says so", () => {
    expect(partialClients("letter-spacing: -1px")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("letter-spacing: 0.05em")).toEqual(["outlook-windows"]);
  });

  it("transition: an omitted property name means `all`, and `all` is the caveat", () => {
    const yahoo = (decl: string) => partialClients(decl).filter((c) => YAHOO_AOL.includes(c));
    expect(yahoo("transition: opacity 0.3s ease")).toEqual([]);
    expect(yahoo("transition: all 0.3s")).toEqual(YAHOO_AOL.sort());
    expect(yahoo("transition: 0.3s ease")).toEqual(YAHOO_AOL.sort());
    // A layer whose only non-timing token is a `var()` or `allow-discrete`
    // still names no property, so it too means `all`.
    expect(yahoo("transition: 0.3s var(--ease)")).toEqual(YAHOO_AOL.sort());
    expect(yahoo("transition: 0.2s ease allow-discrete")).toEqual(YAHOO_AOL.sort());
    // …but a value that animates nothing cannot hit the `all` bug.
    expect(yahoo("transition: none")).toEqual([]);
    // Notes that are not about the value (Samsung's "not supported with
    // Outlook accounts", Hey's forced `transition-duration: 0`) still apply.
    expect(partialClients("transition: opacity 0.3s ease")).toContain("samsung-mail");
    expect(partialClients("transition: opacity 0.3s ease")).toContain("hey-mail");
  });
});

describe("value-aware partial support: parsing the declaration", () => {
  it("ignores case and `!important`", () => {
    expect(partialClients("FONT-SIZE: 1REM !important")).not.toEqual([]);
    expect(partialClients("FONT-SIZE: 14PX !important")).toEqual([]);
  });

  it("judges each declaration in a stylesheet separately", () => {
    // Yahoo supports `relative` and nothing else. A sheet using both must still
    // report it: joining the values into one string hid this, because the
    // first keyword found was the supported one.
    const css = "<style>.a { position: relative } .b { position: absolute }</style>";
    const warnings = analyzeEmail(`<html><body>${css}<div class="a b">x</div></body></html>`);
    const yahoo = warnings.find((w) => w.property === "position" && w.client === "yahoo-mail");
    expect(yahoo?.severity).toBe("info");

    const safe = "<style>.a { position: relative } .b { position: static }</style>";
    const none = analyzeEmail(`<html><body>${safe}<div class="a b">x</div></body></html>`);
    expect(none.find((w) => w.property === "position" && w.client === "yahoo-mail")).toBeUndefined();
  });

  it("keeps reporting a property whose value it never saw", () => {
    // At-rules, pseudo-classes and detected CSS functions reach the support
    // check without a value. Gating must not silence them.
    expect(caveatApplies("font-size", undefined, ["`rem` values are not supported."])).toBe(true);
    expect(caveatApplies("font-size", [], ["`rem` values are not supported."])).toBe(true);
    const media = analyzeEmail(
      "<html><body><style>@media screen { .a { color: red } }</style></body></html>",
    );
    expect(media.some((w) => w.property === "@media")).toBe(true);
  });

  it("never gates a property that is not value-gated", () => {
    for (const value of ["", "0", "anything", "inherit"]) {
      expect(caveatApplies("box-shadow", [value], ["Partial."])).toBe(true);
      expect(caveatApplies("line-height", [value], undefined)).toBe(true);
    }
  });

  it("is the disjunction of its values, in any order", () => {
    const notes = CSS_SUPPORT_NOTES["position"]?.["yahoo-mail"];
    const values = ["static", "relative", "absolute", "fixed"];
    for (const a of values) {
      for (const b of values) {
        const both = caveatApplies("position", [a, b], notes);
        const either =
          caveatApplies("position", [a], notes) || caveatApplies("position", [b], notes);
        expect(both).toBe(either);
        expect(caveatApplies("position", [a, b], notes)).toBe(
          caveatApplies("position", [b, a], notes),
        );
      }
    }
  });

  it("survives values it cannot make sense of", () => {
    const hostile = [
      "",
      " ",
      "!important",
      "var(--x)",
      "calc(100% - 10px)",
      "(((",
      ")))",
      "/",
      "url(data:image/png;base64,AAAA)",
      "«»",
      " ",
      "a".repeat(10_000),
      "rgb(",
      "1e999px",
      "-",
      "--",
      "0 0 0 0 0 0 0 0",
    ];
    for (const prop of VALUE_CAVEAT_PROPS) {
      for (const [client, level] of Object.entries(CSS_SUPPORT[prop] ?? {})) {
        if (level !== "partial") continue;
        const notes = CSS_SUPPORT_NOTES[prop]?.[client];
        for (const value of hostile) {
          expect(typeof caveatApplies(prop, [value], notes)).toBe("boolean");
        }
      }
    }
  });
});

describe("value-aware partial support: the gate cannot silence a client", () => {
  // For every property/client pair the matrix calls "partial", at least one
  // value must still trigger it. A predicate that always returned false would
  // drop that client's caveat entirely and no other test would notice.
  const REACHABLE: Record<string, string[]> = {
    background: ["url(a.png)", "url(a.png), url(b.png)"],
    "border-radius": ["10% 20% / 30% 40%"],
    display: ["inline flex", "block", "contents"],
    "font-size": ["1rem", "90%"],
    "font-weight": ["350", "500"],
    "letter-spacing": ["-2px", "-0.1em"],
    margin: ["-8px", "0 auto"],
    position: ["relative", "absolute", "fixed", "sticky"],
    "text-align": ["start", "match-parent"],
    transition: ["all 0.3s", "opacity 0.3s"],
    // `overflow` is the exception, and deliberately: every partial note on it
    // is about the `overflow-block`/`overflow-inline` longhands, which are
    // different properties, plus a "cannot scroll to hidden content" bug on
    // three mobile clients. No value of the `overflow` shorthand reaches the
    // rest, so they are unreachable by construction.
    overflow: ["auto", "scroll"],
  };
  const UNREACHABLE_BY_DESIGN = new Set(
    Object.entries(CSS_SUPPORT["overflow"])
      .filter(([client, level]) => {
        if (level !== "partial") return false;
        const note = (CSS_SUPPORT_NOTES["overflow"]?.[client] ?? []).join(" ");
        return !/cannot scroll/i.test(note);
      })
      .map(([client]) => `overflow/${client}`),
  );

  it("covers every property in VALUE_CAVEAT_PROPS", () => {
    expect(Object.keys(REACHABLE).sort()).toEqual([...VALUE_CAVEAT_PROPS].sort());
  });

  it("leaves every partial client reachable by some value", () => {
    const unreachable: string[] = [];
    for (const prop of VALUE_CAVEAT_PROPS) {
      for (const [client, level] of Object.entries(CSS_SUPPORT[prop] ?? {})) {
        if (level !== "partial") continue;
        const notes = CSS_SUPPORT_NOTES[prop]?.[client];
        const reached = REACHABLE[prop].some((v) => caveatApplies(prop, [v], notes));
        if (!reached && !UNREACHABLE_BY_DESIGN.has(`${prop}/${client}`)) {
          unreachable.push(`${prop}/${client}`);
        }
      }
    }
    expect(unreachable).toEqual([]);
  });

  it("still parses the two notes it reads as prose", () => {
    // `position` reads "Supports `x` but not `y`", and `display` reads
    // "Only supports `display:none`". Both are wordings, not data; a resync
    // that rephrases them would silently stop gating, so assert the shape.
    for (const [client, level] of Object.entries(CSS_SUPPORT["position"])) {
      if (level !== "partial" || client === "superhuman") continue;
      const note = (CSS_SUPPORT_NOTES["position"]?.[client] ?? []).join(" ");
      expect(note).toMatch(/supports\s+.+?\s+but not\s+/i);
    }
    for (const [client, level] of Object.entries(CSS_SUPPORT["display"])) {
      if (level !== "partial") continue;
      const note = (CSS_SUPPORT_NOTES["display"]?.[client] ?? []).join(" ");
      expect(note).toMatch(/only supports\s+`|`[^`]+`|two-value syntax/i);
    }
  });
});

describe("value-aware partial support: nothing else moves", () => {
  it("does not touch a property a client does not support at all", () => {
    // border-radius is unsupported in Outlook's Word engine whatever the value,
    // and that is a warning, not partial support.
    const outlook = inline("border-radius: 8px").filter((w) => w.property === "border-radius");
    expect(outlook.map((w) => w.client).sort()).toEqual(OUTLOOK_WORD.sort());
    expect(outlook.every((w) => w.severity === "warning")).toBe(true);
  });

  it("reports every unsupported client for every gated property, benign value or not", () => {
    const BENIGN: Record<string, string> = {
      background: "#ffffff",
      "border-radius": "8px",
      display: "none",
      "font-size": "14px",
      "font-weight": "400",
      "letter-spacing": "normal",
      margin: "16px",
      overflow: "hidden",
      position: "static",
      "text-align": "center",
      transition: "opacity 0.3s ease",
    };
    for (const prop of VALUE_CAVEAT_PROPS) {
      const expected = Object.entries(CSS_SUPPORT[prop] ?? {})
        .filter(([, level]) => level === "unsupported")
        .map(([client]) => client)
        .sort();
      const actual = inline(`${prop}: ${BENIGN[prop]}`)
        .filter((w) => w.property === prop && w.severity === "warning")
        .map((w) => w.client)
        .sort();
      expect(actual).toEqual(expected);
    }
  });

  it("leaves compatibility scores where they were", () => {
    // Partial support is not penalised, so gating it changes counts and not
    // scores. If that ever stops being true, this change became a breaking one.
    const warnings = analyzeEmail(
      `<html><body><style>.a { font-size: 14px; display: block; background: #fff }</style>
       <div class="a" style="letter-spacing: 0.5px; text-align: center">x</div></body></html>`,
    );
    const withInfo = generateCompatibilityScore(warnings);
    const withoutInfo = generateCompatibilityScore(warnings.filter((w) => w.severity !== "info"));
    for (const client of Object.keys(withInfo)) {
      expect(withInfo[client].score).toBe(withoutInfo[client].score);
    }
  });
});

// =============================================================================
// The second pass. Everything below closes a hole that mutation testing found:
// each test here kills at least one mutation of `value-caveats.ts` that the
// first pass let through.
// =============================================================================

const sheetClients = (decl: string): string[] => {
  const prop = decl.split(":")[0].trim().toLowerCase();
  return analyzeEmail(
    `<html><body><style>.a { ${decl} }</style><div class="a">x</div></body></html>`,
  )
    .filter((w) => w.property === prop && w.severity === "info")
    .map((w) => w.client)
    .sort();
};

describe("value-aware partial support: the three inherited properties", () => {
  // margin, position and overflow were gated in 0.10.0 and had no per-client
  // assertion here, which is why five mutations of their branches survived.
  const CANNOT_SCROLL = ["gmail-android", "outlook-android", "yahoo-mail-android"];

  it("overflow: a scrollable value fires only where the note says scrolling breaks", () => {
    expect(partialClients("overflow: auto")).toEqual(CANNOT_SCROLL.sort());
    expect(partialClients("overflow: scroll")).toEqual(CANNOT_SCROLL.sort());
    expect(partialClients("overflow: overlay")).toEqual(CANNOT_SCROLL.sort());
    expect(partialClients("overflow: clip")).toEqual([]);
  });

  it("overflow: the clients excluded from reachability really are unreachable", () => {
    // The reachability test can only catch under-reporting. This pins the
    // other half: for the clients whose only caveat is the
    // `overflow-block`/`overflow-inline` longhands, no shorthand value fires.
    for (const [client, level] of Object.entries(CSS_SUPPORT["overflow"])) {
      if (level !== "partial") continue;
      const notes = CSS_SUPPORT_NOTES["overflow"]?.[client];
      if (/cannot scroll/i.test((notes ?? []).join(" "))) continue;
      for (const v of ["auto", "scroll", "overlay", "hidden", "visible", "clip"]) {
        expect([client, v, caveatApplies("overflow", [v], notes)]).toEqual([client, v, false]);
      }
    }
  });

  it("position: a client with no note at all is reported, not guessed at", () => {
    // Superhuman is a manual override with no caniemail note. Which keyword it
    // drops is not knowable, and a broken position ruins a layout, so it is
    // reported for every positioning keyword, but not for `static`.
    expect(CSS_SUPPORT["position"]["superhuman"]).toBe("partial");
    expect((CSS_SUPPORT_NOTES["position"]?.["superhuman"] ?? []).join(" ")).toBe("");
    for (const v of ["relative", "absolute", "fixed", "sticky"]) {
      expect([v, partialClients(`position: ${v}`)]).toEqual([
        v,
        expect.arrayContaining(["superhuman"]),
      ]);
    }
    expect(partialClients("position: static")).toEqual([]);
  });

  it("position: a vendor-prefixed keyword is the same keyword", () => {
    expect(partialClients("position: -webkit-sticky")).toEqual(partialClients("position: sticky"));
    expect(partialClients("position: -webkit-sticky")).not.toEqual([]);
  });

  it("margin: a calc() subtraction is not a negative margin", () => {
    // The minus of `calc(100% - 10px)` is an operator. Requiring the sign to be
    // glued to its digits is the whole difference.
    expect(partialClients("margin: calc(100% - 10px)")).toEqual([]);
    expect(partialClients("margin: 0 calc(50% - 10px)")).toEqual([]);
    expect(partialClients("letter-spacing: calc(1px - 2px)")).toEqual([]);
    expect(partialClients("margin: -8px")).not.toEqual([]);
  });

  it("margin: reads its own note rather than assuming what it says", () => {
    const neg = ["Partial. Negative values are not supported."];
    const auto = ["Partial. The `auto` value is not supported."];
    expect(caveatApplies("margin", ["-8px"], neg)).toBe(true);
    expect(caveatApplies("margin", ["-8px"], auto)).toBe(false);
    expect(caveatApplies("margin", ["0 auto"], neg)).toBe(false);
    expect(caveatApplies("margin", ["0 auto"], auto)).toBe(true);
  });
});

describe("value-aware partial support: an unreadable note reports", () => {
  // The module's stated contract. Every branch's fallthrough is dead under
  // today's caniemail data, so nothing exercised it and three `return true`
  // clauses could be flipped without failing a test.
  const NONSENSE = ["Partial. Something nobody has written before."];
  const PROBES: Array<[string, string]> = [
    ["background", "#ffffff"],
    ["border-radius", "8px"],
    ["display", "block"],
    ["font-size", "14px"],
    ["font-weight", "500"],
    ["letter-spacing", "0.5px"],
    ["margin", "16px"],
    ["position", "relative"],
    ["text-align", "center"],
    ["transition", "opacity 0.3s"],
  ];

  it("holds for every value-gated property", () => {
    const quiet = PROBES.filter(([p, v]) => !caveatApplies(p, [v], NONSENSE)).map(([p]) => p);
    expect(quiet).toEqual([]);
  });

  it("covers every gated property except overflow, whose probe value is inert", () => {
    expect([...PROBES.map(([p]) => p), "overflow"].sort()).toEqual([...VALUE_CAVEAT_PROPS].sort());
    expect(caveatApplies("overflow", ["auto"], NONSENSE)).toBe(true);
  });

  it("yields to a value that means the property is not in play", () => {
    // The one exception, and it has to be the same in both places it applies.
    // `position: static` positions nothing and `overflow: hidden` scrolls
    // nothing, so no reading of any note reaches them. Reporting these on a
    // reworded note would be exactly the noise the gate exists to remove:
    // `overflow: hidden` appears in almost every email built on tables.
    expect(caveatApplies("position", ["static"], NONSENSE)).toBe(false);
    expect(caveatApplies("overflow", ["hidden"], NONSENSE)).toBe(false);
    expect(caveatApplies("overflow", ["clip"], NONSENSE)).toBe(false);
    // …and only for those values. Anything that engages the property is
    // reported, because an unreadable note about it might be about them.
    expect(caveatApplies("position", ["relative"], NONSENSE)).toBe(true);
    expect(caveatApplies("overflow", ["auto"], NONSENSE)).toBe(true);
    expect(caveatApplies("overflow", ["scroll"], NONSENSE)).toBe(true);
  });

  it("holds when an `only supports` note is reworded past the parser", () => {
    // Reword Outlook's display note and the allow-list comes out empty. That
    // must report everything, not silence everything.
    for (const note of ["Partial. Only supports the none value.", "Partial. Only supports e.g. none."]) {
      expect([note, caveatApplies("display", ["block"], [note])]).toEqual([note, true]);
      expect([note, caveatApplies("display", ["none"], [note])]).toEqual([note, true]);
    }
    // The current wording, and the same wording with a space after the colon.
    expect(caveatApplies("display", ["none"], ["Only supports `display: none`."])).toBe(false);
    expect(caveatApplies("display", ["block"], ["Only supports `display: none`."])).toBe(true);
  });
});

describe("value-aware partial support: reading the declaration", () => {
  it("strips `!important` before judging the value", () => {
    // `getStyleValue` does not strip it, so without this the gate compares
    // "none !important" against "none" and reports a false positive.
    for (const decl of [
      "display: none !important",
      "background: #ffffff !important",
      "text-align: center !important",
      "font-weight: 700 !important",
      "position: static !important",
      "overflow: hidden !important",
      "transition: opacity 0.3s ease !important",
    ]) {
      expect([decl, partialClients(decl)]).toEqual([
        decl,
        partialClients(decl.replace(" !important", "")),
      ]);
    }
    // …without swallowing the value itself.
    expect(partialClients("display: flex !important")).toEqual(
      sorted(OUTLOOK_WORD, ["gmail-android", "gmail-ios"]),
    );
  });

  it("strips comments wedged into an inline value", () => {
    expect(partialClients("position:/*safe*/relative")).toEqual(partialClients("position:relative"));
    expect(partialClients("text-align:/*x*/start")).toEqual(partialClients("text-align:start"));
    expect(partialClients("display:/*x*/none")).toEqual([]);
  });

  it("a custom property is neither a unit nor a negative", () => {
    // What stops these reporting is `hasUnit`'s digit anchor and
    // `hasNegative`'s boundary, drop either and all three fire.
    expect(partialClients("font-size: var(--rem-base)")).toEqual([]);
    expect(partialClients("margin: var(--gap-negative)")).toEqual([]);
    expect(partialClients("letter-spacing: var(--tracking-em)")).toEqual([]);
  });

  it("sees every declaration when a property is declared twice", () => {
    // `display:block;display:flex` is the progressive-enhancement idiom. Which
    // one applies is per client, so the caveat applies if either value hits it.
    expect(partialClients("display: block; display: flex")).toEqual(
      sorted(OUTLOOK_WORD, ["gmail-android", "gmail-ios"]),
    );
    expect(partialClients("background: #fff; background: url(a.png)")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("font-size: 14px; font-size: 1rem")).not.toEqual([]);
  });

  it("font-weight: a signed or exponent number is still a number", () => {
    expect(partialClients("font-weight: +350")).toEqual(partialClients("font-weight: 350"));
    expect(partialClients("font-weight: 3.5e2")).toEqual(partialClients("font-weight: 350"));
  });

  it("background: a malformed hex is not a colour", () => {
    // `parseColor` returns NaN channels rather than null for anything
    // `#`-prefixed, so the hex has to be validated before trusting it.
    expect(partialClients("background: #fff #000")).toEqual(OUTLOOK_WORD.sort());
    expect(partialClients("background: #ffff")).toEqual([]);
    expect(partialClients("background: #ggg")).toEqual(OUTLOOK_WORD.sort());
  });

  it("background: the `/ <size>` shorthand is Yahoo's other caveat", () => {
    expect(partialClients("background: url(a.png) / cover")).toEqual(
      sorted(OUTLOOK_WORD, YAHOO_AOL),
    );
    // A slash inside a data URI is not the size shorthand.
    expect(partialClients("background: #fff url(data:image/png;base64,AAAA)")).toEqual(
      OUTLOOK_WORD.sort(),
    );
  });
});

describe("value-aware partial support: both paths, and the public one", () => {
  it("gates a <style> block the same way it gates an inline style", () => {
    // The stylesheet path reaches the gate through csstree and the inline path
    // through the raw attribute; only `position` covered this, in one test.
    for (const decl of [
      "font-size: 14px",
      "font-size: 1rem",
      "display: none",
      "display: flex",
      "background: #ffffff",
      "background: url(a.png)",
      "border-radius: 8px",
      "border-radius: 10% 20% / 30% 40%",
      "text-align: center",
      "letter-spacing: -1px",
    ]) {
      expect([decl, sheetClients(decl)]).toEqual([decl, partialClients(decl)]);
    }
  });

  it("anchors the finding on the declaration that triggered it", () => {
    // One warning covers the property across the whole sheet, so its positions
    // have to be narrowed to the declarations the caveat is about. Underlining
    // `font-size: 14px` next to "rem values are not supported" is worse than
    // having no position at all.
    const mixed = `<!doctype html>\n<html><head><style>\n.a { font-size: 14px; }\n.b { font-size: 1rem; }\n</style></head><body></body></html>`;
    const w = analyzeEmail(mixed, undefined, { positions: true }).find(
      (x) => x.property === "font-size" && x.client === "outlook-windows",
    );
    expect(w?.severity).toBe("info");
    expect(w?.locs?.map((l) => l.line)).toEqual([4]);
    expect(w?.loc?.line).toBe(4);

    // Both declarations trigger: both are listed, in document order.
    const both = `<!doctype html>\n<html><head><style>\n.a { font-size: 2rem; }\n.b { font-size: 1rem; }\n</style></head><body></body></html>`;
    const w2 = analyzeEmail(both, undefined, { positions: true }).find(
      (x) => x.property === "font-size" && x.client === "outlook-windows",
    );
    expect(w2?.locs?.map((l) => l.line)).toEqual([3, 4]);

    // A client the caveat does not reach still reports nothing at all.
    expect(
      analyzeEmail(mixed, undefined, { positions: true }).find(
        (x) => x.property === "font-size" && x.client === "gmail-web",
      ),
    ).toBeUndefined();
  });

  it("auditEmail surfaces exactly the gated findings", () => {
    const html = `<html><body><div style="font-size: 14px; display: block; background: #ffffff">x</div></body></html>`;
    const info = auditEmail(html).compatibility.warnings.filter(
      (w) => w.severity === "info" && ["font-size", "display", "background"].includes(w.property),
    );
    expect(info.map((w) => `${w.property}/${w.client}`).sort()).toEqual([
      "display/outlook-windows",
      "display/outlook-windows-legacy",
    ]);
  });

  it("every value-gated property can silence somebody with an ordinary value", () => {
    // A property added to VALUE_CAVEAT_PROPS without a `triggers()` branch
    // falls to `default: return true` and gates nothing. This catches that.
    const BENIGN: Record<string, string> = {
      background: "#ffffff",
      "border-radius": "8px",
      display: "none",
      "font-size": "14px",
      "font-weight": "400",
      "letter-spacing": "normal",
      margin: "16px",
      overflow: "hidden",
      position: "static",
      "text-align": "center",
      transition: "opacity 0.3s ease",
    };
    expect(Object.keys(BENIGN).sort()).toEqual([...VALUE_CAVEAT_PROPS].sort());
    for (const [prop, value] of Object.entries(BENIGN)) {
      const silenced = Object.entries(CSS_SUPPORT[prop] ?? {})
        .filter(([, level]) => level === "partial")
        .filter(([client]) => !caveatApplies(prop, [value], CSS_SUPPORT_NOTES[prop]?.[client]));
      expect([prop, silenced.length > 0]).toEqual([prop, true]);
    }
  });
});
