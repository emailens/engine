import { describe, test, expect } from "bun:test";
import { compileMaizzle, CompileError } from "../compile/index";

// Maizzle's first call initialises PostCSS + Tailwind CSS, which can take
// several seconds on a cold start. Each compilation test uses a 30s timeout.
const MAIZZLE_TIMEOUT = 30_000;

// ============================================================================
// Basic compilation tests
// ============================================================================

describe("compileMaizzle", () => {
  test(
    "compiles plain HTML and preserves content and inline styles",
    async () => {
      const source = `
        <html>
          <head></head>
          <body>
            <table width="600" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding: 20px; font-family: Arial, sans-serif;">
                  <p>Welcome to our newsletter!</p>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;
      const html = await compileMaizzle(source);
      expect(html).toContain("Welcome to our newsletter!");
      expect(html).toContain("padding: 20px");
    },
    MAIZZLE_TIMEOUT,
  );

  test(
    "passes Tailwind utility classes through when no content config is present",
    async () => {
      const source = `
        <html>
          <body>
            <p class="text-red-500">Hello World</p>
          </body>
        </html>
      `;
      const html = await compileMaizzle(source);
      expect(html).toContain("Hello World");
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    },
    MAIZZLE_TIMEOUT,
  );

  test(
    "normalizes 3-digit hex in HTML bgcolor/color attributes to 6-digit (Outlook)",
    async () => {
      const source = `
        <html>
          <body>
            <table>
              <tr>
                <td bgcolor="#fff">
                  <font color="#000">Text</font>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;
      const html = await compileMaizzle(source);
      expect(html).toContain("Text");
      expect(html).toContain("#ffffff");
      expect(html).toContain("#000000");
      expect(html).not.toContain('bgcolor="#fff"');
    },
    MAIZZLE_TIMEOUT,
  );

  test(
    "returns a non-empty string for minimal HTML",
    async () => {
      const source = `<html><body><p>Simple</p></body></html>`;
      const html = await compileMaizzle(source);
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain("Simple");
    },
    MAIZZLE_TIMEOUT,
  );
});

// ============================================================================
// Validation tests
// ============================================================================

describe("compileMaizzle validation", () => {
  test("rejects empty source", async () => {
    try {
      await compileMaizzle("");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).format).toBe("maizzle");
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("rejects whitespace-only source", async () => {
    try {
      await compileMaizzle("   \n\t  ");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("rejects source exceeding the 512KB size limit", async () => {
    const source = "x".repeat(513_000);
    try {
      await compileMaizzle(source);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
      expect((err as CompileError).message).toContain("512");
    }
  });

  test("CompileError exposes correct format and phase properties", async () => {
    try {
      await compileMaizzle("");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect(err).toBeInstanceOf(Error);
      expect((err as CompileError).name).toBe("CompileError");
      expect((err as CompileError).format).toBe("maizzle");
    }
  });
});

// ============================================================================
// Security: PostHTML file-access directives must be blocked
// ============================================================================

describe("compileMaizzle security: blocked PostHTML directives", () => {
  async function expectBlocked(source: string, directiveName: string) {
    try {
      await compileMaizzle(source);
      throw new Error(`Expected CompileError for <${directiveName}> but compilation succeeded`);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
      expect((err as CompileError).message).toContain(directiveName);
    }
  }

  test("blocks <extends> directive (server file read vector)", async () => {
    await expectBlocked(
      `<extends src="/etc/passwd"><block name="content">hello</block></extends>`,
      "extends",
    );
  });

  test("blocks <extends> with relative path", async () => {
    await expectBlocked(
      `<extends src="../../layouts/base.html"></extends>`,
      "extends",
    );
  });

  test("blocks <extends> even with whitespace after <", async () => {
    await expectBlocked(`< extends src="/etc/passwd">`, "extends");
  });

  test("blocks <component> directive (server file read vector)", async () => {
    await expectBlocked(
      `<html><body><component src="../../.env" /></body></html>`,
      "component",
    );
  });

  test("blocks <component> with absolute path", async () => {
    await expectBlocked(
      `<component src="/proc/self/environ"></component>`,
      "component",
    );
  });

  test("blocks <fetch> directive (SSRF vector)", async () => {
    await expectBlocked(
      `<html><body><fetch url="http://169.254.169.254/latest/meta-data/"></fetch></body></html>`,
      "fetch",
    );
  });

  test("blocks <fetch> pointing at internal service", async () => {
    await expectBlocked(`<fetch url="http://localhost:5432/database">`, "fetch");
  });

  test("blocks <include> directive", async () => {
    await expectBlocked(`<include src="/etc/shadow" />`, "include");
  });

  test("blocks <module> directive", async () => {
    await expectBlocked(`<module href="../../lib/auth.ts">`, "module");
  });

  test("blocks <slot> directive", async () => {
    await expectBlocked(
      `<html><body><slot name="content"></slot></body></html>`,
      "slot",
    );
  });

  test("blocks <fill> directive", async () => {
    await expectBlocked(`<fill name="content">injected content</fill>`, "fill");
  });

  test("blocks directives regardless of case (EXTENDS)", async () => {
    await expectBlocked(`<EXTENDS src="/etc/passwd"></EXTENDS>`, "extends");
  });

  test("blocks directives regardless of case (Component)", async () => {
    await expectBlocked(`<Component src="../../secret.txt" />`, "component");
  });

  test("blocks directives regardless of case (FETCH)", async () => {
    await expectBlocked(`<FETCH url="http://attacker.com/exfil">`, "fetch");
  });

  test("blocks <extends> embedded inside a valid HTML template", async () => {
    await expectBlocked(
      `<html>
        <head><title>Email</title></head>
        <body>
          <p>Legit content</p>
          <extends src="/etc/passwd">
            <block name="content">hello</block>
          </extends>
        </body>
      </html>`,
      "extends",
    );
  });

  test("blocks <component> embedded deep in a template", async () => {
    await expectBlocked(
      `<html><body>
        <table><tr><td>
          <component src="../secrets/api-keys.html" />
        </td></tr></table>
      </body></html>`,
      "component",
    );
  });
});

// ============================================================================
// Security: expression scope isolation
//
// posthtml-expressions evaluates {{ expr }} using with(locals) scoping.
// Unknown identifiers return the missingLocal sentinel rather than
// resolving to Node.js globals.
// ============================================================================

describe("compileMaizzle security: expression scope isolation", () => {
  test(
    "unknown identifiers in {{ expr }} return sentinel instead of resolving globals",
    async () => {
      const source = `
        <html>
          <body>
            <p>{{ process }}</p>
          </body>
        </html>
      `;
      const html = await compileMaizzle(source);
      expect(html).not.toContain("[object process]");
      expect(html).not.toContain('"version"');
    },
    MAIZZLE_TIMEOUT,
  );

  test(
    "{{ process.env.SECRET }} does not leak env var values",
    async () => {
      process.env.MAIZZLE_CANARY_SECRET = "super-secret-canary-value-12345";
      try {
        const source = `
          <html>
            <body>
              <p>{{ process.env.MAIZZLE_CANARY_SECRET }}</p>
            </body>
          </html>
        `;
        const html = await compileMaizzle(source);
        expect(html).not.toContain("super-secret-canary-value-12345");
      } finally {
        delete process.env.MAIZZLE_CANARY_SECRET;
      }
    },
    MAIZZLE_TIMEOUT,
  );
});

// ============================================================================
// CompileError contract
// ============================================================================

describe("CompileError contract (Maizzle)", () => {
  test("phase is 'validation' for input validation failures", async () => {
    try {
      await compileMaizzle("");
      expect(true).toBe(false);
    } catch (err) {
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("phase is 'validation' for blocked PostHTML directives", async () => {
    try {
      await compileMaizzle(`<extends src="/etc/passwd"></extends>`);
      expect(true).toBe(false);
    } catch (err) {
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("error message includes the directive name that was blocked", async () => {
    const directives = ["extends", "component", "fetch", "include", "module", "slot", "fill"];
    for (const directive of directives) {
      try {
        await compileMaizzle(`<${directive} src="x">`);
        expect(true).toBe(false);
      } catch (err) {
        expect((err as CompileError).message).toContain(directive);
      }
    }
  });
});
