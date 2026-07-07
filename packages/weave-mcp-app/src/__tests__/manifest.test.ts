import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const tokensDir = path.resolve(__dirname, "../../../weave-tokens");
const raw = readFileSync(path.join(tokensDir, "tokens.css"), "utf8");
// Strip block comments before variable extraction so a flush-left commented-out
// declaration (e.g. "/* --foo: bar; */" at column 0) can never be picked up as live.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const manifest = JSON.parse(readFileSync(path.join(tokensDir, "tokens.json"), "utf8"));

const KNOWN_CATEGORIES = ["structural", "tone", "chart", "typography", "spacing", "surface"];

describe("tokens.json manifest", () => {
  it("matches tokens.css exactly", () => {
    const cssVars = [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
    const manifestVars = manifest.variables.map((v: { name: string }) => v.name);
    expect(new Set(manifestVars)).toEqual(new Set(cssVars));
    expect(cssVars.length).toBeGreaterThan(0);
  });

  it("every variable has a category", () => {
    for (const v of manifest.variables) {
      expect(typeof v.name).toBe("string");
      expect(typeof v.category).toBe("string");
      expect(v.name.startsWith("--")).toBe(true);
    }
  });

  it("has a stable envelope: version 1 and known categories only", () => {
    expect(manifest.version).toBe(1);
    for (const v of manifest.variables) {
      expect(KNOWN_CATEGORIES).toContain(v.category);
    }
  });
});
