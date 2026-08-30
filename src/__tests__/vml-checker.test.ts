import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkVml } from "../index";

const rules = (html: string) => checkVml(html).issues.map((i) => i.rule);

/** Wrap VML in the Outlook-only conditional comment it always ships inside. */
const mso = (vml: string) => `<!--[if gte mso 9]>${vml}<![endif]-->`;

const FIXTURE = readFileSync(
  join(import.meta.dir, "fixtures", "nested-vml-hero.html"),
  "utf8",
);

describe("checkVml: reaches inside conditional comments", () => {
  test("finds VML that the DOM analyzers cannot see", () => {
    // The whole point: this markup is a comment node to every HTML parser.
    expect(checkVml(mso(`<v:rect style="width:640px; height:400px;"></v:rect>`)).hasVml).toBe(true);
  });

  test("reports nothing for an email with no VML at all", () => {
    const report = checkVml(`<html><body><a href="https://example.com/">Hi</a></body></html>`);
    expect(report.hasVml).toBe(false);
    expect(report.issues).toEqual([]);
  });

  test("ignores the downlevel-revealed branch, which is live HTML not VML", () => {
    // `[if !mso]><!-->` opens the *non*-Outlook branch; its content is already
    // covered by the DOM analyzers and must not be scanned as VML.
    expect(rules(`<!--[if !mso]><!--><div>plain html</div><!--<![endif]-->`)).toEqual([]);
  });

  test("ignores non-mso conditional comments", () => {
    expect(rules(`<!--[if lt IE 9]><script src="x.js"></script><![endif]-->`)).toEqual([]);
  });

  test("returns empty for blank input", () => {
    expect(checkVml("").issues).toEqual([]);
    expect(checkVml("   ").hasVml).toBe(false);
  });
});

describe("checkVml: nested shapes (the Outlook breaker)", () => {
  test("flags a roundrect nested inside a rect's textbox", () => {
    const html =
      mso(`<v:rect style="width:640px; height:400px;"><v:fill type="frame" src="a.png" /><v:textbox inset="0,0,0,0">`) +
      `<a href="https://example.com/">Button</a>` +
      mso(`<v:roundrect style="width:164px; height:48px;" arcsize="50%"><center>`) +
      mso(`</center></v:roundrect>`) +
      mso(`</v:textbox></v:rect>`);
    expect(rules(html)).toContain("vml-nested-shape");
  });

  test("names both the inner and the containing shape", () => {
    const html =
      mso(`<v:rect style="width:640px; height:400px;"><v:textbox>`) +
      mso(`<v:roundrect style="width:100px; height:40px;"></v:roundrect>`) +
      mso(`</v:textbox></v:rect>`);
    const issue = checkVml(html).issues.find((i) => i.rule === "vml-nested-shape");
    expect(issue?.message).toContain("v:roundrect");
    expect(issue?.message).toContain("v:rect");
    expect(issue?.severity).toBe("error");
  });

  test("allows sibling shapes that never overlap", () => {
    const html =
      mso(`<v:roundrect style="width:100px; height:40px;" arcsize="50%"></v:roundrect>`) +
      mso(`<v:roundrect style="width:100px; height:40px;" arcsize="50%"></v:roundrect>`);
    expect(rules(html)).toEqual([]);
  });

  test("allows a shape inside v:group, the one container VML defines", () => {
    const html = mso(
      `<v:group style="width:640px; height:400px;"><v:rect style="width:10px; height:10px;"></v:rect></v:group>`,
    );
    expect(rules(html)).not.toContain("vml-nested-shape");
  });

  test("does not treat v:fill or v:textbox as a nesting parent", () => {
    const html = mso(
      `<v:rect style="width:640px; height:400px;"><v:fill type="frame" src="a.png" /><v:textbox inset="0,0,0,0"></v:textbox></v:rect>`,
    );
    expect(rules(html)).toEqual([]);
  });
});

describe("checkVml: dimensions", () => {
  test("flags a height with no number, the shape Outlook cannot size", () => {
    const issue = checkVml(mso(`<v:rect style="width:640px; height:px;"></v:rect>`)).issues[0];
    expect(issue.rule).toBe("vml-invalid-dimension");
    expect(issue.severity).toBe("error");
    expect(issue.message).toContain("height");
  });

  test("flags an empty width", () => {
    expect(rules(mso(`<v:rect style="width:; height:400px;"></v:rect>`))).toContain("vml-invalid-dimension");
  });

  test("accepts well-formed dimensions", () => {
    expect(rules(mso(`<v:rect style="width:640px; height:400px;"></v:rect>`))).toEqual([]);
  });

  test("accepts unitless and percentage dimensions", () => {
    expect(rules(mso(`<v:roundrect style="width:200; height:40;"></v:roundrect>`))).toEqual([]);
    expect(rules(mso(`<v:rect style="width:100%; height:400px;"></v:rect>`))).toEqual([]);
  });
});

describe("checkVml: arcsize range", () => {
  test("flags arcsize above 100%", () => {
    const issue = checkVml(mso(`<v:roundrect style="width:164px; height:48px;" arcsize="120%"></v:roundrect>`)).issues[0];
    expect(issue.rule).toBe("vml-arcsize-range");
    expect(issue.severity).toBe("warning");
  });

  test("accepts the documented range and the pill value", () => {
    for (const v of ["0%", "20%", "50%", "100%", "0.2", "0.5"]) {
      expect(rules(mso(`<v:roundrect style="width:100px; height:40px;" arcsize="${v}"></v:roundrect>`))).toEqual([]);
    }
  });

  test("ignores a roundrect with no arcsize (it defaults to 20%)", () => {
    expect(rules(mso(`<v:roundrect style="width:100px; height:40px;"></v:roundrect>`))).toEqual([]);
  });
});

describe("checkVml: label text with nothing to lay it out", () => {
  // Verified in Outlook Classic: A3 (bare text child) renders a blank pill,
  // while A2 (<center>) and A4 (<v:textbox>) both render their label.
  test("flags a bare text child, which Outlook draws as a blank shape", () => {
    const issue = checkVml(mso(`<v:roundrect style="width:300px;height:44px;" arcsize="30%">Click here</v:roundrect>`)).issues[0];
    expect(issue.rule).toBe("vml-unrendered-text");
    expect(issue.severity).toBe("error");
  });

  test("accepts a label wrapped in <center>, the bulletproof-button pattern", () => {
    expect(rules(mso(`<v:roundrect style="width:300px;height:44px;"><center>Click here</center></v:roundrect>`))).toEqual([]);
  });

  test("accepts a label wrapped in <v:textbox>", () => {
    expect(rules(mso(`<v:roundrect style="width:300px;height:44px;"><v:textbox><center>Click here</center></v:textbox></v:roundrect>`))).toEqual([]);
  });

  test("accepts an anchorlock alongside a wrapped label", () => {
    expect(rules(mso(`<v:roundrect style="width:300px;height:44px;"><w:anchorlock/><center>Go</center></v:roundrect>`))).toEqual([]);
  });

  test("ignores a shape with no text at all", () => {
    expect(rules(mso(`<v:rect style="width:596px;height:70px;"><v:fill type="solid" color="#c8d8e8" /></v:rect>`))).toEqual([]);
  });

  test("ignores whitespace and non-breaking spaces", () => {
    expect(rules(mso(`<v:roundrect style="width:300px;height:44px;">   &nbsp; </v:roundrect>`))).toEqual([]);
  });
});

describe("checkVml: tag balance across conditional blocks", () => {
  test("flags a shape that is opened and never closed", () => {
    expect(rules(mso(`<v:rect style="width:640px; height:400px;"><v:textbox>`))).toContain("vml-unbalanced-tag");
  });

  test("flags a closing tag with no opener", () => {
    expect(rules(mso(`</v:rect>`))).toContain("vml-unbalanced-tag");
  });

  test("accepts a shape opened in one block and closed in another", () => {
    const html =
      mso(`<v:rect style="width:640px; height:400px;"><v:textbox>`) +
      `<p>content</p>` +
      mso(`</v:textbox></v:rect>`);
    expect(rules(html)).toEqual([]);
  });

  test("treats a self-closing shape as balanced", () => {
    expect(rules(mso(`<v:rect style="width:640px; height:400px;" />`))).toEqual([]);
  });
});

describe("checkVml: source locations", () => {
  test("points at the offending tag in the original HTML", () => {
    const html = `<html>\n<body>\n${mso(`<v:roundrect style="width:1px; height:1px;" arcsize="120%"></v:roundrect>`)}\n</body>\n</html>`;
    const issue = checkVml(html, { positions: true }).issues[0];
    expect(issue.loc).toBeDefined();
    // The offset must land exactly on the tag it blames, not on the comment.
    expect(html.slice(issue.loc!.offset, issue.loc!.offset + 12)).toBe("<v:roundrect");
    expect(issue.loc!.line).toBe(3);
  });

  test("omits locations unless positions are requested", () => {
    const issue = checkVml(mso(`<v:roundrect style="width:1px;height:1px;" arcsize="120%"></v:roundrect>`)).issues[0];
    expect(issue.loc).toBeUndefined();
  });
});

describe("checkVml: the reported real-world hero", () => {
  const report = checkVml(FIXTURE, { positions: true });

  test("catches all three defects in the fixture", () => {
    const found = report.issues.map((i) => i.rule);
    expect(found).toContain("vml-nested-shape");
    expect(found).toContain("vml-invalid-dimension");
    expect(found).toContain("vml-arcsize-range");
  });

  test("does not flag the standalone control button as nested", () => {
    // The fixture has two roundrects: one inside the rect, one on its own.
    // Only the nested one is a structural error.
    const nested = report.issues.filter((i) => i.rule === "vml-nested-shape");
    expect(nested).toHaveLength(1);
  });

  test("every issue points at real VML in the source", () => {
    for (const issue of report.issues) {
      expect(issue.loc).toBeDefined();
      expect(FIXTURE.slice(issue.loc!.offset, issue.loc!.offset + 3)).toBe("<v:");
    }
  });

  test("the nested-shape finding reports verified Outlook behaviour", () => {
    // Confirmed against Outlook Classic (Word engine): the containing shape
    // does not render, and every VML shape further down stops drawing its
    // text. The wording must carry both, because the second is the part
    // authors do not expect and the part that explains damage far from the
    // shape they edited.
    const issue = report.issues.find((i) => i.rule === "vml-nested-shape");
    expect(issue?.detail).toMatch(/does not render/i);
    expect(issue?.detail).toMatch(/stops drawing its text/i);
    expect(issue?.severity).toBe("error");
  });

  test("the finding does not claim the table structure terminates", () => {
    // This shipped as fact for three days and went out to the person who
    // reported the bug. It had no methodology behind it, and
    // `T1c-blast-radius.html`, the fixture built to measure exactly this,
    // contradicts it: the block after the nested shape rendered in place
    // inside the same table with its background and borders intact, and only
    // the VML labels were missing.
    //
    // Asserted as an absence, which is unusual and deliberate. The claim is
    // plausible, it reads well, and it sat next to a sentence describing real
    // probe methodology that lent it unearned authority. Someone will be
    // tempted to put it back.
    const issue = report.issues.find((i) => i.rule === "vml-nested-shape");
    expect(issue?.detail).not.toMatch(/terminates early/i);
    expect(issue?.detail).not.toMatch(/outside the email frame/i);
    expect(issue?.detail).not.toMatch(/three things/i);
  });

  test("the dimension finding says content is clipped, not merely collapsed", () => {
    // Verified: the shape still draws, at a size Outlook picks, clipping the
    // content inside it. "Collapses" understated it and missed the silent part.
    const issue = report.issues.find((i) => i.rule === "vml-invalid-dimension");
    expect(issue?.detail).toMatch(/clipped/i);
  });

  test("the arcsize finding records that Outlook clamps rather than breaks", () => {
    // Verified: arcsize 120% draws the identical corner to 100%. Nothing breaks
    // today, which is exactly why this stays a warning.
    const issue = report.issues.find((i) => i.rule === "vml-arcsize-range");
    expect(issue?.detail).toMatch(/clamped/i);
    expect(issue?.severity).toBe("warning");
  });
});

describe("checkVml: ghost tables (G-03)", () => {
  const ghosts = (html: string) =>
    checkVml(html).issues.filter((i) => i.rule === "ghost-table-unbalanced");

  // Outlook ignores max-width, so a layout is constrained for it with a plain
  // table opened in one conditional block and closed in another. Balanced
  // across the pair, and invisible to a DOM parser, which sees comment nodes.
  const OPEN = mso(`<table width="600"><tr><td>`);
  const CLOSE = mso(`</td></tr></table>`);

  test("accepts the correctly paired wrapper, which is the recommended pattern", () => {
    expect(ghosts(`${OPEN}<p>content</p>${CLOSE}`)).toEqual([]);
  });

  test("flags a wrapper opened and never closed", () => {
    const issues = ghosts(`${OPEN}<p>content</p>`);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe("error");
    expect(issues.map((i) => i.message).join(" ")).toContain("<table>");
  });

  test("flags a closing tag with no opener", () => {
    expect(ghosts(CLOSE).length).toBeGreaterThan(0);
  });

  test("counts across separate conditional blocks, not within one", () => {
    // The halves are always in different blocks with ordinary markup between,
    // so a checker that balanced per block would flag every correct wrapper.
    expect(ghosts(`${OPEN}<table><tr><td>real html</td></tr></table>${CLOSE}`)).toEqual([]);
  });

  test("ignores tables outside the Outlook branch entirely", () => {
    // Unbalanced ordinary HTML is the DOM parser's problem, not this rule's.
    expect(ghosts(`<table><tr><td>never closed`)).toEqual([]);
  });

  test("says nothing about an email with no conditional comments", () => {
    expect(ghosts(`<html><body><table><tr><td>x</td></tr></table></body></html>`)).toEqual([]);
  });

  test("reports even when the email contains no VML at all", () => {
    // Ghost tables are plain HTML. Gating this behind hasVml would miss every
    // email that uses the wrapper without any shapes.
    const report = checkVml(`${OPEN}<p>x</p>`);
    expect(report.hasVml).toBe(false);
    expect(report.issues.some((i) => i.rule === "ghost-table-unbalanced")).toBe(true);
  });
});
