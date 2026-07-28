// Type stubs for optional sandbox dependencies.
// These packages are dynamically imported and may not be installed.

declare module "isolated-vm" {
  export class Isolate {
    constructor(options?: { memoryLimit?: number });
    createContext(): Promise<Context>;
    dispose(): void;
  }

  export class Context {
    /** Evaluate code string inside the V8 isolate context (isolated-vm API). */
    eval(code: string, options?: { timeout?: number }): Promise<unknown>;
  }
}

declare module "quickjs-emscripten" {
  export function getQuickJS(): Promise<QuickJSRuntime>;

  interface QuickJSRuntime {
    newContext(): QuickJSContext;
  }

  interface QuickJSContext {
    evalCode(code: string): { value: QuickJSHandle; error?: undefined } | { value?: undefined; error: QuickJSHandle };
    dump(handle: QuickJSHandle): unknown;
    dispose(): void;
  }

  interface QuickJSHandle {
    dispose(): void;
  }
}
