import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

  // Known findings on shipped example themes, keyed by directory name. Empty
  // array = expected to lint with zero errors. brand-iron carries one real
  // accessibility finding this tool was built to catch: its saffron
  // --primary background paired with the pale --primary-foreground text
  // comes in at ~2.80:1, under the 3.0 floor these thresholds enforce. This
  // is a genuine finding on the shipped example brand, not a bug in the
  // linter or an over-tight threshold — see the Stage B2 task report
  // (status BLOCKED, ratios quoted) for the full readout. Do not "fix" this
  // by loosening CONTRAST_FAIL's threshold to make the assertion below
  // convenient; if brand-iron's palette is revisited, update this map to
  // match reality rather than the other way around.
  const KNOWN_ERROR_CODES: Readonly<Record<string, readonly string[]>> = {
    "brand-iron": ["CONTRAST_FAIL"],
  };

  for (const name of dirs) {
    it(`${name} lints with only known findings`, () => {
      const result = lintThemeDir(join(THEMES_DIR, name));
      expect(result.errors.map((e) => e.code)).toEqual(KNOWN_ERROR_CODES[name] ?? []);
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
