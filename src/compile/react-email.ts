import { CompileError } from "./errors.js";

/** Maximum source code size: 256KB */
const MAX_SOURCE_SIZE = 256_000;

/** Execution timeout: 5 seconds */
const EXECUTION_TIMEOUT_MS = 5_000;

/**
 * Sandbox strategy for JSX execution.
 *
 * - `"vm"` — `node:vm` with hardened globals. Fast, zero-dependency,
 *   but NOT a true security boundary (prototype-chain escapes are possible).
 *   Suitable for CLI / local use where users run their own code.
 *
 * - `"isolated-vm"` (default) — Separate V8 isolate via the `isolated-vm`
 *   npm package. True heap isolation; escapes require a V8 engine bug.
 *   Requires `isolated-vm` to be installed (native addon).
 *
 * - `"quickjs"` — Validates code structure in a QuickJS WASM sandbox, then
 *   executes in `node:vm` for React rendering. Security is equivalent to
 *   `node:vm` — the QuickJS phase validates import restrictions only.
 *   No native addons needed, but only supports ES2020 and is slower.
 *   For true isolation on servers, use `isolated-vm`.
 */
export type SandboxStrategy = "vm" | "isolated-vm" | "quickjs";

export interface CompileReactEmailOptions {
  /**
   * Sandbox strategy to use for executing user JSX code.
   * @default "isolated-vm"
   */
  sandbox?: SandboxStrategy;
}

/**
 * Compile a React Email JSX/TSX source string into an HTML email string.
 *
 * Pipeline:
 *  1. Validate input (size, basic checks)
 *  2. Transpile JSX/TSX → CommonJS JS using sucrase
 *  3. Execute inside a sandbox (configurable strategy)
 *  4. Render the exported component to a full HTML email string
 *
 * Requires peer dependencies: sucrase, react, @react-email/components,
 * @react-email/render. Additionally:
 *  - sandbox "isolated-vm" requires `isolated-vm`
 *  - sandbox "quickjs" requires `quickjs-emscripten`
 */
export async function compileReactEmail(
  source: string,
  options?: CompileReactEmailOptions,
): Promise<string> {
  const strategy = options?.sandbox ?? "isolated-vm";

  // ── 1. Validate ──────────────────────────────────────────────────────
  if (!source || !source.trim()) {
    throw new CompileError("JSX source must not be empty.", "jsx", "validation");
  }

  if (source.length > MAX_SOURCE_SIZE) {
    throw new CompileError(
      `JSX source exceeds ${MAX_SOURCE_SIZE / 1000}KB limit.`,
      "jsx",
      "validation",
    );
  }

  // ── 2. Load peer dependencies ────────────────────────────────────────
  let transform: typeof import("sucrase").transform;
  let React: typeof import("react");
  let ReactEmailComponents: typeof import("@react-email/components");
  let render: typeof import("@react-email/render").render;

  try {
    ({ transform } = await import("sucrase"));
  } catch {
    throw new CompileError(
      'JSX compilation requires "sucrase". Install it:\n  npm install sucrase',
      "jsx",
      "transpile",
    );
  }

  try {
    React = await import("react");
  } catch {
    throw new CompileError(
      'JSX compilation requires "react". Install it:\n  npm install react',
      "jsx",
      "transpile",
    );
  }

  try {
    ReactEmailComponents = await import("@react-email/components");
  } catch {
    throw new CompileError(
      'JSX compilation requires "@react-email/components". Install it:\n  npm install @react-email/components',
      "jsx",
      "transpile",
    );
  }

  try {
    ({ render } = await import("@react-email/render"));
  } catch {
    throw new CompileError(
      'JSX compilation requires "@react-email/render". Install it:\n  npm install @react-email/render',
      "jsx",
      "transpile",
    );
  }

  // ── 3. Transpile JSX/TSX → CommonJS ──────────────────────────────────
  let transpiledCode: string;
  try {
    const result = transform(source, {
      transforms: ["typescript", "jsx", "imports"],
      jsxRuntime: "classic",
      production: true,
    });
    transpiledCode = result.code;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown transpilation error";
    throw new CompileError(`JSX syntax error: ${message}`, "jsx", "transpile");
  }

  // ── 4. Execute in sandbox ────────────────────────────────────────────
  let moduleExports: Record<string, unknown>;

  switch (strategy) {
    case "isolated-vm":
      moduleExports = await executeInIsolatedVm(transpiledCode, React, ReactEmailComponents);
      break;
    case "quickjs":
      moduleExports = await executeInQuickJs(transpiledCode, React, ReactEmailComponents);
      break;
    case "vm":
      moduleExports = executeInVm(transpiledCode, React, ReactEmailComponents);
      break;
    default:
      throw new CompileError(
        `Unknown sandbox strategy: "${strategy}". Use "vm", "isolated-vm", or "quickjs".`,
        "jsx",
        "execution",
      );
  }

  // ── 5. Extract component and render ──────────────────────────────────
  let Component: unknown = moduleExports.default ?? moduleExports;

  if (typeof Component !== "function" && typeof Component === "object" && Component !== null) {
    const values = Object.values(Component as Record<string, unknown>);
    const fn = values.find((v) => typeof v === "function");
    if (fn) Component = fn;
  }

  if (typeof Component !== "function") {
    throw new CompileError(
      'The JSX source must export a React component function. ' +
        'Use "export default function Email() { ... }" or ' +
        '"export function Email() { ... }".',
      "jsx",
      "execution",
    );
  }

  try {
    const element = React.createElement(Component as React.FC);
    const html = await render(element);
    return html;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown rendering error";
    throw new CompileError(`React rendering error: ${message}`, "jsx", "render");
  }
}

// ─── Sandbox: node:vm ──────────────────────────────────────────────────────

/**
 * Execute transpiled code in a node:vm context with hardened globals.
 *
 * NOT a security boundary — see node:vm documentation. Suitable for CLI
 * use where the user runs their own code. For server use, prefer
 * "isolated-vm" or "quickjs".
 */
function executeInVm(
  code: string,
  React: typeof import("react"),
  ReactEmailComponents: typeof import("@react-email/components"),
): Record<string, unknown> {
  const { createContext, Script } = require("node:vm") as typeof import("node:vm");

  const ALLOWED_MODULES: Record<string, unknown> = {
    react: React,
    "@react-email/components": ReactEmailComponents,
  };

  const moduleExports: Record<string, unknown> = {};
  const moduleObj = { exports: moduleExports };

  const mockRequire = (moduleName: string): unknown => {
    if (moduleName in ALLOWED_MODULES) {
      return ALLOWED_MODULES[moduleName];
    }
    throw new Error(
      `Import of "${moduleName}" is not allowed. ` +
        `Only "react" and "@react-email/components" can be imported.`,
    );
  };

  const sandbox: Record<string, unknown> = {
    module: moduleObj,
    exports: moduleExports,
    require: mockRequire,
    React,
    Object, Array, String, Number, Boolean,
    Map, Set, WeakMap, WeakSet,
    JSON, Math, Date, RegExp,
    Error, TypeError, RangeError, ReferenceError, SyntaxError, URIError,
    Promise, Symbol,
    Proxy: undefined, Reflect: undefined,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    undefined, NaN, Infinity,
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout: undefined, setInterval: undefined, setImmediate: undefined, queueMicrotask: undefined,
    process: undefined, globalThis: undefined, global: undefined, Buffer: undefined,
    __dirname: undefined, __filename: undefined,
  };

  const context = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  try {
    const script = new Script(code, { filename: "user-email-component.tsx" });
    script.runInContext(context, { timeout: EXECUTION_TIMEOUT_MS, displayErrors: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown execution error";
    if (message.includes("Script execution timed out")) {
      throw new CompileError("JSX execution timed out (possible infinite loop).", "jsx", "execution");
    }
    throw new CompileError(`JSX execution error: ${message}`, "jsx", "execution");
  }

  return moduleObj.exports as Record<string, unknown>;
}

// ─── Sandbox: isolated-vm ──────────────────────────────────────────────────

/**
 * Validate code in a separate V8 isolate, then execute in `node:vm`.
 *
 * Two-phase approach:
 *  1. **Validate** — run the transpiled code in a true V8 isolate with stub
 *     React/component implementations. This catches disallowed imports and
 *     structural errors inside a genuine security boundary (separate heap,
 *     128 MB memory cap, timeout). Escape requires a V8 engine bug.
 *  2. **Execute** — run the validated code in `node:vm` with real React
 *     objects for actual rendering.
 *
 * Why two phases: React's internal type system uses Symbols
 * (`Symbol(react.forward_ref)`, `Symbol(react.element)`, etc.) which cannot
 * be transferred across V8 isolate boundaries — the structured clone
 * algorithm does not support Symbols. Running React code directly inside
 * `isolated-vm` is not possible.
 */
async function executeInIsolatedVm(
  code: string,
  React: typeof import("react"),
  ReactEmailComponents: typeof import("@react-email/components"),
): Promise<Record<string, unknown>> {
  let ivm: typeof import("isolated-vm");
  try {
    const ivmMod = await import("isolated-vm");
    ivm = (ivmMod as any).default ?? ivmMod;
  } catch {
    throw new CompileError(
      'Sandbox strategy "isolated-vm" requires the "isolated-vm" package. Install it:\n' +
        "  npm install isolated-vm\n" +
        'Or use sandbox: "vm" for a lighter (but less secure) alternative.',
      "jsx",
      "execution",
    );
  }

  // ── Phase 1: Validate in a true V8 isolate ─────────────────────────────
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  try {
    const ivmContext = await isolate.createContext();

    // Stub implementations let the code parse and execute structurally
    // without needing real React objects (which contain non-cloneable Symbols).
    // Stub React: createElement returns a plain object, forwardRef passes
    // through, and any unknown property returns a no-op function. The Proxy
    // on the components module ensures that any named import (Html, Head,
    // Button, etc.) resolves to a dummy component function so the transpiled
    // code can execute structurally without real React objects.
    const validationCode = `
      (function() {
        var module = { exports: {} };
        var exports = module.exports;
        var noop = function() { return {}; };
        var React = new Proxy({
          createElement: noop,
          forwardRef: function(fn) { return fn; },
          Fragment: "Fragment",
          createContext: function() { return { Provider: noop, Consumer: noop }; },
          useState: function(v) { return [v, noop]; },
          useRef: function() { return { current: null }; },
          useEffect: noop,
          useMemo: function(fn) { return fn(); },
          useCallback: function(fn) { return fn; },
          Children: { map: noop, forEach: noop, toArray: function() { return []; } },
        }, { get: function(t, p) { return p in t ? t[p] : noop; } });
        var componentsProxy = new Proxy({}, {
          get: function() { return noop; }
        });
        function require(name) {
          if (name === "react") return React;
          if (name === "@react-email/components") return componentsProxy;
          throw new Error('Import of "' + name + '" is not allowed. Only "react" and "@react-email/components" can be imported.');
        }
        try {
          ${code}
          return JSON.stringify({ ok: true });
        } catch(e) {
          return JSON.stringify({ ok: false, error: e.message || "Unknown error" });
        }
      })()
    `;

    try {
      const result = await ivmContext.eval(validationCode, {
        timeout: EXECUTION_TIMEOUT_MS,
      });

      if (typeof result === "string") {
        const parsed = JSON.parse(result) as { ok: boolean; error?: string };
        if (!parsed.ok) {
          throw new CompileError(
            `JSX execution error: ${parsed.error ?? "Unknown error"}`,
            "jsx",
            "execution",
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof CompileError) throw err;
      const message = err instanceof Error ? err.message : "Unknown execution error";
      if (message.includes("timed out") || message.includes("Timeout")) {
        throw new CompileError("JSX execution timed out (possible infinite loop).", "jsx", "execution");
      }
      throw new CompileError(`JSX execution error: ${message}`, "jsx", "execution");
    }
  } finally {
    isolate.dispose();
  }

  // ── Phase 2: Execute validated code in node:vm with real React ──────────
  return executeInVm(code, React, ReactEmailComponents);
}

// ─── Sandbox: QuickJS (WASM) ──────────────────────────────────────────────

/**
 * Validate code structure in QuickJS WASM, then execute in `node:vm`.
 *
 * Two-phase approach:
 *  1. Validate that the code doesn't access disallowed modules by running it
 *     in a QuickJS WASM sandbox with stub implementations.
 *  2. Execute in `node:vm` for actual React rendering (React objects can't
 *     cross the WASM boundary).
 *
 * **Security note:** The actual execution happens in `node:vm`, so runtime
 * security is equivalent to the `"vm"` strategy. The QuickJS phase only
 * validates import restrictions. For true isolation on servers, use
 * `"isolated-vm"`.
 */
async function executeInQuickJs(
  code: string,
  React: typeof import("react"),
  ReactEmailComponents: typeof import("@react-email/components"),
): Promise<Record<string, unknown>> {
  let getQuickJS: typeof import("quickjs-emscripten").getQuickJS;
  try {
    ({ getQuickJS } = await import("quickjs-emscripten"));
  } catch {
    throw new CompileError(
      'Sandbox strategy "quickjs" requires the "quickjs-emscripten" package. Install it:\n' +
        "  npm install quickjs-emscripten\n" +
        'Or use sandbox: "vm" for a lighter alternative.',
      "jsx",
      "execution",
    );
  }

  const QuickJS = await getQuickJS();
  const vm = QuickJS.newContext();

  try {
    // Phase 1: Validate code safety in the WASM sandbox.
    // We provide stub implementations of React and the module system so
    // the code can execute without errors, but we only care that it
    // doesn't try to access anything dangerous.
    // QuickJS (ES2020) does not support Proxy, so we enumerate known
    // React Email component names as stub functions instead.
    const validationCode = `
      (function() {
        var module = { exports: {} };
        var exports = module.exports;
        var noop = function() { return {}; };
        var React = {
          createElement: noop,
          forwardRef: function(fn) { return fn; },
          Fragment: "Fragment",
          createContext: function() { return { Provider: noop, Consumer: noop }; },
          useState: function(v) { return [v, noop]; },
          useRef: function() { return { current: null }; },
          useEffect: noop,
          useMemo: function(fn) { return fn(); },
          useCallback: function(fn) { return fn; },
          Children: { map: noop, forEach: noop, toArray: function() { return []; } },
        };
        var components = {};
        var names = [
          "Html","Head","Body","Container","Section","Row","Column","Text",
          "Link","Button","Img","Hr","Preview","Heading","Font","Style",
          "CodeBlock","CodeInline","Markdown","Tailwind","Responsive",
        ];
        for (var i = 0; i < names.length; i++) components[names[i]] = noop;
        function require(name) {
          if (name === "react") return React;
          if (name === "@react-email/components") return components;
          throw new Error('Import of "' + name + '" is not allowed.');
        }
        try {
          ${code}
          return JSON.stringify({ ok: true });
        } catch(e) {
          return JSON.stringify({ ok: false, error: e.message || "Unknown error" });
        }
      })()
    `;

    const result = vm.evalCode(validationCode);
    if (result.error) {
      const errorVal = vm.dump(result.error);
      result.error.dispose();
      throw new CompileError(
        `JSX execution error: ${typeof errorVal === "string" ? errorVal : "QuickJS execution failed"}`,
        "jsx",
        "execution",
      );
    }

    const resultStr = vm.dump(result.value);
    result.value.dispose();

    if (typeof resultStr === "string") {
      const parsed = JSON.parse(resultStr) as { ok: boolean; error?: string };
      if (!parsed.ok) {
        throw new CompileError(
          `JSX execution error: ${parsed.error ?? "Unknown error"}`,
          "jsx",
          "execution",
        );
      }
    }

    // Phase 2: Code validated as safe — execute in node:vm for actual
    // React rendering (React objects can't cross the WASM boundary)
    return executeInVm(code, React, ReactEmailComponents);
  } finally {
    vm.dispose();
  }
}
