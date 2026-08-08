import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wave 1 task 8: the render-only peers are optional, and the `./schemas` entry
 * really is usable without them.
 *
 * The claim being guarded is a packaging one — "you can depend on this for
 * schemas alone" — and it is only true while `src/schemas/**` stays free of
 * React, Recharts and Lucide. That is a property of the SOURCE, which is why
 * it is checked here rather than against `dist/`: turbo's `test` task depends
 * on `^build` (upstream packages only), so this package's own `dist/` may be
 * absent or stale when tests run, and a guard that reads it would either fail
 * for the wrong reason or pass against yesterday's output.
 *
 * The built artefacts were inspected once, directly, when the peers were
 * marked optional: the schemas entry in all three published forms (ESM, CJS
 * and types) resolves exactly one external, zod, while the root entry pulls
 * react, react/jsx-runtime, recharts and lucide-react. The table of what was
 * found is in docs/specs/weave-document-v1.md.
 */

const PKG_DIR = path.resolve(__dirname, "..", "..");
const PKG = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf-8")) as {
  peerDependencies: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  exports: Record<string, Record<string, string>>;
};

/** Peers only a renderer needs. `zod` is not among them: the schemas ARE zod. */
const RENDER_ONLY_PEERS = ["react", "react-dom", "recharts", "lucide-react"];

function schemaSources(): Array<[string, string]> {
  const dir = path.join(PKG_DIR, "src", "schemas");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, readFileSync(path.join(dir, f), "utf-8")] as [string, string]);
}

describe("the schemas entry point stands alone", () => {
  it("imports nothing but zod and its own siblings", () => {
    const sources = schemaSources();
    // Non-vacuity floor: an empty directory listing would satisfy every
    // assertion below by scanning nothing.
    expect(sources.length).toBeGreaterThanOrEqual(6);

    for (const [file, source] of sources) {
      const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] as string);
      expect(
        specifiers.length,
        `${file} imports nothing at all — is it still a module?`,
      ).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        if (specifier.startsWith(".")) continue;
        expect(specifier, `${file} pulls a non-zod dependency into the schemas entry`).toBe("zod");
      }
    }
  });

  it("is published as its own export path", () => {
    expect(PKG.exports["./schemas"]).toEqual({
      types: "./dist/schemas/index.d.ts",
      import: "./dist/schemas/index.js",
      require: "./dist/schemas/index.cjs",
    });
  });
});

describe("peer dependency packaging", () => {
  it("marks every render-only peer optional", () => {
    for (const peer of RENDER_ONLY_PEERS) {
      expect(PKG.peerDependencies[peer], `${peer} must still be declared a peer`).toBeDefined();
      expect(
        PKG.peerDependenciesMeta?.[peer]?.optional,
        `${peer} is render-only and should be optional`,
      ).toBe(true);
    }
  });

  it("keeps zod required", () => {
    // Optional-marking zod would tell a consumer the schemas work without it.
    // They do not — every schema in this package is a zod schema.
    expect(PKG.peerDependencies.zod).toBeDefined();
    expect(PKG.peerDependenciesMeta?.zod?.optional).not.toBe(true);
  });

  it("marks nothing optional that is not a declared peer", () => {
    for (const name of Object.keys(PKG.peerDependenciesMeta ?? {})) {
      expect(
        PKG.peerDependencies[name],
        `${name} is metadata for a peer that is not declared`,
      ).toBeDefined();
    }
  });
});
