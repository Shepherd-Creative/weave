import { describe, expect, it } from "vitest";
import type { LintResult } from "../lint.js";
import { formatHuman, formatJson } from "../output.js";
import type { Finding } from "../types.js";

function makeResult(overrides: Partial<LintResult> = {}): LintResult {
  return {
    ok: true,
    dir: "/themes/example",
    errors: [],
    warnings: [],
    coverage: [],
    contrast: { checked: [], skipped: [] },
    dropReport: { present: false, valid: false },
    ...overrides,
  };
}

function errorFinding(message = "boom"): Finding {
  return { severity: "error", code: "THEME_MISSING", message };
}

describe("formatHuman", () => {
  it("renders coverage, warnings and skipped sections, ending in ✓ ok", () => {
    const out = formatHuman(
      makeResult({
        coverage: [
          { name: "structural", total: 20, set: 20, missing: [], enforced: true },
          { name: "typography", total: 30, set: 3, missing: ["--font-mono"], enforced: false },
        ],
        warnings: [
          {
            severity: "warning",
            code: "DROP_REPORT_MISSING",
            message: "drop-report.json not found",
          },
        ],
        contrast: {
          checked: [],
          skipped: [
            {
              fg: "--card-foreground",
              bg: "--card",
              reason:
                "--card: translucent background — effective colour depends on the surface beneath",
            },
          ],
        },
      }),
    );
    expect(out).toContain("structural");
    expect(out).toContain("20/20");
    expect(out).toContain("(report-only)");
    expect(out).toContain("Warnings (1):");
    expect(out).toContain("! [DROP_REPORT_MISSING]");
    expect(out).toContain("Contrast checks skipped:");
    expect(out).toContain("translucent background");
    expect(out.endsWith("✓ ok")).toBe(true);
  });

  it("verdict is singular for one error, plural otherwise", () => {
    const one = formatHuman(makeResult({ ok: false, errors: [errorFinding()] }));
    expect(one.endsWith("✗ 1 error")).toBe(true);
    const two = formatHuman(makeResult({ ok: false, errors: [errorFinding(), errorFinding()] }));
    expect(two.endsWith("✗ 2 errors")).toBe(true);
  });
});

describe("formatJson", () => {
  it("carries the contract version and the linted dir", () => {
    const parsed = JSON.parse(formatJson(makeResult()));
    expect(parsed.version).toBe(1);
    expect(parsed.dir).toBe("/themes/example");
    expect(parsed.ok).toBe(true);
    expect(parsed.dropReport).toEqual({ present: false, valid: false });
  });
});
