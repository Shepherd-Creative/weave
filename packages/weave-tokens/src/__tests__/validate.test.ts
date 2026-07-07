import { describe, expect, it } from "vitest";
import tokens from "../../tokens.json";
import { knownVarsFromManifest, validateThemeCss } from "../validate.js";

const KNOWN = new Set(["--background", "--foreground", "--tone-positive"]);

describe("knownVarsFromManifest", () => {
  it("mirrors the tokens.json manifest", () => {
    const vars = knownVarsFromManifest();
    expect(vars.size).toBe(tokens.variables.length);
    expect(vars.has("--background")).toBe(true);
    expect(vars.has("--weave-card-padding")).toBe(true);
    for (const name of vars) expect(name.startsWith("--")).toBe(true);
  });
});

describe("validateThemeCss", () => {
  it("accepts a plain :root block of known variables", () => {
    const r = validateThemeCss(":root { --background: #fff; --foreground: #111; }", KNOWN);
    expect(r.ok).toBe(true);
    expect(r.css).toContain("--background: #fff");
    expect(r.stripped).toEqual([]);
  });

  it("strips unknown variables with a warning", () => {
    const r = validateThemeCss(":root { --background: #fff; --nope: red; }", KNOWN);
    expect(r.ok).toBe(true);
    expect(r.css).not.toContain("--nope");
    expect(r.stripped).toEqual(["--nope"]);
  });

  it("rejects @import, url() and non-:root blocks", () => {
    for (const bad of [
      "@import url(evil.css); :root { --background: #fff; }",
      ":root { --background: url(http://x/y.png); }",
      ".weave { color: red; }",
      ":root { --background: #fff; } body { margin: 0 }",
    ]) {
      expect(validateThemeCss(bad, KNOWN).ok).toBe(false);
    }
  });

  it("strips comments and tolerates whitespace", () => {
    const r = validateThemeCss("/* brand */\n:root {\n  --background: #fff; /* bg */\n}\n", KNOWN);
    expect(r.ok).toBe(true);
  });

  it("rejects dangerous values", () => {
    expect(validateThemeCss(":root { --background: expression(alert(1)); }", KNOWN).ok).toBe(false);
    expect(validateThemeCss(":root { --background: javascript:x; }", KNOWN).ok).toBe(false);
    expect(validateThemeCss(":root { --background: </style><script>; }", KNOWN).ok).toBe(false);
  });

  it("multiple :root blocks merge", () => {
    const r = validateThemeCss(
      ":root { --background: #fff; } :root { --foreground: #111; }",
      KNOWN,
    );
    expect(r.ok).toBe(true);
    expect(r.applied).toEqual(["--background", "--foreground"]);
  });

  it("empty or whitespace-only input is ok and produces empty css", () => {
    const r = validateThemeCss("   \n/* nothing */\n", KNOWN);
    expect(r.ok).toBe(true);
    expect(r.css).toBe("");
  });

  it("treats an uppercase variable name as unknown and strips it (custom properties are case-sensitive)", () => {
    const r = validateThemeCss(":root { --BACKGROUND: #fff; }", KNOWN);
    expect(r.ok).toBe(true);
    expect(r.css).toBe("");
    expect(r.applied).toEqual([]);
    expect(r.stripped).toEqual(["--BACKGROUND"]);
  });

  it("rejects CSS ident-escapes that smuggle url()/expression() past the token denylist", () => {
    // `\75` = "u", so `\75rl(...)` is a valid url() token the literal `url(`
    // branch never matches. String.raw keeps a single literal backslash in the
    // input, matching what a hostile brand stylesheet would actually contain.
    for (const bad of [
      String.raw`:root { --background: \75rl(https://evil.example/x.png); }`,
      String.raw`:root { --background: \000075rl(https://evil.example/x.png); }`,
      String.raw`:root { --background: expr\65 ssion(alert(1)); }`,
    ]) {
      const r = validateThemeCss(bad, KNOWN);
      expect(r.ok).toBe(false);
      expect(r.css).toBe("");
    }
  });
});
