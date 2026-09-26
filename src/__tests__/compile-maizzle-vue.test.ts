import { describe, test, expect, beforeEach } from "bun:test";
import { compileMaizzle } from "../compile/maizzle";
import { CompileError } from "../compile/errors";

/**
 * Maizzle 6 is not the copy installed for the HTML suite. The loader stands
 * in for that module: `createRenderer` marks v6, and `render` is what
 * compileMaizzle must call with the pasted SFC and no v5 options.
 */
const calls: Array<{ source: string; options: unknown }> = [];
let renderResult: () => Promise<{ html?: string }> = async () => ({ html: "<p>Hello from vue</p>" });

function loadV6(): Promise<Record<string, unknown>> {
  return Promise.resolve({
    createRenderer: () => ({}),
    render: (source: string, options?: unknown) => {
      calls.push({ source, options });
      return renderResult();
    },
  });
}

const SFC = `<script setup>
defineConfig({ minify: true })
</script>
<template>
  <Html><Body><Text>Hello from vue</Text></Body></Html>
</template>`;

describe("compileMaizzle against a Maizzle 6 module", () => {
  beforeEach(() => {
    calls.length = 0;
    renderResult = async () => ({ html: "<p>Hello from vue</p>" });
  });

  test("sends the Vue source through and returns the HTML", async () => {
    const html = await compileMaizzle(SFC, loadV6);
    expect(html).toBe("<p>Hello from vue</p>");
    expect(calls).toHaveLength(1);
    expect(calls[0].source).toBe(SFC);
    const options = calls[0].options as { root: string };
    expect(Object.keys(options)).toEqual(["root"]);
    expect(options.root).not.toBe(process.cwd());
  });

  test("does not compile an HTML string, and does not call render", async () => {
    const html = "<!doctype html><html><body><p>Hi</p></body></html>";
    await expect(compileMaizzle(html, loadV6)).rejects.toThrow(/Pass the contents of the \.vue file/);
    expect(calls).toEqual([]);
  });

  test("does not open a .vue path", async () => {
    await expect(compileMaizzle("emails/welcome.vue", loadV6)).rejects.toThrow(/<template>/);
    expect(calls).toEqual([]);
  });

  test("does not open a one-line string Maizzle would read as a path", async () => {
    await expect(compileMaizzle("<template><p>x</p></template>.vue", loadV6)).rejects.toThrow(/file path/);
    await expect(compileMaizzle("<template/../../secret.vue", loadV6)).rejects.toThrow(/<template>/);
    expect(calls).toEqual([]);
  });

  test("rejects an empty render", async () => {
    renderResult = async () => ({ html: "" });
    await expect(compileMaizzle(SFC, loadV6)).rejects.toThrow(/empty output/);
  });

  test("wraps a render failure", async () => {
    renderResult = async () => {
      throw new Error("vite failed");
    };
    try {
      await compileMaizzle(SFC, loadV6);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CompileError);
      expect((err as CompileError).phase).toBe("compile");
      expect((err as CompileError).message).toContain("vite failed");
    }
  });

  test("a missing package still says how to install both majors", async () => {
    const load = () => Promise.reject(new Error("not installed"));
    await expect(compileMaizzle(SFC, load)).rejects.toThrow(/@maizzle\/framework@6/);
    expect(calls).toEqual([]);
  });
});
