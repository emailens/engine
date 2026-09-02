import { describe, expect, it } from "bun:test";
import { compileMjml } from "../compile/mjml";
import { compileMaizzle } from "../compile/maizzle";
import { compileReactEmail } from "../compile/react-email";
import { analyzeEmail } from "../analyze";
import { checkStyleSurvival } from "../style-survival";
import { HTML_ATTRIBUTE_FEATURES, HTML_MISC_FEATURES } from "../rules/css-support";
import type { Framework } from "../types";

// =============================================================================
// The translation layer.
//
// The engine grades compiled HTML, because that is what a client receives, and
// phrases its advice in source terms, because that is what the author can edit.
// The gap between those two is where a framework user gets told to delete an
// attribute their compiler wrote.
//
// Each source below is deliberately plain: no attribute, doctype or document
// feature appears in it. So anything the analyzer finds from that family was
// put there by the compiler, and advice about it has to be framework-aware or
// it is advice about a file the author does not have.
// =============================================================================

const SOURCES: Array<{
  framework: Framework;
  name: string;
  compile: () => Promise<string>;
}> = [
  {
    framework: "mjml",
    name: "MJML",
    compile: () =>
      compileMjml(
        `<mjml><mj-body><mj-section><mj-column>` +
          `<mj-text>Hello</mj-text><mj-image src="hero.png" width="600px" />` +
          `</mj-column></mj-section></mj-body></mjml>`,
      ),
  },
  {
    framework: "maizzle",
    name: "Maizzle",
    compile: () =>
      compileMaizzle(
        `<!DOCTYPE html><html><head><style>.btn{padding:12px}</style></head>` +
          `<body><table><tr><td class="btn">Hello</td></tr></table></body></html>`,
      ),
  },
  {
    framework: "jsx",
    name: "React Email",
    compile: () =>
      compileReactEmail(
        `import { Html, Body, Container, Text } from "@react-email/components";\n` +
          `export default function Email() {\n` +
          `  return (<Html><Body><Container><Text>Hello</Text></Container></Body></Html>);\n` +
          `}\n`,
        // No isolated-vm in the test environment, same as the sandbox tests.
        { sandbox: "vm" },
      ),
  },
];

/** The families whose findings can only have come from the compiler here. */
const COMPILER_WRITTEN = new Set<string>([
  ...HTML_ATTRIBUTE_FEATURES,
  ...HTML_MISC_FEATURES,
  "<body>",
]);

describe("advice about compiler-written markup names the framework", () => {
  for (const { framework, name, compile } of SOURCES) {
    it(`${name}: no finding tells the author to edit output they never wrote`, async () => {
      const html = await compile();
      const generic = analyzeEmail(html, framework)
        .filter((w) => COMPILER_WRITTEN.has(w.property) && w.fixIsGenericFallback)
        .map((w) => w.property);
      // Deduplicated: one missing entry is one missing entry, however many
      // clients it fires for.
      expect([name, [...new Set(generic)].sort()]).toEqual([name, []]);
    });
  }
});

describe("the compiled output is what gets graded", () => {
  it("MJML really does emit the attributes this guards", async () => {
    // If MJML ever stops emitting them the test above passes vacuously, so
    // assert the premise rather than trusting it.
    const html = await compileMjml(
      `<mjml><mj-body><mj-section><mj-column><mj-text>Hi</mj-text>` +
        `</mj-column></mj-section></mj-body></mjml>`,
    );
    const found = new Set(analyzeEmail(html, "mjml").map((w) => w.property));
    expect([...found].filter((p) => COMPILER_WRITTEN.has(p)).length).toBeGreaterThan(0);
  });

  it("Maizzle normalises a colour our Gmail rule would otherwise flag", async () => {
    // A source written with the modern syntax compiles to the comma form, so
    // the finding correctly disappears. Pinned because it is the compiler doing
    // it, not us, and a Maizzle upgrade could change it silently.
    const html = await compileMaizzle(
      `<!DOCTYPE html><html><head><style>.y{color:rgb(0 0 0)}</style></head>` +
        `<body><table class="y"><tr><td>Hi</td></tr></table></body></html>`,
    );
    expect(html).toContain("rgb(0, 0, 0)");
    expect(checkStyleSurvival(html).issues.map((i) => i.rule)).toEqual([]);
  });
});

describe("style-survival speaks the framework's language", () => {
  const brokenHtml =
    `<!DOCTYPE html><html><head><style>@media screen{div{color:#fff}}` +
    `.foo{background:rgb(255 0 0)}</style></head><body><p>x</p></body></html>`;

  it("says where to fix it in the source, not in the output", () => {
    for (const framework of ["mjml", "maizzle", "jsx"] as Framework[]) {
      const issues = checkStyleSurvival(brokenHtml, { framework });
      expect([framework, issues.issues.length > 0]).toEqual([framework, true]);
      for (const issue of issues.issues) {
        expect([framework, issue.rule, typeof issue.frameworkNote]).toEqual([
          framework,
          issue.rule,
          "string",
        ]);
      }
    }
  });

  it("says nothing framework-specific when there is no framework", () => {
    for (const issue of checkStyleSurvival(brokenHtml).issues) {
      expect(issue.frameworkNote).toBeUndefined();
    }
  });
});
