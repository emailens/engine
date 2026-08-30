import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  transformForClient,
  transformForAllClients,
  createSession,
  checkVml,
  EMAIL_CLIENTS,
} from "../index";

/**
 * End-to-end tests for the Outlook branch, written after two releases shipped
 * broken behind a green suite.
 *
 * 0.11.2 wired `transformForClient` and left `transformForAllClients` — the
 * function the web app actually calls — on the old path, so the feature was
 * inert in the product. 0.11.3 fixed that and every translated button still
 * rendered square, because translation ran before the strip pass and handed the
 * stripper its own output.
 *
 * Neither was a missing unit test. Both were tests that asserted on the
 * function under change rather than on the bytes a client finally receives, so
 * everything here works on the final `.html` of the real pipeline, and every
 * assertion runs against all three entry points rather than a chosen one.
 */

const FIX = join(import.meta.dir, "fixtures");
const BROKEN = readFileSync(join(FIX, "outlook-branch-broken.html"), "utf8");
const CLEAN = readFileSync(join(FIX, "outlook-branch-clean.html"), "utf8");

const WORD = "outlook-windows-legacy";

/** Every way a caller can reach a transform. A new one must be added here. */
const ENTRY_POINTS: Array<[string, (html: string, client: string) => string]> = [
  ["transformForClient", (h, c) => transformForClient(h, c).html],
  ["transformForAllClients", (h, c) => transformForAllClients(h).find((t) => t.clientId === c)!.html],
  ["createSession", (h, c) => createSession(h).transformForAllClients().find((t) => t.clientId === c)!.html],
];

const style = (html: string, kind: "rect" | "roundrect"): string | null => {
  const m = html.match(new RegExp(`data-vml="${kind}"[^>]*style="([^"]*)"`));
  return m ? m[1] : null;
};

describe("every entry point agrees", () => {
  // The invariant that would have caught 0.11.2 on its own, for any future
  // change: it does not name a behaviour, it says the paths cannot diverge.
  test("all three produce byte-identical output, for every client", () => {
    for (const client of EMAIL_CLIENTS.map((c) => c.id)) {
      const outputs = ENTRY_POINTS.map(([name, fn]) => [name, fn(BROKEN, client)] as const);
      const [, first] = outputs[0];
      for (const [name, out] of outputs.slice(1)) {
        expect([client, name, out === first]).toEqual([client, name, true]);
      }
    }
  });

  // Blank input is excluded deliberately: the session short-circuits it to an
  // inert stub. That divergence is pinned in its own test below.
  test("they agree on a clean email too", () => {
    for (const client of [WORD, "gmail-web", "apple-mail-macos"]) {
      const outputs = ENTRY_POINTS.map(([, fn]) => fn(CLEAN, client));
      expect(new Set(outputs).size).toBe(1);
    }
  });
});

describe("the Word engine receives the Outlook branch, fully rendered", () => {
  for (const [name, fn] of ENTRY_POINTS) {
    describe(name, () => {
      test("the nested hero is not drawn at all, the way Outlook does not draw it", () => {
        const out = fn(BROKEN, WORD);
        // This used to assert the container kept `width:600px` with its height
        // left unset, which described a box no Word engine draws. Outlook does
        // not render a shape holding another shape: the fill and geometry go
        // and the inner shape is left stranded. Confirmed in T1a and T1c.
        expect(out).toContain('data-vml-outlook="container-dropped"');
        expect(style(out, "rect")).toBeNull();
      });

      test("the button keeps the CSS that describes what Outlook draws", () => {
        // This is the 0.11.3 bug: border-radius and inline-flex are exactly
        // what the Word strip set removes from author CSS, and exactly what a
        // translated shape must keep.
        const btn = style(fn(BROKEN, WORD), "roundrect");
        expect(btn).not.toBeNull();
        expect(btn).toContain("border-radius:25px"); // 120% clamps to 100%: min(220,50)/2
        expect(btn).toContain("display:inline-flex");
        expect(btn).toContain("background:#B39A5F");
      });

      test("the clean email needs no shape at all", () => {
        const out = fn(CLEAN, WORD);
        expect(style(out, "rect")).toBeNull();       // flat band renders via bgcolor
        expect(style(out, "roundrect")).not.toBeNull(); // the button is still VML
      });

      test("no raw VML and no conditional comment survives to the client", () => {
        for (const src of [BROKEN, CLEAN]) {
          const out = fn(src, WORD);
          expect(out).not.toMatch(/<v:/i);
          expect(out).not.toMatch(/<w:/i);
          expect(out).not.toContain("<!--[if");
          expect(out).not.toContain("<![endif]");
        }
      });

      test("the fallback branch is gone, since Outlook never renders it", () => {
        expect(fn(BROKEN, WORD)).not.toMatch(/<a[^>]*>\s*Browse the templates\s*<\/a>/);
      });
    });
  }
});

describe("no other client is affected", () => {
  const others = EMAIL_CLIENTS.map((c) => c.id).filter((id) => id !== WORD);

  test("none of the other 20 clients sees translated VML", () => {
    for (const client of others) {
      for (const [name, fn] of ENTRY_POINTS) {
        const out = fn(BROKEN, client);
        expect([client, name, /data-vml/.test(out)]).toEqual([client, name, false]);
      }
    }
  });

  test("they all keep the HTML fallback", () => {
    for (const client of others) {
      const out = transformForAllClients(BROKEN).find((t) => t.clientId === client)!.html;
      expect([client, /Browse the templates<\/a>/.test(out)]).toEqual([client, true]);
    }
  });

  test("Outlook Web, New Outlook and Outlook for Mac are not Word engines", () => {
    // The obvious mistake is to key on the string "outlook". None of these
    // read conditional comments, so all three keep the fallback.
    for (const client of ["outlook-web", "outlook-windows", "outlook-macos", "outlook-ios", "outlook-android"]) {
      const out = transformForAllClients(BROKEN).find((t) => t.clientId === client)!.html;
      expect([client, /data-vml/.test(out)]).toEqual([client, false]);
      expect([client, /Browse the templates<\/a>/.test(out)]).toEqual([client, true]);
    }
  });
});

describe("the linter and the renderer describe the same email", () => {
  // The point of the whole exercise: before this, the linter reported a nested
  // shape while the preview rendered the email looking perfect.
  test("a finding in the linter has a visible consequence in the render", () => {
    const findings = checkVml(BROKEN).issues.map((i) => i.rule);
    expect(findings).toContain("vml-nested-shape");
    const out = transformForAllClients(BROKEN).find((t) => t.clientId === WORD)!.html;
    // The consequence is now the failure itself rather than an absent height.
    // A finding that says the region is destroyed beside a render that draws
    // it intact is the contradiction this whole file exists to prevent.
    expect(out).toContain('data-vml-outlook="container-dropped"');
  });

  test("a clean linter result renders without a collapsed shape", () => {
    expect(checkVml(CLEAN).issues).toEqual([]);
    expect(style(transformForAllClients(CLEAN).find((t) => t.clientId === WORD)!.html, "rect")).toBeNull();
  });
});

describe("safety: nothing here may throw or corrupt an ordinary email", () => {
  test("every shipped fixture survives all 21 clients, with no VML leaking", () => {
    for (const file of readdirSync(FIX).filter((f) => f.endsWith(".html"))) {
      const html = readFileSync(join(FIX, file), "utf8");
      // One fan-out per fixture, not one per client: the earlier version called
      // transformForAllClients inside a loop over clients and took 9s.
      let all: ReturnType<typeof transformForAllClients> = [];
      expect(() => { all = transformForAllClients(html); }).not.toThrow();
      expect([file, all.length]).toEqual([file, EMAIL_CLIENTS.length]);
      const word = all.find((t) => t.clientId === WORD)!;
      expect([file, /<v:/i.test(word.html)]).toEqual([file, false]);
      expect([file, word.html.includes("<!--[if")]).toEqual([file, false]);
      // And the singular path agrees on the client that does the work.
      expect([file, transformForClient(html, WORD).html === word.html]).toEqual([file, true]);
    }
  });

  test("an email with no conditional comments is untouched by this feature", () => {
    const plain = `<html><body><table><tr><td style="border-radius:8px">hi</td></tr></table></body></html>`;
    for (const [, fn] of ENTRY_POINTS) {
      expect(fn(plain, WORD)).toBe(transformForClient(plain, WORD).html);
    }
  });

  test("malformed VML does not throw", () => {
    const nasty = [
      `<!--[if mso]><v:rect><![endif]-->`,                                   // never closed
      `<!--[if mso]></v:rect><![endif]-->`,                                  // never opened
      `<!--[if mso]><v:roundrect style="width:;height:;"></v:roundrect><![endif]-->`,
      `<!--[if mso]><v:rect style="width:600px;height:px;"><v:fill/></v:rect><![endif]-->`,
      `<!--[if mso]><v:roundrect arcsize="not-a-number"></v:roundrect><![endif]-->`,
      `<!--[if mso]><v:rect style='width:1px;height:1px;'><v:textbox>unclosed<![endif]-->`,
    ];
    for (const frag of nasty) {
      for (const [name, fn] of ENTRY_POINTS) {
        expect(() => fn(`<html><body>${frag}</body></html>`, WORD)).not.toThrow();
        expect([frag.slice(0, 28), name]).toEqual([frag.slice(0, 28), name]);
      }
    }
  });

  test("empty and whitespace input never throw", () => {
    for (const src of ["", "   "]) {
      expect(() => transformForClient(src, WORD)).not.toThrow();
      expect(() => transformForAllClients(src)).not.toThrow();
      expect(() => createSession(src).transformForAllClients()).not.toThrow();
    }
  });

  test("PRE-EXISTING: the session and the standalone function disagree on empty input", () => {
    // Not introduced by the Outlook branch work, and caught by the
    // entry-points-agree invariant above. createSession returns an inert stub
    // for blank input whose transformForAllClients yields nothing, while the
    // standalone function yields one empty result per client. A caller
    // iterating the session's result gets zero rows where the other gives 21.
    // Pinned here rather than silently changed, since callers may rely on it.
    expect(createSession("").transformForAllClients()).toEqual([]);
    expect(transformForAllClients("")).toHaveLength(EMAIL_CLIENTS.length);
  });

  test("the visible copy is preserved through translation", () => {
    // Translation rewrites shapes, not content. If a headline disappears the
    // rewrite has eaten something it should not have.
    const out = transformForAllClients(BROKEN).find((t) => t.clientId === WORD)!.html;
    for (const phrase of ["Thirty templates", "Philippe", "email QA for developers"]) {
      expect([phrase, out.includes(phrase)]).toEqual([phrase, true]);
    }
  });

  test("a VML label after a nested shape is the one thing that does go", () => {
    // "Browse the templates" was in the list above until the renderer learned
    // to emulate the failure. It is a `<center>` label inside a shape, and a
    // shape at or after a nested one ships as a blank coloured block in
    // Outlook Classic. Losing it is the emulation working, not the rewrite
    // eating content, and the distinction is worth a test of its own so the
    // next person does not "fix" it by putting the label back.
    const out = transformForAllClients(BROKEN).find((t) => t.clientId === WORD)!.html;
    expect(out).not.toContain("Browse the templates");
    expect(out).toContain('data-vml-outlook="label-dropped"');
    // Every other client still gets it, which is why nobody sees this coming.
    const gmail = transformForAllClients(BROKEN).find((t) => t.clientId === "gmail-web")!.html;
    expect(gmail).toContain("Browse the templates");
  });
});
