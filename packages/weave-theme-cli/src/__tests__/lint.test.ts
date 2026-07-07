import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDANCE_MAX_BYTES, THEME_CSS_MAX_BYTES } from "@shepherd-creative/weave-tokens/validate";
import { afterEach, describe, expect, it } from "vitest";
import { lintThemeDir } from "../lint.js";

// packages/weave-theme-cli/src/__tests__/lint.test.ts -> repo root is four
// levels up. Resolved from the file's own URL (not cwd) so this is stable
// regardless of what directory the test runner was invoked from.
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const THEMES_DIR = join(REPO_ROOT, "examples", "themes");

const tempDirs: string[] = [];

function makeThemeDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "weave-theme-cli-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, "utf8");
  }
  return dir;
}

afterEach(() => {
  let dir: string | undefined;
  // biome-ignore lint/suspicious/noAssignInExpressions: tidy drain loop
  while ((dir = tempDirs.pop())) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A complete set of the three ENFORCED coverage buckets (structural, tone,
// palette — 20 + 8 + 8 = 36 vars), so fixtures targeting one specific check
// (contrast, unknown-variable, drop-report) don't also trip unrelated
// COVERAGE_INCOMPLETE findings. Deliberately NOT the shipped example CSS, so
// these fixtures stay stable even if the example themes change.
const BASE_VARS: Readonly<Record<string, string>> = {
  "--background": "#ffffff",
  "--foreground": "#111111",
  "--card": "#ffffff",
  "--card-foreground": "#111111",
  "--popover": "#ffffff",
  "--popover-foreground": "#111111",
  "--primary": "#1e3a8a",
  "--primary-foreground": "#ffffff",
  "--secondary": "#eeeeee",
  "--secondary-foreground": "#111111",
  "--muted": "#eeeeee",
  "--muted-foreground": "#555555",
  "--accent": "#eeeeee",
  "--accent-foreground": "#1e3a8a",
  "--destructive": "#b91c1c",
  "--destructive-foreground": "#ffffff",
  "--border": "#dddddd",
  "--input": "#dddddd",
  "--ring": "#1e3a8a",
  "--radius": "0.5rem",
  "--tone-positive": "#15803d",
  "--tone-positive-muted": "#e3f4e9",
  "--tone-negative": "#b91c1c",
  "--tone-negative-muted": "#fbe7e7",
  "--tone-warning": "#a16207",
  "--tone-warning-muted": "#f9f0dc",
  "--tone-info": "#1d4ed8",
  "--tone-info-muted": "#e4ebfb",
  "--chart-1": "#7c9cd6",
  "--chart-2": "#8fbf9f",
  "--chart-3": "#d6a97c",
  "--chart-4": "#b78fc9",
  "--chart-5": "#7cc0d6",
  "--chart-6": "#d68f9c",
  "--chart-7": "#a9c97c",
  "--chart-8": "#c9b27c",
};

function buildThemeCss(overrides: Record<string, string | undefined> = {}): string {
  const vars: Record<string, string> = { ...BASE_VARS };
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete vars[name];
    else vars[name] = value;
  }
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

describe("shipped example themes", () => {
  const dirs = readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  it("found the expected shipped themes", () => {
    expect(dirs).toEqual(
      expect.arrayContaining(["brand-iron", "corporate-light", "terminal-dense"]),
    );
  });

  // Shipped themes are conformance fixtures: every one of them must lint
  // with ZERO errors (warnings allowed). No per-theme escape map here — a
  // regression in a shipped theme or an over-tight new check must fail this
  // test loudly, not hide behind an allowlist. When the linter surfaced
  // brand-iron's 2.8:1 cream-on-saffron --primary pair, the resolution was
  // to fix the THEME (ink text on saffron, 5.0:1), not to whitelist the
  // finding.
  for (const name of dirs) {
    it(`${name} lints with zero errors`, () => {
      const result = lintThemeDir(join(THEMES_DIR, name));
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
      // None of the shipped themes ship a drop-report.json yet (a future
      // stage adds brand-iron's) — that must stay a warning, never an
      // error, without --require-drop-report.
      expect(result.warnings.some((w) => w.code === "DROP_REPORT_MISSING")).toBe(true);
    });
  }
});

describe("weave-theme.css presence", () => {
  it("missing weave-theme.css is a THEME_MISSING error and stops further CSS checks", () => {
    const dir = makeThemeDir({ "DESIGN.md": "# brief\n" });
    const result = lintThemeDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ severity: "error", code: "THEME_MISSING" }),
    ]);
    expect(result.coverage).toEqual([]);
    expect(result.contrast).toEqual({ checked: [], skipped: [] });
  });
});

describe("size caps", () => {
  it("a theme over THEME_CSS_MAX_BYTES is THEME_CSS_TOO_LARGE and skips the CSS checks", () => {
    // Valid CSS wrapped in comment padding pushes the byte length over the
    // cap — proving the finding comes from the size gate, not the grammar.
    // Fixture is generated here, never committed (no 64KiB files in git).
    const padding = `/* ${"x".repeat(THEME_CSS_MAX_BYTES)} */\n`;
    const dir = makeThemeDir({
      "weave-theme.css": `${buildThemeCss()}${padding}`,
      "DESIGN.md": "# brief\n",
    });
    const result = lintThemeDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ severity: "error", code: "THEME_CSS_TOO_LARGE" }),
    ]);
    // Same bail-out behaviour as THEME_MISSING: no coverage or contrast
    // findings pile on top of an oversized file.
    expect(result.coverage).toEqual([]);
    expect(result.contrast).toEqual({ checked: [], skipped: [] });
  });

  it("a DESIGN.md over GUIDANCE_MAX_BYTES is GUIDANCE_TOO_LARGE", () => {
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss(),
      "DESIGN.md": "x".repeat(GUIDANCE_MAX_BYTES + 1),
    });
    const result = lintThemeDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ severity: "error", code: "GUIDANCE_TOO_LARGE" }),
    ]);
    // The oversized brief must not suppress the theme checks themselves.
    expect(result.coverage.length).toBeGreaterThan(0);
  });
});

describe("coverage", () => {
  it("an empty theme file produces a COVERAGE_INCOMPLETE error per missing structural/tone/palette var", () => {
    const dir = makeThemeDir({ "weave-theme.css": "" });
    const result = lintThemeDir(dir);
    const coverageErrors = result.errors.filter((e) => e.code === "COVERAGE_INCOMPLETE");
    // 20 structural + 8 tone + 8 palette, all missing.
    expect(coverageErrors).toHaveLength(36);
    expect(result.ok).toBe(false);

    const structural = result.coverage.find((b) => b.name === "structural");
    expect(structural).toMatchObject({ set: 0, total: 20, enforced: true });
  });

  it("--allow-partial downgrades coverage findings to warnings and the run passes", () => {
    const dir = makeThemeDir({ "weave-theme.css": "" });
    const result = lintThemeDir(dir, { allowPartial: true });
    expect(result.errors.filter((e) => e.code === "COVERAGE_INCOMPLETE")).toEqual([]);
    const coverageWarnings = result.warnings.filter((w) => w.code === "COVERAGE_INCOMPLETE");
    expect(coverageWarnings).toHaveLength(36);
    expect(result.ok).toBe(true);
  });

  it("report-only buckets (e.g. typography) never produce a finding, however incomplete", () => {
    const dir = makeThemeDir({ "weave-theme.css": buildThemeCss() });
    const result = lintThemeDir(dir);
    const typography = result.coverage.find((b) => b.name === "typography");
    expect(typography?.enforced).toBe(false);
    expect(typography?.set).toBe(0);
    expect(result.errors.some((e) => e.message.startsWith("typography:"))).toBe(false);
  });
});

describe("contrast", () => {
  it("identical background/foreground (#111 on #111) is a CONTRAST_FAIL error", () => {
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss({ "--background": "#111111", "--foreground": "#111111" }),
    });
    const result = lintThemeDir(dir);
    const finding = result.errors.find((e) => e.code === "CONTRAST_FAIL");
    expect(finding).toBeDefined();
    expect(finding?.context).toMatchObject({ fg: "--foreground", bg: "--background" });
    const entry = result.contrast.checked.find(
      (c) => c.fg === "--foreground" && c.bg === "--background",
    );
    expect(entry?.ratio).toBeCloseTo(1, 5);
  });

  it("rgba() values pass grammar and are checked; clamp() passes grammar but lands in contrast skipped", () => {
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss({
        "--background": "rgba(255, 255, 255, 1)",
        "--foreground": "rgba(0, 0, 0, 0.5)",
        "--primary": "clamp(1rem, 2vw, 3rem)",
      }),
    });
    const result = lintThemeDir(dir);

    expect(result.errors.filter((e) => e.code === "CSS_INVALID")).toEqual([]);

    const bgFgEntry = result.contrast.checked.find(
      (c) => c.fg === "--foreground" && c.bg === "--background",
    );
    expect(bgFgEntry?.ratio).toBeCloseTo(4.0, 1);

    const skipped = result.contrast.skipped.find(
      (s) => s.fg === "--primary-foreground" && s.bg === "--primary",
    );
    expect(skipped).toBeDefined();
    expect(
      result.errors.some(
        (e) => e.context?.bg === "--primary" && e.context?.fg === "--primary-foreground",
      ),
    ).toBe(false);
  });
});

describe("unknown variables", () => {
  it("a typo'd variable name is UNKNOWN_VARIABLE with a did-you-mean suggestion", () => {
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss({ "--tone-postive": "#10b981" }),
    });
    const result = lintThemeDir(dir);
    const finding = result.errors.find((e) => e.code === "UNKNOWN_VARIABLE");
    expect(finding).toBeDefined();
    expect(finding?.context).toMatchObject({
      name: "--tone-postive",
      suggestion: "--tone-positive",
    });
    expect(finding?.message).toContain("--tone-positive");
  });
});

describe("drop-report.json", () => {
  it("is a warning when missing, and does not fail the lint by itself", () => {
    // DESIGN.md included so GUIDANCE_MISSING doesn't also land in warnings —
    // this fixture isolates the drop-report behaviour specifically.
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss(),
      "DESIGN.md": "# brief\n",
    });
    const result = lintThemeDir(dir);
    expect(result.warnings).toEqual([
      expect.objectContaining({ severity: "warning", code: "DROP_REPORT_MISSING" }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.dropReport).toEqual({ present: false, valid: false });
  });

  it("--require-drop-report escalates a missing report to an error", () => {
    const dir = makeThemeDir({ "weave-theme.css": buildThemeCss() });
    const result = lintThemeDir(dir, { requireDropReport: true });
    expect(result.errors).toEqual([
      expect.objectContaining({ severity: "error", code: "DROP_REPORT_MISSING" }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("malformed JSON (not schema-invalid — unparseable) is DROP_REPORT_INVALID", () => {
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss(),
      "drop-report.json": '{ "version": 1, "brand": "test",', // truncated mid-object
    });
    const result = lintThemeDir(dir);
    const finding = result.errors.find((e) => e.code === "DROP_REPORT_INVALID");
    expect(finding).toBeDefined();
    expect(String(finding?.context?.issues)).toContain("invalid JSON");
    expect(result.dropReport).toEqual({ present: true, valid: false });
  });

  it("an invalid enum value in dropped[].type is DROP_REPORT_INVALID", () => {
    const badReport = {
      version: 1,
      brand: "test",
      sources: [],
      dropped: [
        { signal: "paper-grain texture", reason: "no non-token support", type: "bogus-type" },
      ],
      judgementCalls: [],
      contractGaps: [],
    };
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss(),
      "drop-report.json": JSON.stringify(badReport),
    });
    const result = lintThemeDir(dir);
    const finding = result.errors.find((e) => e.code === "DROP_REPORT_INVALID");
    expect(finding).toBeDefined();
    expect(String(finding?.context?.issues)).toContain("dropped.0.type");
    expect(result.dropReport).toEqual({ present: true, valid: false });
  });

  it("a schema-valid report is accepted", () => {
    const goodReport = {
      version: 1,
      brand: "test",
      sources: ["DESIGN.md"],
      dropped: [],
      judgementCalls: [
        {
          id: "tones-from-one-accent",
          decision: "route accent to warning/negative only",
          rationale: "single-accent brand has no semantic palette",
          affectedTokens: ["--tone-warning", "--tone-negative"],
        },
      ],
      contractGaps: [],
    };
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss(),
      "drop-report.json": JSON.stringify(goodReport),
    });
    const result = lintThemeDir(dir);
    expect(result.errors.filter((e) => e.code === "DROP_REPORT_INVALID")).toEqual([]);
    expect(result.dropReport).toEqual({ present: true, valid: true });
  });
});

describe("DESIGN.md", () => {
  it("is a warning when missing", () => {
    const dir = makeThemeDir({ "weave-theme.css": buildThemeCss() });
    const result = lintThemeDir(dir);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "GUIDANCE_MISSING" })]),
    );
  });

  it("is not warned about when present", () => {
    const dir = makeThemeDir({
      "weave-theme.css": buildThemeCss(),
      "DESIGN.md": "# brief\n\nKeep it simple.\n",
    });
    const result = lintThemeDir(dir);
    expect(result.warnings.some((w) => w.code === "GUIDANCE_MISSING")).toBe(false);
  });
});
