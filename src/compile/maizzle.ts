import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
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

/** A Maizzle 6 template is a Vue SFC. Anything else is a v5 HTML string. */
function isVueSfc(source: string): boolean {
  return /<template[\s>]/i.test(source) && /<\/template>/i.test(source);
}

/** Maizzle 6 opens a single line whose extension is .vue or .md. */
function isSingleLinePath(source: string): boolean {
  const ext = extname(source);
  return !source.includes("\n") && (ext === ".vue" || ext === ".md");
}

// ponytail: one empty directory for the process. Maizzle 6 scans root/components
// and defaults root to cwd. A renderer the host already started keeps its dirs.
const pastedRoot = mkdtempSync(join(tmpdir(), "emailens-maizzle-"));

/** Imports, re-exports, SFC src, inlined stylesheets, and CSS file loads. */
const VUE_LOADS_FILE_RE =
  /\bimport\s*(?:[\s"'*{.(]|\/\*)|\brequire\s*\(|\bexport\s+(?:\*|\{)[\s\S]{0,400}?\bfrom\s*['"]|<\s*(?:script|template|style)\b[^>]*\bsrc\s*=|<\s*link\b[^>]*\binline\b|@(?:import|plugin|config)\b/i;

/**
 * Is this the Maizzle 6 module?
 *
 * `createRenderer` is exported by every v6 release and by no v5 one. The
 * module carries no version to read, so a capability probe is what there is.
 */
export function isMaizzle6(mod: object): boolean {
  return "createRenderer" in mod;
}

export async function compileMaizzle(
  source: string,
  // Test seam. Production always loads the installed package.
  loadFramework: () => Promise<Record<string, unknown>> = () =>
    import("@maizzle/framework") as Promise<Record<string, unknown>>,
): Promise<string> {
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

  const vue = isVueSfc(source);

  // ── 2. Block file-system access ──────────────────────────────────────
  // v5 PostHTML directives read files at compile time. A Vue SFC may use
  // <slot> and <component>, so those two names are only blocked in HTML.
  if (!vue && DANGEROUS_DIRECTIVE_RE.test(source)) {
    throw new CompileError(
      "Maizzle templates may not use <extends>, <component>, <fetch>, <include>, " +
        "<module>, <slot>, <fill>, <raw>, <block>, or <yield> directives. These directives " +
        "access the server file system at compile time. Use inline HTML and Tailwind utility classes instead.",
      "maizzle",
      "validation",
    );
  }
  // ponytail: a Vue <script> runs in Maizzle's SSR, same as the Maizzle CLI.
  // Not a sandbox. This regex is the file-load shapes, not a JS parser.
  // Isolated-vm if untrusted SFCs ever matter.
  if (vue && VUE_LOADS_FILE_RE.test(source)) {
    throw new CompileError(
      "Maizzle Vue templates may not import or require other files. Paste one self-contained .vue component.",
      "maizzle",
      "validation",
    );
  }

  // ── 3. Load peer dependency ──────────────────────────────────────────
  let maizzleRender: (
    input: string,
    options?: Record<string, unknown>,
  ) => Promise<{ html: string }>;

  let maizzle: Record<string, unknown>;
  try {
    maizzle = await loadFramework();
  } catch {
    throw new CompileError(
      'Maizzle compilation requires "@maizzle/framework". Install it:\n' +
        "  npm install @maizzle/framework@5   # HTML templates\n" +
        "  npm install @maizzle/framework@6   # Vue single-file components",
      "maizzle",
      "compile",
    );
  }

  const v6 = isMaizzle6(maizzle);
  if (vue && !v6) {
    throw new CompileError(
      "This is a Vue single-file component, and the installed Maizzle is v5, which compiles HTML.\n" +
        "Install the Vue compiler:\n" +
        "  npm install @maizzle/framework@6",
      "maizzle",
      "compile",
    );
  }
  if (!vue && v6) {
    throw new CompileError(
      "Maizzle 6 compiles Vue single-file components, not HTML templates.\n" +
        "Pass the contents of the .vue file, including its <template> block.\n" +
        "HTML templates need @maizzle/framework@5.",
      "maizzle",
      "compile",
    );
  }
  if (vue && v6 && isSingleLinePath(source)) {
    throw new CompileError(
      "Maizzle 6 would open this string as a file path. Paste the .vue contents, including a newline.",
      "maizzle",
      "validation",
    );
  }
  maizzleRender = maizzle.render as typeof maizzleRender;

  // v6 render() takes the SFC string and runs SSR plus the transformer
  // pipeline. Defaults already inline CSS. root is an empty directory so a
  // pasted <Secret /> cannot load cwd/components. v5 still needs the explicit
  // options, and empty locals so {{ process }} cannot see Node globals.
  const options = v6
    ? { root: pastedRoot }
    : {
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
      };

  // ── 4. Compile with timeout ──────────────────────────────────────────
  const compilePromise = maizzleRender(source, options);

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
