import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    app: "src/app.ts",
    tools: "src/tools.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  noExternal: [],
  external: [
    "@shepherd-creative/weave-primitives",
    "@shepherd-creative/weave-skill",
    "hono",
    "@hono/node-server",
    "zod",
    "zod-to-json-schema",
  ],
});
