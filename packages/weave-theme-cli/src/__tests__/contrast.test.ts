import { describe, expect, it } from "vitest";
import type { RGBA } from "../color.js";
import { compositeOver, contrastRatio, parseColor } from "../color.js";
import { loadDefaultVarMap, parseVarMap, resolveVar, runContrastChecks } from "../contrast.js";

/** parseColor, asserting the parse succeeded; avoids `!` non-null assertions in test bodies. */
function mustParseColor(value: string): RGBA {
  const parsed = parseColor(value);
  if (parsed === null) throw new Error(`expected "${value}" to parse as a colour`);
  return parsed;
}

describe("parseColor", () => {
  it("parses 3, 4, 6 and 8-digit hex", () => {
    expect(parseColor("#000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    const shortAlpha = mustParseColor("#0000");
    expect(shortAlpha.a).toBe(0);
    const longAlpha = mustParseColor("#00000080");
    expect(longAlpha.a).toBeCloseTo(128 / 255, 5);
  });

  it("parses rgb()/rgba() with comma syntax", () => {
    expect(parseColor("rgb(0,0,0)")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor("rgba(255, 255, 255, 0.5)")).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
  });

  it("parses rgb() with modern space syntax, including percentages", () => {
    expect(parseColor("rgb(0 0 0)")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor("rgb(100% 0% 0%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    const withAlpha = mustParseColor("rgb(0 0 0 / 0.5)");
    expect(withAlpha).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    const withPercentAlpha = mustParseColor("rgb(0 0 0 / 50%)");
    expect(withPercentAlpha.a).toBeCloseTo(0.5, 5);
  });

  it("returns null for unsupported syntaxes", () => {
    for (const value of [
      "clamp(1rem, 2vw, 3rem)",
      "color-mix(in srgb, red, blue)",
      "oklch(0.5 0.1 200)",
      "red",
      "transparent",
      "linear-gradient(red, blue)",
      "var(--background)",
      "",
      "not-a-colour",
    ]) {
      expect(parseColor(value)).toBeNull();
    }
  });
});

describe("pinned WCAG contrast vectors", () => {
  it("black on white is 21:1", () => {
    const black = mustParseColor("#000000");
    const white = mustParseColor("#ffffff");
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
  });

  it("#767676 on white is ~4.54:1", () => {
    const fg = mustParseColor("#767676");
    const bg = mustParseColor("#ffffff");
    expect(contrastRatio(fg, bg)).toBeCloseTo(4.54, 2);
  });

  it("#808080 on white is ~3.95:1", () => {
    const fg = mustParseColor("#808080");
    const bg = mustParseColor("#ffffff");
    expect(contrastRatio(fg, bg)).toBeCloseTo(3.95, 2);
  });

  it("alpha compositing: 50% black over white composites to mid-grey, ratio ~4.00:1", () => {
    const fg = mustParseColor("#00000080");
    const bg = mustParseColor("#ffffff");
    const composited = compositeOver(fg, bg);
    // 0x80/255 alpha over white: each channel lands at 255 - 128 = 127.
    expect(composited.r).toBeCloseTo(127, 0);
    expect(composited.g).toBeCloseTo(127, 0);
    expect(composited.b).toBeCloseTo(127, 0);
    expect(contrastRatio(composited, bg)).toBeCloseTo(4.0, 1);
  });
});

describe("loadDefaultVarMap", () => {
  it("is non-empty and contains --background", () => {
    const map = loadDefaultVarMap();
    expect(map.size).toBeGreaterThan(0);
    expect(map.has("--background")).toBe(true);
  });

  it("caches across calls (same Map instance)", () => {
    expect(loadDefaultVarMap()).toBe(loadDefaultVarMap());
  });
});

describe("parseVarMap", () => {
  it("extracts name/value pairs from a sanitised :root block", () => {
    const map = parseVarMap(":root {\n  --background: #fff;\n  --foreground: #111;\n}");
    expect(map.get("--background")).toBe("#fff");
    expect(map.get("--foreground")).toBe("#111");
  });
});

describe("resolveVar", () => {
  const defaults = loadDefaultVarMap();

  it("resolves a direct literal from the theme", () => {
    const theme = new Map([["--background", "#123456"]]);
    expect(resolveVar("--background", theme, defaults)).toEqual({
      kind: "value",
      value: "#123456",
    });
  });

  it("resolves var() one level, preferring the theme over defaults", () => {
    const theme = new Map([
      ["--primary-foreground", "var(--background)"],
      ["--background", "#123456"],
    ]);
    expect(resolveVar("--primary-foreground", theme, defaults)).toEqual({
      kind: "value",
      value: "#123456",
    });
  });

  it("falls back to the defaults map when the theme doesn't define the referenced var", () => {
    const theme = new Map([["--primary-foreground", "var(--background)"]]);
    const result = resolveVar("--primary-foreground", theme, defaults);
    expect(result).toEqual({ kind: "value", value: defaults.get("--background") });
  });

  it("uses the var()'s own fallback literal when neither theme nor defaults define it", () => {
    const theme = new Map([["--foo", "var(--totally-unknown, #abcdef)"]]);
    const result = resolveVar("--foo", theme, new Map());
    expect(result).toEqual({ kind: "value", value: "#abcdef" });
  });

  it("treats a two-level var() chain as unparseable (depth cap 1)", () => {
    const theme = new Map([
      ["--a", "var(--b)"],
      ["--b", "var(--c)"],
      ["--c", "#111111"],
    ]);
    const result = resolveVar("--a", theme, new Map());
    expect(result.kind).toBe("unparseable");
  });

  it("treats an undefined reference with no fallback as unparseable", () => {
    const result = resolveVar("--foo", new Map([["--foo", "var(--nowhere)"]]), new Map());
    expect(result.kind).toBe("unparseable");
  });

  it("reports unset when the variable has no value anywhere", () => {
    expect(resolveVar("--nope", new Map(), new Map()).kind).toBe("unset");
  });
});

describe("runContrastChecks", () => {
  const defaults = loadDefaultVarMap();

  it("skips a pair entirely when neither side is themed", () => {
    const { checked, skipped } = runContrastChecks(new Map(), defaults);
    expect(checked).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("flags an ERROR below the 3.0 text-pair floor, carrying the resolved values", () => {
    const theme = new Map([
      ["--background", "#111111"],
      ["--foreground", "#111111"],
    ]);
    const { findings, checked } = runContrastChecks(theme, defaults);
    const finding = findings.find((f) => f.code === "CONTRAST_FAIL");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.context).toMatchObject({ fgValue: "#111111", bgValue: "#111111" });
    expect(finding?.message).toContain("--foreground (#111111) on --background (#111111)");
    const entry = checked.find((c) => c.fg === "--foreground" && c.bg === "--background");
    expect(entry?.ratio).toBeCloseTo(1, 5);
    expect(entry?.status).toBe("error");
    expect(entry?.fgValue).toBe("#111111");
    expect(entry?.bgValue).toBe("#111111");
  });

  it("skips a pair whose background is translucent, with no CONTRAST_* finding", () => {
    const theme = new Map([
      ["--card", "rgba(255, 255, 255, 0.8)"],
      ["--card-foreground", "#111111"],
    ]);
    const { findings, checked, skipped } = runContrastChecks(theme, defaults);
    const entry = skipped.find((s) => s.bg === "--card" && s.fg === "--card-foreground");
    expect(entry).toBeDefined();
    expect(entry?.reason).toContain("translucent background");
    expect(checked.some((c) => c.bg === "--card" && c.fg === "--card-foreground")).toBe(false);
    // Every checked pair involving the translucent --card is skipped, and
    // nothing else in this minimal theme can produce a finding.
    expect(findings).toEqual([]);
  });

  it("records unparseable values in skipped, not as an error", () => {
    const theme = new Map([
      ["--primary", "clamp(1rem, 2vw, 3rem)"],
      ["--primary-foreground", "#ffffff"],
    ]);
    const { checked, skipped, findings } = runContrastChecks(theme, defaults);
    expect(skipped.some((s) => s.fg === "--primary-foreground" && s.bg === "--primary")).toBe(true);
    expect(checked.some((c) => c.fg === "--primary-foreground" && c.bg === "--primary")).toBe(
      false,
    );
    expect(findings.some((f) => f.context?.fg === "--primary-foreground")).toBe(false);
  });

  it("composites alpha before computing the ratio for an rgba() pair", () => {
    const theme = new Map([
      ["--background", "#ffffff"],
      ["--foreground", "rgba(0, 0, 0, 0.5)"],
    ]);
    const { checked } = runContrastChecks(theme, defaults);
    const entry = checked.find((c) => c.fg === "--foreground" && c.bg === "--background");
    expect(entry?.ratio).toBeCloseTo(4.0, 1);
  });
});
