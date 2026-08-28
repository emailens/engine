import { describe, test, expect } from "bun:test";
import { renderOutlookBranch, resolveMsoBranch, vmlToCss, arcsizeToRadius, transformForClient, transformForAllClients, createSession } from "../index";

const mso = (vml: string) => `<!--[if gte mso 9]>${vml}<![endif]-->`;

describe("resolveMsoBranch", () => {
  test("activates the Outlook-only branch", () => {
    const out = resolveMsoBranch(`<div>a</div>${mso("<p>outlook</p>")}`);
    expect(out).toContain("<p>outlook</p>");
    expect(out).not.toContain("<!--[if");
  });

  test("deletes the downlevel-revealed branch, which Outlook never sees", () => {
    const out = resolveMsoBranch(`<!--[if !mso]><!--><a>fallback</a><!--<![endif]-->`);
    expect(out).not.toContain("fallback");
  });

  test("leaves non-mso conditional comments alone", () => {
    const html = `<!--[if lt IE 9]><script src="x.js"></script><![endif]-->`;
    expect(resolveMsoBranch(html)).toBe(html);
  });
});

describe("arcsizeToRadius", () => {
  // Verified against Outlook Classic: 100% and 120% draw the identical corner,
  // because out-of-range values are clamped rather than rejected.
  test("is a fraction of half the shorter side", () => {
    expect(arcsizeToRadius("0%", 164, 48)).toBe(0);
    expect(arcsizeToRadius("50%", 164, 48)).toBe(12);
    expect(arcsizeToRadius("100%", 164, 48)).toBe(24);
  });

  test("clamps out of range, so 120% equals 100%", () => {
    expect(arcsizeToRadius("120%", 164, 48)).toBe(arcsizeToRadius("100%", 164, 48));
  });

  test("accepts a bare fraction as well as a percentage", () => {
    expect(arcsizeToRadius("0.5", 164, 48)).toBe(arcsizeToRadius("50%", 164, 48));
  });
});

describe("vmlToCss: roundrect", () => {
  test("becomes a sized box with the right radius and fill", () => {
    const out = vmlToCss(`<v:roundrect style="width:200px;height:40px;" arcsize="50%" stroke="f" fillcolor="#336699"><center>Go</center></v:roundrect>`);
    expect(out).toContain("width:200px");
    expect(out).toContain("height:40px");
    expect(out).toContain("border-radius:10px");
    expect(out).toContain("background:#336699");
    expect(out).toContain("border:none");
    expect(out).toContain("Go");
  });

  test("keeps the label and drops the scaffolding around it", () => {
    const out = vmlToCss(`<v:roundrect style="width:200px;height:40px;"><w:anchorlock/><center>Click</center></v:roundrect>`);
    expect(out).toContain("Click");
    expect(out).not.toContain("anchorlock");
  });

  test("uses the VML default of 20% when no arcsize is given", () => {
    const out = vmlToCss(`<v:roundrect style="width:200px;height:40px;"><center>x</center></v:roundrect>`);
    expect(out).toContain("border-radius:4px");
  });
});

describe("vmlToCss: rect", () => {
  test("a framed fill becomes a covering background image", () => {
    const out = vmlToCss(`<v:rect style="width:600px;height:300px;"><v:fill type="frame" src="hero.png" /><v:textbox inset="0,0,0,0"><p>hi</p></v:textbox></v:rect>`);
    expect(out).toContain("background-image:url('hero.png')");
    expect(out).toContain("background-size:cover");
    expect(out).toContain("height:300px");
    expect(out).toContain("<p>hi</p>");
  });

  test("a gradient fill becomes a linear-gradient", () => {
    const out = vmlToCss(`<v:rect style="width:600px;height:300px;"><v:fill type="gradient" angle="135" color="#000" color2="#fff" /></v:rect>`);
    expect(out).toContain("linear-gradient(135deg,#000,#fff)");
  });

  test("a solid fill becomes a background colour", () => {
    const out = vmlToCss(`<v:rect style="width:600px;height:70px;"><v:fill type="solid" color="#c8d8e8" /></v:rect>`);
    expect(out).toContain("background-color:#c8d8e8");
  });

  test("an invalid height is left unset rather than invented", () => {
    // The broken source says height:px. Guessing a value here would draw a box
    // the email never asked for and hide the fault the linter reports.
    const out = vmlToCss(`<v:rect style="width:600px;height:px;"><v:fill type="solid" color="#eee" /></v:rect>`);
    expect(out).toContain("width:600px");
    expect(out).not.toContain("height:");
  });

  test("leaves no VML property elements behind", () => {
    const out = vmlToCss(`<v:rect style="width:10px;height:10px;"><v:fill type="solid" color="#eee" /><v:textbox><p>x</p></v:textbox></v:rect>`);
    expect(out).not.toMatch(/<v:/i);
  });
});

describe("renderOutlookBranch", () => {
  test("returns the input untouched when there is nothing Outlook-only", () => {
    const html = `<html><body><p>plain</p></body></html>`;
    expect(renderOutlookBranch(html)).toBe(html);
  });

  test("resolves and translates in one step", () => {
    const html = `${mso(`<v:roundrect style="width:200px;height:40px;" arcsize="50%" fillcolor="#336699" stroke="f"><center>Go</center></v:roundrect>`)}<!--[if !mso]><!--><a>fallback</a><!--<![endif]-->`;
    const out = renderOutlookBranch(html);
    expect(out).toContain('data-vml="roundrect"');
    expect(out).toContain("border-radius:10px");
    expect(out).not.toContain("fallback");
    expect(out).not.toMatch(/<v:/i);
  });
});

describe("transformForClient: only the Word engine gets the Outlook branch", () => {
  const html = `<html><body>
    ${mso(`<v:roundrect style="width:200px;height:40px;" arcsize="50%" fillcolor="#336699" stroke="f"><center>OUTLOOK</center></v:roundrect>`)}
    <!--[if !mso]><!--><a id="fb">FALLBACK</a><!--<![endif]-->
  </body></html>`;

  test("outlook-windows-legacy renders the branch Outlook actually sees", () => {
    const out = transformForClient(html, "outlook-windows-legacy").html;
    expect(out).toContain("OUTLOOK");
    expect(out).toContain('data-vml="roundrect"');
    expect(out).not.toContain("FALLBACK");
  });

  test("every other client keeps the fallback and never sees the VML", () => {
    for (const client of ["gmail-web", "apple-mail-macos", "outlook-web", "outlook-macos"]) {
      const out = transformForClient(html, client).html;
      expect([client, out.includes("FALLBACK")]).toEqual([client, true]);
      expect([client, /data-vml/.test(out)]).toEqual([client, false]);
    }
  });

  test("an email with no conditional comments is unaffected for Outlook", () => {
    const plain = `<html><body><p>plain</p></body></html>`;
    expect(transformForClient(plain, "outlook-windows-legacy").html).toContain("plain");
  });
});

// transformForAllClients is the entry point the app and the landing-page
// generator actually call, and it does not route through transformForClient:
// it downlevels once and maps applyTransform over every client. Wiring only
// the singular function left the whole product on the old behaviour while the
// tests passed, so both paths are asserted here and in createSession.
describe("transformForAllClients and createSession take the same branch", () => {
  const html = `<html><body>
    ${mso(`<v:roundrect style="width:200px;height:40px;" arcsize="50%" fillcolor="#336699" stroke="f"><center>OUTLOOK</center></v:roundrect>`)}
    <!--[if !mso]><!--><a id="fb">FALLBACK</a><!--<![endif]-->
  </body></html>`;

  test("transformForAllClients translates for the Word engine only", () => {
    const all = transformForAllClients(html);
    const word = all.find((t) => t.clientId === "outlook-windows-legacy")!;
    expect(word.html).toContain('data-vml="roundrect"');
    expect(word.html).not.toContain("FALLBACK");

    for (const t of all.filter((t) => t.clientId !== "outlook-windows-legacy")) {
      expect([t.clientId, /data-vml/.test(t.html)]).toEqual([t.clientId, false]);
      expect([t.clientId, t.html.includes("FALLBACK")]).toEqual([t.clientId, true]);
    }
  });

  test("createSession().transformForAllClients agrees with the standalone function", () => {
    const viaSession = createSession(html).transformForAllClients()
      .find((t) => t.clientId === "outlook-windows-legacy")!;
    const viaDirect = transformForAllClients(html)
      .find((t) => t.clientId === "outlook-windows-legacy")!;
    expect(viaSession.html).toBe(viaDirect.html);
    expect(viaSession.html).toContain('data-vml="roundrect"');
  });

  test("an email with no conditional comments is byte-identical across both paths", () => {
    const plain = `<html><body><p>plain</p></body></html>`;
    const all = transformForAllClients(plain);
    const word = all.find((t) => t.clientId === "outlook-windows-legacy")!;
    expect(word.html).toBe(transformForClient(plain, "outlook-windows-legacy").html);
  });
});
