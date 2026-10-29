import { describe, expect, test } from "bun:test";
import { builtinModules } from "node:module";

// The main entry runs in the browser: Plumber (opengovsg/plumber) bundles
// transformForClient into its frontend. Node-only code belongs in
// @emailens/engine/server or /compile. This bundles src/index.ts for the
// browser and fails on any Node built-in it reaches.
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

describe("main entry", () => {
  test("imports no Node built-ins", async () => {
    const reached = new Set<string>();
    const result = await Bun.build({
      entrypoints: [`${import.meta.dir}/../index.ts`],
      target: "browser",
      plugins: [
        {
          name: "record-node-builtins",
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (builtins.has(args.path)) {
                reached.add(`${args.path} (from ${args.importer})`);
                return { path: args.path, external: true };
              }
              return undefined;
            });
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect([...reached]).toEqual([]);
  }, 60_000);
});
