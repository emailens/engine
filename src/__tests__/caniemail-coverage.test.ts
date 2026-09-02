import { describe, expect, it } from "bun:test";
import { analyzeEmail, ordinaryComments } from "../analyze";
import { loadHtml } from "../parse-html";
import { transformForAllClients, transformForClient } from "../transform";
import { analyzeImages } from "../image-analyzer";
import { EMAIL_CLIENTS } from "../clients";
import {
  AT_RULE_FEATURES,
  CSS_SUPPORT,
  HTML_ATTRIBUTE_FEATURES,
  HTML_MISC_FEATURES,
  IMAGE_SUPPORT,
  IMAGE_FORMATS,
  SUPPORT_CLIENTS,
  FEATURE_LAST_TESTED,
  HTML_ELEMENT_FEATURES,
  CSS_SUPPORT_NOTES,
  CSS_PROPERTY_FEATURES,
  COMPOUND_VALUE_FEATURES,
  SELECTOR_FEATURES,
  CSS_FUNCTION_FEATURES,
  GRACEFUL_FEATURES,
} from "../rules/css-support";
import { mergeSupport } from "../../scripts/sync-caniemail";

// =============================================================================
// The parts of caniemail the sync used to throw away: media features, HTML
// attributes, document-level features, image formats, and the platforms of a
// client caniemail tests more than once.
// =============================================================================

const analyze = (body: string, head = "") =>
  analyzeEmail(`<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`);

const forFeature = (html: string, feature: string) =>
  analyzeEmail(html).filter((w) => w.property === feature);

describe("media features are graded on their own row", () => {
  it("`@media` holds general media-query support, not one feature's", () => {
    // Six caniemail features share the `@media` at-rule. When they collided on
    // one key the first in API order won, and `@media` silently reported
    // device-pixel-ratio's answers: Gmail came out "unsupported", which turned
    // every responsive email into a warning it did not deserve.
    expect(CSS_SUPPORT["@media"]["gmail-web"]).toBe("partial");
    expect(CSS_SUPPORT["@media device-pixel-ratio"]["gmail-web"]).toBe("unsupported");
    expect(AT_RULE_FEATURES).toContain("@media prefers-color-scheme");
  });

  it("a plain media query is not graded as a dark-mode query", () => {
    const css = "<style>@media (max-width: 600px) { .a { width: 100% } }</style>";
    expect(forFeature(`<html><body>${css}</body></html>`, "@media").length).toBeGreaterThan(0);
    expect(forFeature(`<html><body>${css}</body></html>`, "@media prefers-color-scheme")).toEqual(
      [],
    );
  });

  it("each media feature is found by its prelude", () => {
    const cases: Array<[string, string]> = [
      ["@media (prefers-color-scheme: dark)", "@media prefers-color-scheme"],
      ["@media (prefers-reduced-motion: reduce)", "@media prefers-reduced-motion"],
      ["@media (hover: hover)", "@media hover"],
      ["@media (orientation: landscape)", "@media orientation"],
      ["@media (-webkit-min-device-pixel-ratio: 2)", "@media device-pixel-ratio"],
    ];
    for (const [prelude, feature] of cases) {
      const css = `<style>${prelude} { .a { color: red } }</style>`;
      expect([feature, forFeature(`<html><body>${css}</body></html>`, feature).length > 0]).toEqual([
        feature,
        true,
      ]);
    }
  });

  it("the `:hover` pseudo-class is not the `hover` media feature", () => {
    const css = "<style>a:hover { color: red }</style>";
    expect(forFeature(`<html><body>${css}</body></html>`, "@media hover")).toEqual([]);
  });
});

describe("HTML attributes are graded", () => {
  it("finds an attribute the matrix has an answer for", () => {
    // The legacy `background` attribute: two clients drop it outright and
    // three more are partial, which is why the VML pattern exists.
    const w = analyze(`<table><tr><td background="bg.png">x</td></tr></table>`).filter(
      (x) => x.property === "[background]",
    );
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].message).toContain("background attribute");
  });

  it("says nothing about an attribute the email does not use", () => {
    expect(analyze(`<p>x</p>`).filter((x) => x.property === "[background]")).toEqual([]);
  });

  it("says nothing about an attribute every client supports", () => {
    // `valign` is supported everywhere caniemail tested. A detector that fired
    // on presence rather than on support would light up every table cell.
    expect(analyze(`<table><tr><td valign="top">x</td></tr></table>`)
      .filter((x) => x.property === "[valign]")).toEqual([]);
  });

  it("every attribute feature is a selector cheerio accepts", () => {
    // The key doubles as the detector, so a key that is not a valid selector
    // would throw on any email rather than fail quietly.
    for (const feature of HTML_ATTRIBUTE_FEATURES) {
      expect(() => analyze(`<div ${feature.slice(1, -1)}="x">y</div>`)).not.toThrow();
    }
  });

  it("an attribute a client merely ignores is info, and says so", () => {
    // `target="_blank"` is forced by most webmail regardless: reporting that
    // as a warning asks the author to fix something that is not broken.
    const w = analyze(`<a href="https://example.com" target="_blank">x</a>`).filter(
      (x) => x.property === "[target]",
    );
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((x) => x.severity === "info")).toBe(true);
    expect(w[0].message).toContain("ignores");
  });

  it("an attribute whose absence changes the render stays a warning", () => {
    // Unsupported `hidden` means content the author hid becomes visible.
    const w = analyze(`<div hidden>secret</div>`).filter((x) => x.property === "[hidden]");
    expect(w.some((x) => x.severity === "warning")).toBe(true);
  });
});

describe("document-level features are graded", () => {
  it("detects the doctype only when there is one", () => {
    expect(forFeature(`<!DOCTYPE html><html><body>x</body></html>`, "doctype").length)
      .toBeGreaterThan(0);
    expect(forFeature(`<html><body>x</body></html>`, "doctype")).toEqual([]);
  });

  it("an Outlook conditional is not an HTML comment finding", () => {
    // It is a comment to the parser and a control structure to Word. Grading it
    // as "this client strips comments" would be a finding about nothing.
    const conditional = `<html><body><!--[if mso]><i>x</i><![endif]--></body></html>`;
    expect(forFeature(conditional, "html-comments")).toEqual([]);
  });

  it("separates a local anchor from a mailto and from an ordinary link", () => {
    expect(analyze(`<a href="#top">t</a>`).some((w) => w.property === "anchor-links")).toBe(true);
    expect(analyze(`<a href="#top">t</a>`).some((w) => w.property === "mailto-links")).toBe(false);
    expect(analyze(`<a href="mailto:a@b.c">m</a>`).some((w) => w.property === "mailto-links")).toBe(
      true,
    );
    expect(analyze(`<a href="https://example.com">x</a>`).some((w) => w.property === "anchor-links"))
      .toBe(false);
  });

  it("every misc feature has a row and a detector that runs", () => {
    for (const feature of HTML_MISC_FEATURES) {
      expect([feature, Boolean(CSS_SUPPORT[feature])]).toEqual([feature, true]);
    }
  });
});

describe("image formats are graded per client", () => {
  it("lists exactly the formats it has rows for", () => {
    expect([...IMAGE_FORMATS].sort()).toEqual(Object.keys(IMAGE_SUPPORT).sort());
  });

  it("carries a row for every format caniemail tests", () => {
    for (const format of ["webp", "avif", "svg", "base64", "mp4", "heif", "tiff", "apng"]) {
      expect([format, Boolean(IMAGE_SUPPORT[format])]).toEqual([format, true]);
    }
  });

  it("names the clients that cannot render the format", () => {
    const issue = analyzeImages(
      `<html><body><img src="hero.avif" alt="" width="600" height="200"></body></html>`,
    ).issues.find((i) => i.rule === "avif-format");
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/of \d+ clients/);
  });

  it("says nothing about a format that renders everywhere", () => {
    const issues = analyzeImages(
      `<html><body><img src="hero.png" alt="" width="600" height="200"></body></html>`,
    ).issues.filter((i) => i.rule.endsWith("-format"));
    expect(issues).toEqual([]);
  });

  it("reads the format past a query string, and from a data URI", () => {
    const q = analyzeImages(
      `<html><body><img src="a.webp?v=2" alt="" width="10" height="10"></body></html>`,
    ).issues;
    expect(q.some((i) => i.rule === "webp-format")).toBe(true);
    const data = analyzeImages(
      `<html><body><img src="data:image/png;base64,AAAA" alt="" width="10" height="10"></body></html>`,
    ).issues;
    expect(data.some((i) => i.rule === "base64-format")).toBe(true);
  });
});

describe("a client tested on several platforms is graded on its worst", () => {
  it("takes the worse of two real answers and prefers either to unknown", () => {
    expect(mergeSupport("supported", "unsupported")).toBe("unsupported");
    expect(mergeSupport("unsupported", "supported")).toBe("unsupported");
    expect(mergeSupport("supported", "partial")).toBe("partial");
    expect(mergeSupport("unknown", "supported")).toBe("supported");
    expect(mergeSupport("supported", "unknown")).toBe("supported");
    expect(mergeSupport(undefined, "partial")).toBe("partial");
    expect(mergeSupport("unknown", "unknown")).toBe("unknown");
  });

  it("every client in the list has a row in the matrix", () => {
    for (const client of EMAIL_CLIENTS) {
      expect([client.id, CSS_SUPPORT["margin"]?.[client.id] !== undefined]).toEqual([
        client.id,
        true,
      ]);
    }
  });
});

describe("caniemail's own test dates ship with the data", () => {
  it("dates every feature that upstream dates, and only in ISO form", () => {
    // `color` and `font-family` are ours, not caniemail's, so they have no
    // test date. Everything else must, or `check:freshness` under-reports.
    const undated = [...Object.keys(CSS_SUPPORT), ...Object.keys(IMAGE_SUPPORT)]
      .filter((k) => !FEATURE_LAST_TESTED[k])
      .sort();
    expect(undated).toEqual(["color", "font-family"]);
  });

  it("keeps the dates inside a range a human would have typed", () => {
    // A malformed date reaches `daysSince` as NaN, and `NaN > STALE` is false,
    // so an unreadable date reads as fresh. This is what catches that.
    const today = new Date().toISOString().slice(0, 10);
    for (const [key, date] of Object.entries(FEATURE_LAST_TESTED)) {
      expect([key, /^\d{4}-\d{2}-\d{2}$/.test(date)]).toEqual([key, true]);
      expect([key, date >= "2015-01-01" && date <= today]).toEqual([key, true]);
    }
  });
});

// ============================================================================
// Invariants. Every one of these holds today and none of them is enforced by
// a type, so each is one rename away from silently switching a detector off.
// A dead detector does not throw; it just makes the report shorter.
// ============================================================================

/** The five media features, and the prelude that should find each. */
const MEDIA_FEATURES = [
  "@media prefers-color-scheme",
  "@media prefers-reduced-motion",
  "@media hover",
  "@media orientation",
  "@media device-pixel-ratio",
];

/**
 * One fixture per document-level feature: the markup that should make its
 * detector fire. Keeping these here means "has a detector" is proved by the
 * detector running, not by the feature having a row.
 */
const MISC_FIXTURES: Record<string, string> = {
  "amp4email": `<html amp4email><body>x</body></html>`,
  "anchor-links": `<html><body><a href="#top">t</a></body></html>`,
  "doctype": `<!DOCTYPE html><html><body>x</body></html>`,
  "html-comments": `<html><body><!-- c --></body></html>`,
  "html5-semantics": `<html><body><section>x</section></body></html>`,
  "image-maps": `<html><body><map name="m"><area shape="rect"></map></body></html>`,
  "mailto-links": `<html><body><a href="mailto:a@b.c">m</a></body></html>`,
  "meta-color-scheme": `<html><head><meta name="color-scheme" content="light dark"></head><body>x</body></html>`,
};

const ALL_FEATURE_ARRAYS: Array<readonly string[]> = [
  HTML_ELEMENT_FEATURES,
  HTML_ATTRIBUTE_FEATURES,
  HTML_MISC_FEATURES,
  AT_RULE_FEATURES,
  COMPOUND_VALUE_FEATURES,
  SELECTOR_FEATURES,
  CSS_FUNCTION_FEATURES,
  CSS_PROPERTY_FEATURES,
];

describe("the feature arrays partition the matrix", () => {
  // Exhaustiveness and non-overlap are enforced by the compiler: the generated
  // matrix is written `satisfies Record<FeatureKey, …>`, which requires every
  // member of the union and rejects a key the union does not name. What the
  // type cannot say is that each array holds the *kind* of key its name
  // promises, which is what the rest of this block is for.
  it("still agrees with the matrix at runtime", () => {
    const all = ALL_FEATURE_ARRAYS.flat();
    expect([...new Set(all)].sort()).toEqual(Object.keys(CSS_SUPPORT).sort());
  });

  it("sorts selectors and compound values into the right lanes", () => {
    // These were one array until the classifier was made total, and 37 of its
    // 40 members were selectors wearing the name "compound value".
    for (const key of SELECTOR_FEATURES) {
      expect([key, key.startsWith(":")]).toEqual([key, true]);
    }
    for (const key of COMPOUND_VALUE_FEATURES) {
      expect([key, /^[a-z-]+:[a-z-]+$/.test(key)]).toEqual([key, true]);
    }
    expect(SELECTOR_FEATURES).toContain(":hover");
    expect(SELECTOR_FEATURES).toContain("::after");
    expect(COMPOUND_VALUE_FEATURES).toContain("display:flex");
  });

  it("keeps image formats out of the CSS matrix", () => {
    const shared = Object.keys(IMAGE_SUPPORT).filter((k) => k in CSS_SUPPORT);
    expect(shared).toEqual([]);
  });

  it("CSS_PROPERTY_FEATURES holds only names a declaration can carry", () => {
    // This array is what the inline-style and <style> scans test against. A
    // selector or compound value leaking in would be compared against parsed
    // property names forever and never match; a property leaking *out* would
    // stop being checked at all.
    for (const key of CSS_PROPERTY_FEATURES) {
      expect([key, /[:<>[\]@]/.test(key)]).toEqual([key, false]);
    }
    expect(CSS_PROPERTY_FEATURES).toContain("margin");
    expect(CSS_PROPERTY_FEATURES).not.toContain(":hover");
    expect(CSS_PROPERTY_FEATURES).not.toContain("display:flex");
    expect(CSS_PROPERTY_FEATURES).not.toContain("linear-gradient");
  });

  it("every feature the engine can report has a detector that can find it", () => {
    // The three DOM lanes. Attributes are total by construction (the key is
    // the selector); the other two are hand-maintained, which is where a new
    // upstream slug goes quiet.
    for (const feature of HTML_ATTRIBUTE_FEATURES) {
      expect([feature, /^\[[a-z-]+\]$/.test(feature)]).toEqual([feature, true]);
    }
    for (const feature of HTML_MISC_FEATURES) {
      const fixture = MISC_FIXTURES[feature];
      expect([feature, typeof fixture]).toEqual([feature, "string"]);
      // And the detector actually finds it, unless the matrix says there is
      // nothing to report (html-comments today).
      const actionable = Object.values(CSS_SUPPORT[feature]).some(
        (l) => l === "unsupported" || l === "partial",
      );
      if (!actionable) continue;
      const fired = analyzeEmail(fixture).some((w) => w.property === feature);
      expect([feature, fired]).toEqual([feature, true]);
    }
    for (const feature of HTML_ELEMENT_FEATURES) {
      // Either an explicit selector or the bare tag; nothing may fall through.
      expect([feature, /^<[a-z][a-z0-9]*(\s|>)/.test(feature)]).toEqual([feature, true]);
    }
  });

  it("every GRACEFUL_FEATURES entry is a real key", () => {
    // A typo here is silently inert: the feature keeps warning, with the
    // "does not support" wording, and nothing fails.
    for (const feature of GRACEFUL_FEATURES) {
      expect([feature, feature in CSS_SUPPORT]).toEqual([feature, true]);
    }
  });

  it("every media detector names a row that exists", () => {
    for (const feature of MEDIA_FEATURES) {
      expect([feature, feature in CSS_SUPPORT]).toEqual([feature, true]);
      expect(AT_RULE_FEATURES).toContain(feature);
    }
  });
});

describe("the client roster", () => {
  // Written out, not derived: adding or losing a client changes every report
  // and every score, and should fail here rather than ripple through the
  // expected arrays of unrelated tests.
  const EXPECTED = [
    "aol", "apple-mail-ios", "apple-mail-macos", "fastmail", "gmail-android",
    "gmail-ios", "gmail-web", "hey-mail", "outlook-android", "outlook-ios",
    "outlook-macos", "outlook-web", "outlook-windows", "outlook-windows-legacy",
    "protonmail", "samsung-mail", "superhuman", "thunderbird", "yahoo-mail",
    "yahoo-mail-android", "yahoo-mail-ios",
  ];

  it("is the roster the reports are written for", () => {
    expect(EMAIL_CLIENTS.map((c) => c.id).sort()).toEqual(EXPECTED);
  });

  it("is the same roster the matrix answers for", () => {
    // `EmailClient.id` is typed `ClientId`, so a client without a column no
    // longer compiles. This is the other direction: a column with no client.
    expect([...SUPPORT_CLIENTS].sort()).toEqual(EMAIL_CLIENTS.map((c) => c.id).sort());
  });

  it("has no duplicate id, and a printable name for every client", () => {
    // `name` is interpolated straight into user-facing prose by both the
    // analyzer and the image report.
    const ids = EMAIL_CLIENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of EMAIL_CLIENTS) expect([c.id, c.name.length > 0]).toEqual([c.id, true]);
  });

  it("answers for every client in every row of both matrices", () => {
    const ids = EMAIL_CLIENTS.map((c) => c.id);
    for (const table of [CSS_SUPPORT, IMAGE_SUPPORT]) {
      for (const [key, row] of Object.entries(table)) {
        const missing = ids.filter((id) => row[id] === undefined);
        expect([key, missing]).toEqual([key, []]);
      }
    }
  });

  it("gives every client a transform config, derived or hand-written", () => {
    // A client with no config used to vanish from the preview entirely.
    const got = transformForAllClients("<html><body><p>x</p></body></html>").map((r) => r.clientId);
    expect(got.sort()).toEqual(EMAIL_CLIENTS.map((c) => c.id).sort());
  });
});

describe("a merged client keeps the caveat belonging to its answer", () => {
  // Regression pin. Proton Mail, AOL and Thunderbird are one client each here
  // and several platforms upstream. Merging worst-wins while unioning their
  // notes put one platform's note on another platform's answer, and let a
  // better platform delete the winner's note outright. The second one silently
  // removed findings, because the value-aware gate reads those notes.
  it("keeps the caveat that a partial rating is about", () => {
    // Proton Mail is partial on `overflow` across all its platforms, but only
    // the Android note explains why, and that note is the one the gate reads.
    expect(CSS_SUPPORT["overflow"]["protonmail"]).toBe("partial");
    expect((CSS_SUPPORT_NOTES["overflow"]?.["protonmail"] ?? []).join(" ")).toMatch(
      /cannot scroll/i,
    );
  });

  it("so the gate still reports the value the caveat names", () => {
    // The behavioural half: without its note, Proton fell out of this list.
    const clients = analyzeEmail(
      `<html><body><div style="overflow: auto">x</div></body></html>`,
    )
      .filter((w) => w.property === "overflow")
      .map((w) => w.client);
    expect(clients).toContain("protonmail");
    expect(clients).toContain("aol");
  });

  it("leaves no note describing a level the cell does not hold", () => {
    // Swept over the whole matrix: caniemail's own prose sometimes opens with
    // a different word than the level, so this only checks the direction the
    // merge can get wrong, a "Supported." note on a cell that is not.
    const wrong: string[] = [];
    for (const [key, row] of Object.entries(CSS_SUPPORT)) {
      for (const [client, level] of Object.entries(row)) {
        if (level !== "unsupported") continue;
        const notes = CSS_SUPPORT_NOTES[key]?.[client] ?? [];
        if (notes.some((n) => /^supported\./i.test(n.trim()))) wrong.push(`${key}/${client}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("media features: each detector fires for its own prelude and no other", () => {
  const mediaFound = (prelude: string) =>
    analyzeEmail(`<html><body><style>${prelude} { .a { color: red } }</style></body></html>`)
      .filter((w) => w.property.startsWith("@media"))
      .map((w) => w.property)
      .filter((p, i, a) => a.indexOf(p) === i)
      .sort();

  it("grades a plain breakpoint query as `@media` and nothing else", () => {
    expect(mediaFound("@media (max-width: 600px)")).toEqual(["@media"]);
    // "device" appears in the prelude but device-pixel-ratio must not fire.
    expect(mediaFound("@media only screen and (max-device-width: 480px)")).toEqual(["@media"]);
  });

  it("grades each media feature on its own row", () => {
    expect(mediaFound("@media (prefers-color-scheme: dark)")).toEqual([
      "@media", "@media prefers-color-scheme",
    ]);
    expect(mediaFound("@media (prefers-reduced-motion: reduce)")).toEqual([
      "@media", "@media prefers-reduced-motion",
    ]);
    expect(mediaFound("@media (orientation: landscape)")).toEqual(["@media", "@media orientation"]);
  });

  it("reads `resolution`, the standards spelling of device-pixel-ratio", () => {
    expect(mediaFound("@media (min-resolution: 2dppx)")).toEqual([
      "@media", "@media device-pixel-ratio",
    ]);
    expect(mediaFound("@media (-webkit-min-device-pixel-ratio: 2)")).toEqual([
      "@media", "@media device-pixel-ratio",
    ]);
  });

  it("counts both spellings of the hover feature, and neither `:hover`", () => {
    expect(mediaFound("@media (hover: hover)")).toEqual(["@media", "@media hover"]);
    expect(mediaFound("@media (hover: none)")).toEqual(["@media", "@media hover"]);
    expect(mediaFound("@media (any-hover: hover)")).toEqual(["@media", "@media hover"]);
    // The pseudo-class inside a media block is the trap: it puts the word
    // "hover" one character away from the prelude the regex reads.
    expect(mediaFound("@media (max-width: 600px)")).toEqual(["@media"]);
    const nested = analyzeEmail(
      `<html><body><style>@media (max-width:600px){ a:hover { color: red } }</style></body></html>`,
    ).filter((w) => w.property === "@media hover");
    expect(nested).toEqual([]);
  });

  it("grades a prelude that asks two questions on both", () => {
    expect(mediaFound("@media (max-width: 600px) and (orientation: landscape)")).toEqual([
      "@media", "@media orientation",
    ]);
  });
});

describe("HTML comments", () => {
  const comments = (html: string) => ordinaryComments(loadHtml(html).root()[0]).length;

  it("counts a real comment, wherever it sits", () => {
    expect(comments(`<html><body><!-- hi --></body></html>`)).toBe(1);
    expect(comments(`<html><head><!-- c --></head><body>x</body></html>`)).toBe(1);
    expect(comments(`<html><body><table><tr><td><!-- deep --></td></tr></table></body></html>`))
      .toBe(1);
  });

  it("does not count an Outlook conditional, in any of its forms", () => {
    // A conditional is a comment to the parser and a control structure to
    // Word. Counting one would be a finding about nothing.
    expect(comments(`<html><body><!--[if mso]><i>x</i><![endif]--></body></html>`)).toBe(0);
    expect(comments(`<html><body><!--[if gte mso 9]><v:rect/><![endif]--></body></html>`)).toBe(0);
    expect(comments(`<html><body><!--[if !mso]><!--><p>x</p><!--<![endif]--></body></html>`)).toBe(0);
    expect(comments(`<html><body><!--   [if mso]>x<![endif]--></body></html>`)).toBe(0);
  });

  it("still counts a comment that merely mentions a condition", () => {
    expect(comments(`<html><body><!-- if mso we do X --></body></html>`)).toBe(1);
    expect(comments(`<html><body><!--[if mso]><i>x</i><![endif]--><!-- real --></body></html>`))
      .toBe(1);
  });

  it("reports nothing today, because caniemail says every client keeps comments", () => {
    // The guard on the detector above: it is unexercised by `analyzeEmail`
    // precisely because no client is rated unsupported or partial. If this
    // ever fails, the detector has become live and wants its own coverage.
    const levels = new Set(Object.values(CSS_SUPPORT["html-comments"]));
    expect([...levels].sort()).toEqual(["supported", "unknown"]);
  });
});

describe("a correct email does not drown in findings", () => {
  // Reading 60 more features means reporting more, and the danger of that is a
  // report nobody scrolls to the bottom of. This pins the shape: an email that
  // follows every rule the engine itself gives should raise nothing to fix.
  const CLEAN = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body><table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center">
<tr><td valign="top" style="font-family: Arial, sans-serif; font-size: 14px; color: #333333;">
<p style="margin: 0;">Hello</p>
<a href="https://example.com" style="color: #0066cc;">Read more</a>
<img src="hero.png" width="600" height="200" alt="Hero" style="display: block;">
</td></tr></table></body></html>`;

  it("raises nothing to fix", () => {
    // An email that follows every rule the engine itself gives should have
    // nothing at warning severity or above. `[width]` and `[height]` used to
    // appear here, for HEY Mail: true, but true of almost every email ever
    // written, and unclearable because the attribute is what the rule sees.
    // They report at info now, which is where a constant belongs.
    const actionable = analyzeEmail(CLEAN)
      .filter((x) => x.severity !== "info")
      .map((x) => `${x.property}/${x.client}`)
      .sort();
    expect(actionable).toEqual([]);
  });

  it("names nothing the author did not write", () => {
    // The volume guard. Every finding has to point at markup that is actually
    // in the fixture; a detector firing on an absent feature shows up here.
    const props = [...new Set(analyzeEmail(CLEAN).map((w) => w.property))].sort();
    expect(props).toEqual([
      "[align]", "[height]", "[lang]", "[role]", "[width]", "display", "doctype",
    ]);
  });

  it("says nothing at all about an email with no markup to grade", () => {
    expect(analyzeEmail(`<html><body><p>hi</p></body></html>`)).toEqual([]);
  });
});

