import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import tokens from "@shepherd-creative/weave-tokens/tokens.json";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectTheme, loadDesignSources } from "../theme.js";

const KNOWN_VARS = new Set(tokens.variables.map((v) => v.name));

const THEME_SLOT = '<style id="weave-brand-theme"></style>';

let dir: string;

// Absolute paths for the fixtures written in beforeAll.
let validTheme: string;
let invalidTheme: string;
let oversizeTheme: string;
let validGuidance: string;
let oversizeGuidance: string;
const missingTheme = path.join(tmpdir(), "weave-nonexistent-theme-xyz.css");
const missingGuidance = path.join(tmpdir(), "weave-nonexistent-guidance-xyz.md");

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "weave-design-sources-"));

  validTheme = path.join(dir, "valid.css");
  writeFileSync(validTheme, ":root { --background: #ffffff; --foreground: #111827; }");

  invalidTheme = path.join(dir, "invalid.css");
  // `.foo { }` is a non-:root selector — a hard reject in validateThemeCss.
  writeFileSync(invalidTheme, ".foo { color: red; }\n:root { --background: #fff; }");

  oversizeTheme = path.join(dir, "oversize.css");
  // > 64 KiB of genuinely VALID CSS: one real declaration repeated enough times
  // to clear the cap, so the size gate is proven against real content (not a
  // comment that the validator would collapse away).
  const decl = "  --background: #ffffff;\n";
  const declCount = Math.ceil((70 * 1024) / decl.length);
  writeFileSync(oversizeTheme, `:root {\n${decl.repeat(declCount)}}`);

  validGuidance = path.join(dir, "DESIGN.md");
  writeFileSync(validGuidance, "# Brand guidance\n\nLead with a metric band.");

  oversizeGuidance = path.join(dir, "big-guidance.md");
  writeFileSync(oversizeGuidance, "x".repeat(17 * 1024));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadDesignSources", () => {
  it("returns nulls and no diagnostics when neither env var is set", () => {
    const r = loadDesignSources({});
    expect(r).toEqual({ themeCss: null, guidance: null, diagnostics: [] });
  });

  it("loads and sanitises a valid theme with no diagnostics", () => {
    const r = loadDesignSources({ WEAVE_THEME_CSS_PATH: validTheme });
    expect(r.themeCss).toContain("--background: #ffffff");
    expect(r.themeCss).toContain("--foreground: #111827");
    expect(r.guidance).toBeNull();
    expect(r.diagnostics).toEqual([]);
  });

  it("nonexistent theme path → null + one diagnostic naming the file, does not throw", () => {
    const r = loadDesignSources({ WEAVE_THEME_CSS_PATH: missingTheme });
    expect(r.themeCss).toBeNull();
    expect(r.diagnostics.length).toBe(1);
    expect(r.diagnostics[0]).toContain(missingTheme);
  });

  it("theme that fails validation → null + diagnostic, does not throw", () => {
    const r = loadDesignSources({ WEAVE_THEME_CSS_PATH: invalidTheme });
    expect(r.themeCss).toBeNull();
    expect(r.diagnostics.length).toBe(1);
    expect(r.diagnostics[0]).toContain(invalidTheme);
  });

  it("theme over the 64 KiB cap → null + diagnostic, does not throw", () => {
    const r = loadDesignSources({ WEAVE_THEME_CSS_PATH: oversizeTheme });
    expect(r.themeCss).toBeNull();
    expect(r.diagnostics.length).toBe(1);
    expect(r.diagnostics[0]).toContain(oversizeTheme);
  });

  it("loads valid guidance verbatim", () => {
    const r = loadDesignSources({ WEAVE_DESIGN_GUIDANCE_PATH: validGuidance });
    expect(r.guidance).toContain("# Brand guidance");
    expect(r.guidance).toContain("Lead with a metric band.");
    expect(r.themeCss).toBeNull();
    expect(r.diagnostics).toEqual([]);
  });

  it("guidance over the 16 KiB cap → null + diagnostic", () => {
    const r = loadDesignSources({ WEAVE_DESIGN_GUIDANCE_PATH: oversizeGuidance });
    expect(r.guidance).toBeNull();
    expect(r.diagnostics.length).toBe(1);
    expect(r.diagnostics[0]).toContain(oversizeGuidance);
  });

  it("nonexistent guidance path → null + diagnostic", () => {
    const r = loadDesignSources({ WEAVE_DESIGN_GUIDANCE_PATH: missingGuidance });
    expect(r.guidance).toBeNull();
    expect(r.diagnostics.length).toBe(1);
    expect(r.diagnostics[0]).toContain(missingGuidance);
  });

  it("independently sanitises theme against the real token manifest", () => {
    // Guards that loadDesignSources builds knownVars from tokens.json: an unknown
    // var is stripped (kept out) while a known one survives.
    const p = path.join(dir, "mixed.css");
    writeFileSync(p, ":root { --background: #fff; --totally-unknown: red; }");
    const r = loadDesignSources({ WEAVE_THEME_CSS_PATH: p });
    expect(r.themeCss).toContain("--background: #fff");
    expect(r.themeCss).not.toContain("--totally-unknown");
    expect(KNOWN_VARS.has("--background")).toBe(true);
  });
});

describe("injectTheme", () => {
  const HTML = `<html><head>${THEME_SLOT}</head><body></body></html>`;

  it("returns html unchanged when themeCss is null", () => {
    expect(injectTheme(HTML, null)).toBe(HTML);
  });

  it("puts css inside the placeholder element", () => {
    const out = injectTheme(HTML, ":root{--background:#fff}");
    expect(out).toContain('<style id="weave-brand-theme">');
    expect(out).toContain(":root{--background:#fff}");
    expect(out).not.toContain(THEME_SLOT); // empty slot was replaced
  });

  it("throws when the placeholder is absent (build-regression guard)", () => {
    expect(() => injectTheme("<html><head></head></html>", ":root{--background:#fff}")).toThrow();
    // Even with null css, absence of the slot is a hard error.
    expect(() => injectTheme("<html><head></head></html>", null)).toThrow();
  });
});
