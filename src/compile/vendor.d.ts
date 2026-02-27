// Type stubs for optional sandbox dependencies.
// These packages are dynamically imported and may not be installed.

declare module "isolated-vm" {
  export class Isolate {
    constructor(options?: { memoryLimit?: number });
    createContext(): Promise<Context>;
    dispose(): void;
  }

  export class Context {
    global: Reference<Record<string, unknown>>;
    evalClosureSync(code: string, args: unknown[], options?: { timeout?: number }): unknown;
  }

  export class Reference<T = unknown> {
    constructor(value: T);
    derefInto(): T;
    copySync(): T;
    applySync(
      receiver: unknown,
      args: unknown[],
      options?: { result?: { copy?: boolean }; arguments?: { copy?: boolean } },
    ): unknown;
    set(key: string, value: unknown): Promise<void>;
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
