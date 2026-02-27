import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/compile/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
});
