import { describe, test, expect } from "bun:test";
import { compileReactEmail, CompileError } from "../compile/index";

// All tests use sandbox: "vm" since the test environment doesn't require
// isolated-vm or quickjs-emscripten to be installed.
const VM_OPTS = { sandbox: "vm" as const };

// ============================================================================
// Basic compilation tests
// ============================================================================

describe("compileReactEmail", () => {
  test("compiles a simple React Email component to HTML", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";

      export default function Email() {
        return <Html><Text>Hello World</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Hello World");
    expect(html).toContain("<!DOCTYPE html");
  });

  test("compiles component with multiple React Email elements", async () => {
    const source = `
      import { Html, Head, Body, Container, Text, Button, Hr } from "@react-email/components";

      export default function Email() {
        return (
          <Html>
            <Head />
            <Body>
              <Container>
                <Text>Welcome!</Text>
                <Hr />
                <Button href="https://example.com">Click me</Button>
              </Container>
            </Body>
          </Html>
        );
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Welcome!");
    expect(html).toContain("Click me");
    expect(html).toContain("https://example.com");
  });

  test("supports inline styles on React Email components", async () => {
    const source = `
      import { Html, Body, Text } from "@react-email/components";

      export default function Email() {
        return (
          <Html>
            <Body style={{ backgroundColor: "#f5f5f5" }}>
              <Text style={{ color: "red", fontSize: "16px" }}>Styled text</Text>
            </Body>
          </Html>
        );
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Styled text");
    expect(html).toContain("background-color:#f5f5f5");
  });

  test("supports named exports (not just default)", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";

      export function MyEmail() {
        return <Html><Text>Named export</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Named export");
  });

  test("supports TypeScript syntax (interfaces, type annotations)", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";

      interface EmailProps {
        name: string;
      }

      export default function Email({ name = "World" }: EmailProps) {
        return <Html><Text>Hello {name}</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Hello");
    expect(html).toContain("World");
  });

  test("renders Heading component", async () => {
    const source = `
      import { Html, Heading } from "@react-email/components";

      export default function Email() {
        return <Html><Heading as="h1">Title</Heading></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Title");
    expect(html).toContain("<h1");
  });

  test("renders Link component with href", async () => {
    const source = `
      import { Html, Link } from "@react-email/components";

      export default function Email() {
        return <Html><Link href="https://example.com">Visit</Link></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("https://example.com");
    expect(html).toContain("Visit");
  });
});

// ============================================================================
// Validation tests
// ============================================================================

describe("compileReactEmail validation", () => {
  test("rejects empty source", async () => {
    try {
      await compileReactEmail("", VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).format).toBe("jsx");
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("rejects whitespace-only source", async () => {
    try {
      await compileReactEmail("   \n\t  ", VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
    }
  });

  test("rejects source exceeding size limit", async () => {
    const source = "x".repeat(300_000);
    try {
      await compileReactEmail(source, VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("validation");
    }
  });
});

// ============================================================================
// Syntax error tests
// ============================================================================

describe("compileReactEmail transpile errors", () => {
  test("reports JSX syntax errors", async () => {
    const source = `
      import { Html } from "@react-email/components";
      export default function Email() {
        return <Html><Text>unclosed
      }
    `;
    try {
      await compileReactEmail(source, VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("transpile");
    }
  });
});

// ============================================================================
// Sandbox security tests
// ============================================================================

describe("compileReactEmail sandbox", () => {
  test("blocks require of non-whitelisted modules", async () => {
    const source = `
      const fs = require("fs");
      export default function Email() {
        return null;
      }
    `;
    try {
      await compileReactEmail(source, VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("execution");
      expect((err as CompileError).message).toContain("not allowed");
    }
  });

  test("blocks require of child_process", async () => {
    const source = `
      const cp = require("child_process");
      export default function Email() {
        return null;
      }
    `;
    try {
      await compileReactEmail(source, VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("execution");
    }
  });

  test("blocks require of node:fs", async () => {
    const source = `
      const fs = require("node:fs");
      export default function Email() {
        return null;
      }
    `;
    try {
      await compileReactEmail(source, VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("execution");
    }
  });

  test("process global is undefined in sandbox", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";
      export default function Email() {
        const p = typeof process;
        return <Html><Text>{p}</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("undefined");
  });

  test("globalThis is undefined in sandbox", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";
      export default function Email() {
        const g = typeof globalThis;
        return <Html><Text>{g}</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("undefined");
  });

  test("allows importing react", async () => {
    const source = `
      import React from "react";
      import { Html, Text } from "@react-email/components";
      export default function Email() {
        return React.createElement(Html, null, React.createElement(Text, null, "Works"));
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Works");
  });

  test("rejects source without exported component", async () => {
    const source = `
      const x = 42;
    `;
    try {
      await compileReactEmail(source, VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("execution");
      expect((err as CompileError).message).toContain("export");
    }
  });
});

// ============================================================================
// Sandbox: code-generation blocking (vm sandbox)
// ============================================================================

describe("compileReactEmail sandbox: code-generation blocking", () => {
  test("constructor.constructor escape is blocked by codeGeneration.strings: false", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";

      let result = "";
      try {
        const F = ({}).constructor.constructor;
        const escaped = F("return process")();
        result = "escaped:" + (typeof escaped);
      } catch (e) {
        result = "blocked";
      }

      export default function Email() {
        return <Html><Text>{result}</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("blocked");
    expect(html).not.toContain("escaped:");
  });

  test("Buffer is undefined in sandbox", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";
      export default function Email() {
        const b = typeof Buffer;
        return <Html><Text>{b}</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("undefined");
  });

  test("setTimeout is undefined in sandbox (no async side-channels)", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";
      export default function Email() {
        const t = typeof setTimeout;
        return <Html><Text>{t}</Text></Html>;
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("undefined");
  });
});

// ============================================================================
// Edge case tests
// ============================================================================

describe("compileReactEmail edge cases", () => {
  test("handles component with conditional rendering", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";

      export default function Email() {
        const show = true;
        return (
          <Html>
            {show && <Text>Visible</Text>}
            {!show && <Text>Hidden</Text>}
          </Html>
        );
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Visible");
    expect(html).not.toContain("Hidden");
  });

  test("handles component with array rendering", async () => {
    const source = `
      import { Html, Text } from "@react-email/components";

      export default function Email() {
        const items = ["Apple", "Banana", "Cherry"];
        return (
          <Html>
            {items.map((item, i) => <Text key={i}>{item}</Text>)}
          </Html>
        );
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Apple");
    expect(html).toContain("Banana");
    expect(html).toContain("Cherry");
  });

  test("handles component with style objects", async () => {
    const source = `
      import { Html, Body, Container, Text } from "@react-email/components";

      const styles = {
        body: { backgroundColor: "#f0f0f0", margin: "0" },
        container: { maxWidth: "600px", margin: "0 auto" },
      };

      export default function Email() {
        return (
          <Html>
            <Body style={styles.body}>
              <Container style={styles.container}>
                <Text>Styled email</Text>
              </Container>
            </Body>
          </Html>
        );
      }
    `;
    const html = await compileReactEmail(source, VM_OPTS);
    expect(html).toContain("Styled email");
    expect(html).toContain("background-color:#f0f0f0");
  });
});

// ============================================================================
// CompileError contract
// ============================================================================

describe("CompileError contract", () => {
  test("has correct name and format properties", async () => {
    try {
      await compileReactEmail("", VM_OPTS);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect(err).toBeInstanceOf(Error);
      expect((err as CompileError).name).toBe("CompileError");
      expect((err as CompileError).format).toBe("jsx");
    }
  });
});
