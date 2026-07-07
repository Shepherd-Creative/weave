import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    lint: "src/lint.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  external: ["@shepherd-creative/weave-tokens", "zod"],
});
