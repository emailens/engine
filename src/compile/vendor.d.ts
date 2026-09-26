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

