import { CompileError } from "./errors.js";

/** Maximum Maizzle source size: 512KB */
const MAX_SOURCE_SIZE = 512_000;

/** Compilation timeout: 15 seconds */
const COMPILE_TIMEOUT_MS = 15_000;

/**
 * PostHTML directives that perform file-system reads or network fetches.
 *
 * Maizzle's PostHTML pipeline resolves these at compile time: a template
 * like `<extends src="/etc/passwd">` causes the server to read that path
 * and include the content in rendered output (server-side file read). We
 * reject any input containing these directives rather than stripping them,
 * because stripping is error-prone with nested or malformed markup.
 *
 * Affected plugins: posthtml-extend, posthtml-fetch, posthtml-components,
 * posthtml-include, posthtml-modules.
 */
const DANGEROUS_DIRECTIVE_RE =
  /<\s*(?:extends|component|fetch|include|module|slot|fill|raw|block|yield)\b/i;

/**
 * Compile a Maizzle template string into an HTML email string.
 *
 * Pipeline:
 *  1. Validate input (size, basic structure check)
 *  2. Reject inputs containing PostHTML file-access directives
 *  3. Compile using @maizzle/framework
 *
 * Security:
 *  - PostHTML file-system directives are rejected at validation time
 *    to prevent server-side file reads and SSRF.
 *  - Template expressions ({{ expr }}) are evaluated by posthtml-expressions
 *    with empty `locals`, so unknown identifiers like `process` or `require`
 *    return the literal string '{local}' rather than accessing Node.js globals.
 *  - A hard timeout prevents pathological PostCSS/Tailwind inputs from
 *    hanging indefinitely.
 *
 * Requires peer dependency: @maizzle/framework
 */
/**
 * Is this the Maizzle 6 module?
 *
 * Maizzle 6 replaced the HTML template with a Vue single-file component, and
 * its `render` resolves a string argument as a path rather than as source.
 * Handed a template it reports `Failed to load url <!DOCTYPE html>…`, which
 * describes nothing an author can act on, so the caller checks first and says
 * what actually happened.
 *
 * `createRenderer` is the discriminator: exported by every v6 release and by
 * no v5 one. The module carries no version to read, so a capability probe is
 * what there is.
 */
export function isMaizzle6(mod: object): boolean {
  return "createRenderer" in mod;
}

export async function compileMaizzle(source: string): Promise<string> {
  // ── 1. Validate ──────────────────────────────────────────────────────
  if (!source || !source.trim()) {
    throw new CompileError("Maizzle source must not be empty.", "maizzle", "validation");
  }

  if (source.length > MAX_SOURCE_SIZE) {
    throw new CompileError(
      `Maizzle source exceeds ${MAX_SOURCE_SIZE / 1000}KB limit.`,
      "maizzle",
      "validation",
    );
  }

  // ── 2. Block file-system and network PostHTML directives ─────────────
  if (DANGEROUS_DIRECTIVE_RE.test(source)) {
    throw new CompileError(
      "Maizzle templates may not use <extends>, <component>, <fetch>, <include>, " +
        "<module>, <slot>, <fill>, <raw>, <block>, or <yield> directives. These directives " +
        "access the server file system at compile time. Use inline HTML and Tailwind utility classes instead.",
      "maizzle",
      "validation",
    );
  }

  // ── 3. Load peer dependency ──────────────────────────────────────────
  let maizzleRender: (
    input: string,
    options: Record<string, unknown>,
  ) => Promise<{ html: string }>;

  let maizzle: Record<string, unknown>;
  try {
    maizzle = (await import("@maizzle/framework")) as unknown as Record<string, unknown>;
  } catch {
    throw new CompileError(
      'Maizzle compilation requires "@maizzle/framework". Install it:\n' +
        "  npm install @maizzle/framework@5",
      "maizzle",
      "compile",
    );
  }

  if (isMaizzle6(maizzle)) {
    throw new CompileError(
      "Maizzle 6 is installed, and this engine compiles Maizzle 5 templates.\n" +
        "Maizzle 6 renders Vue single-file components rather than HTML, so an\n" +
        "HTML template is not something it can read. Install the supported major:\n" +
        "  npm install @maizzle/framework@5",
      "maizzle",
      "compile",
    );
  }
  maizzleRender = maizzle.render as typeof maizzleRender;

  // ── 4. Compile with timeout ──────────────────────────────────────────
  const compilePromise = maizzleRender(source, {
    css: {
      inline: {
        removeInlinedSelectors: true,
        applyWidthAttributes: true,
        applyHeightAttributes: true,
      },
      shorthand: true,
      sixHex: true,
    },
    locals: {},
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(() => {
      reject(
        new CompileError(
          `Maizzle compilation timed out after ${COMPILE_TIMEOUT_MS / 1000}s.`,
          "maizzle",
          "compile",
        ),
      );
    }, COMPILE_TIMEOUT_MS);
    if (typeof t.unref === "function") t.unref();
  });

  try {
    const { html } = await Promise.race([compilePromise, timeoutPromise]);

    if (!html) {
      throw new CompileError("Maizzle compilation produced empty output.", "maizzle", "compile");
    }

    return html;
  } catch (err: unknown) {
    if (err instanceof CompileError) throw err;
    const message = err instanceof Error ? err.message : "Unknown Maizzle compilation error";
    throw new CompileError(`Maizzle compilation failed: ${message}`, "maizzle", "compile");
  }
}
