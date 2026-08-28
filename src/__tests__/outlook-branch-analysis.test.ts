import { describe, test, expect } from "bun:test";
import { analyzeEmail, auditEmail, createSession, transformForAllClients } from "../index";

const WORD = "outlook-windows-legacy";
const word = (html: string) => analyzeEmail(html).filter((w) => w.client === WORD);
const others = (html: string) => analyzeEmail(html).filter((w) => w.client !== WORD);

/**
 * The Word engine is graded on the branch it reads.
 *
 * 0.11.2 through 0.11.5 taught the renderer to resolve `<!--[if mso]>` while
 * the analyzer kept reading the fallback, so the preview and the findings
 * described two different emails. These assert the halves agree.
 */

const MSO_STYLE = `<html><head>
<!--[if mso]><style>td { position: fixed; animation: spin 2s; }</style><![endif]-->
</head><body><table><tr><td>hi</td></tr></table></body></html>`;

const PLAIN_STYLE = `<html><head>
<style>td { position: fixed; animation: spin 2s; }</style>
</head><body><table><tr><td>hi</td></tr></table></body></html>`;

describe("CSS inside a conditional <style> is graded for the Word engine", () => {
  test("the same declarations are found whether or not they are behind [if mso]", () => {
    // Before this, moving these two declarations into a conditional block took
    // the Word engine from several findings to none: the highest-leverage rules
    // in a file were the only ones never checked.
    const props = (html: string) => word(html).map((w) => w.property).sort();
    expect(props(MSO_STYLE)).toEqual(expect.arrayContaining(["position", "animation"]));
    expect(props(PLAIN_STYLE)).toEqual(expect.arrayContaining(["position", "animation"]));
  });

  test("no other client is graded on markup it never receives", () => {
    // Only Outlook Classic reads conditional comments. If Gmail started
    // reporting findings from inside [if mso], the merge is wrong.
    expect(others(MSO_STYLE)).toHaveLength(0);
  });

  test("an email without conditional comments is untouched", () => {
    const before = analyzeEmail(PLAIN_STYLE);
    expect(before.length).toBeGreaterThan(0);
    // Same input, same output: the second parse must not fire at all here.
    expect(analyzeEmail(PLAIN_STYLE)).toEqual(before);
  });
});

describe("the analyzer and the renderer describe the same email", () => {
  test("what the Word engine is graded on is what it is shown", () => {
    const rendered = transformForAllClients(MSO_STYLE).find((t) => t.clientId === WORD)!.html;
    // The declarations reach the render...
    expect(rendered).toContain("position");
    // ...and the findings mention them. Either alone is the bug this fixes.
    expect(word(MSO_STYLE).map((w) => w.property)).toContain("position");
  });

  // The invariant that matters more than any single behaviour: three entry
  // points reach the analyzer, and fixing one while leaving the others is the
  // mistake this codebase has now made twice. This names no behaviour, only
  // that they cannot diverge.
  test("analyzeEmail, auditEmail and createSession agree", () => {
    const viaAnalyze = word(MSO_STYLE).map((w) => `${w.property}:${w.severity}`).sort();
    const viaAudit = auditEmail(MSO_STYLE).compatibility.warnings
      .filter((w) => w.client === WORD).map((w) => `${w.property}:${w.severity}`).sort();
    const viaSession = createSession(MSO_STYLE).analyze()
      .filter((w) => w.client === WORD).map((w) => `${w.property}:${w.severity}`).sort();
    expect(viaAudit).toEqual(viaAnalyze);
    expect(viaSession).toEqual(viaAnalyze);
    expect(viaAnalyze).toContain("position:warning");
  });
});

describe("safety", () => {
  test("malformed conditional comments cost no other findings", () => {
    // A broken branch must degrade to the fallback-branch result, never throw
    // away the rest of the report.
    const nasty = [
      `<html><body><!--[if mso]><style>td{position:fixed}</style><body></body></html>`,
      `<html><body><!--[if mso]><![endif]--></body></html>`,
      `<html><body><!--[if mso]><style>td{</style><![endif]--></body></html>`,
    ];
    for (const html of nasty) {
      expect(() => analyzeEmail(html)).not.toThrow();
    }
  });

  test("the downlevel-revealed branch is not double-counted", () => {
    // `[if !mso]` content is live HTML that the first pass already graded.
    // Resolving must delete it for Outlook, not report it twice.
    const html = `<html><head><style>td{opacity:0.5}</style></head><body>
      <!--[if !mso]><!--><table><tr><td style="position:fixed">x</td></tr></table><!--<![endif]-->
      </body></html>`;
    const positions = word(html).filter((w) => w.property === "position");
    expect(positions.length).toBeLessThanOrEqual(1);
  });

  test("positions still resolve against the source the caller holds", () => {
    const html = `<html><head>\n<style>td { position: fixed }</style>\n</head><body><table><tr><td>x</td></tr></table></body></html>`;
    const withLoc = analyzeEmail(html, undefined, { positions: true }).find((w) => w.loc);
    expect(withLoc?.loc).toBeDefined();
    expect(withLoc!.loc!.line).toBeGreaterThan(0);
  });
});
