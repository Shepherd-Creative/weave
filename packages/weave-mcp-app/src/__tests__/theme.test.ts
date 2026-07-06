import { describe, expect, it } from "vitest";
import { validateThemeCss } from "../theme.js";

const KNOWN = new Set(["--background", "--foreground", "--tone-positive"]);

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
});
