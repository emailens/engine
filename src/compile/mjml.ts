import { CompileError } from "./errors.js";

/** Maximum MJML source size: 512KB */
const MAX_SOURCE_SIZE = 512_000;

/**
 * Compile an MJML source string into an HTML email string.
 *
 * MJML is a declarative markup language with no code execution capability
 * (unlike JSX). The mjml library parses XML and generates HTML; there is
 * no sandboxing concern.
 *
 * Requires peer dependency: mjml
 */
export async function compileMjml(source: string): Promise<string> {
  // ── 1. Validate ──────────────────────────────────────────────────────
  if (!source || !source.trim()) {
    throw new CompileError("MJML source must not be empty.", "mjml", "validation");
  }

  if (source.length > MAX_SOURCE_SIZE) {
    throw new CompileError(
      `MJML source exceeds ${MAX_SOURCE_SIZE / 1000}KB limit.`,
      "mjml",
      "validation",
    );
  }

  if (!/<mjml[\s>]/i.test(source)) {
    throw new CompileError(
      "MJML source must contain a root <mjml> element. " +
        "Example: <mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>",
      "mjml",
      "validation",
    );
  }

  // ── 2. Load peer dependency ──────────────────────────────────────────
  type MjmlResult = {
    html: string;
    errors: Array<{ line: number; message: string; tagName: string; formattedMessage: string }>;
  };
  let mjml2html: (
    input: string,
    options?: Record<string, unknown>,
  ) => MjmlResult | Promise<MjmlResult>;

  try {
    const mjmlModule = await import("mjml");
    mjml2html = mjmlModule.default ?? mjmlModule;
  } catch {
    throw new CompileError(
      'MJML compilation requires "mjml". Install it:\n  npm install mjml',
      "mjml",
      "compile",
    );
  }

  // ── 3. Compile ───────────────────────────────────────────────────────
  try {
    // mjml v5+ returns a Promise; v4 returns synchronously.
    // Await handles both cases.
    const result = await mjml2html(source, {
      validationLevel: "soft",
      keepComments: false,
    });

    if (result.errors && result.errors.length > 0 && !result.html) {
      const errorMessages = result.errors
        .map((e) => `Line ${e.line}: ${e.message} (${e.tagName})`)
        .join("; ");
      throw new CompileError(
        `MJML compilation errors: ${errorMessages}`,
        "mjml",
        "compile",
      );
    }

    if (!result.html) {
      throw new CompileError("MJML compilation produced empty output.", "mjml", "compile");
    }

    return result.html;
  } catch (err: unknown) {
    if (err instanceof CompileError) throw err;
    const message = err instanceof Error ? err.message : "Unknown MJML compilation error";
    throw new CompileError(`MJML compilation failed: ${message}`, "mjml", "compile");
  }
}
