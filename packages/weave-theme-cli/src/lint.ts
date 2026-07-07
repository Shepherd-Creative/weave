import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  GUIDANCE_MAX_BYTES,
  knownVarsFromManifest,
  THEME_CSS_MAX_BYTES,
  validateThemeCss,
} from "@shepherd-creative/weave-tokens/validate";
import type { ContrastCheckEntry, SkippedContrastEntry } from "./contrast.js";
import { loadDefaultVarMap, parseVarMap, runContrastChecks } from "./contrast.js";
import type { CoverageBucket } from "./coverage.js";
import { computeCoverage } from "./coverage.js";
import { checkDropReport } from "./drop-report.js";
import { suggestNearest } from "./levenshtein.js";
import type { Finding } from "./types.js";

export type { ContrastCheckEntry, SkippedContrastEntry } from "./contrast.js";
export type { CoverageBucket } from "./coverage.js";
export type { Finding, LintCode, Severity } from "./types.js";

export type LintOptions = {
  /** Downgrade COVERAGE_INCOMPLETE from error to warning. */
  allowPartial?: boolean;
  /** Escalate a missing drop-report.json from warning to error. */
  requireDropReport?: boolean;
};

export type LintResult = {
  ok: boolean;
  dir: string;
  errors: Finding[];
  warnings: Finding[];
  coverage: CoverageBucket[];
  contrast: {
    checked: ContrastCheckEntry[];
    skipped: SkippedContrastEntry[];
  };
  dropReport: {
    present: boolean;
    valid: boolean;
  };
};

const THEME_FILE = "weave-theme.css";
const GUIDANCE_FILE = "DESIGN.md";
const DROP_REPORT_FILE = "drop-report.json";

/**
 * Lints a Weave theme directory against the checks the runtime validator
 * (`validateThemeCss`) deliberately leaves open: it silently strips unknown
 * variables instead of erroring, and has no notion of coverage or contrast
 * at all. This is the authoring-time gate that catches those before a theme
 * ships.
 *
 * Pure: no `process.exit`, no console output. The CLI (cli.ts) maps this
 * result to an exit code and printed report.
 */
export function lintThemeDir(dir: string, options: LintOptions = {}): LintResult {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];

  let coverage: CoverageBucket[] = [];
  let contrast: LintResult["contrast"] = { checked: [], skipped: [] };

  // --- weave-theme.css: presence, size cap, grammar/security, unknown vars ---
  const themeCssPath = join(dir, THEME_FILE);
  if (!existsSync(themeCssPath)) {
    errors.push({
      severity: "error",
      code: "THEME_MISSING",
      message: `${THEME_FILE} not found in ${dir}`,
    });
  } else {
    const bytes = statSync(themeCssPath).size;
    if (bytes > THEME_CSS_MAX_BYTES) {
      // Oversized file: bail out of the remaining CSS checks the same way a
      // missing file does, rather than regex-parsing a pathologically large
      // source. Same gating rationale as THEME_MISSING.
      errors.push({
        severity: "error",
        code: "THEME_CSS_TOO_LARGE",
        message: `${THEME_FILE} is ${bytes} bytes, over the ${THEME_CSS_MAX_BYTES}-byte cap`,
        context: { bytes, max: THEME_CSS_MAX_BYTES },
      });
    } else {
      const source = readFileSync(themeCssPath, "utf8");
      const known = knownVarsFromManifest();
      const validation = validateThemeCss(source, known);

      if (!validation.ok) {
        for (const message of validation.errors) {
          errors.push({ severity: "error", code: "CSS_INVALID", message });
        }
      } else {
        // Zero-stripped: every silently-dropped variable becomes a hard
        // error here, with a did-you-mean suggestion when one is close.
        for (const name of validation.stripped) {
          const suggestion = suggestNearest(name, known);
          errors.push({
            severity: "error",
            code: "UNKNOWN_VARIABLE",
            message: suggestion
              ? `unknown variable ${name} (did you mean ${suggestion}?)`
              : `unknown variable ${name}`,
            context: suggestion ? { name, suggestion } : { name },
          });
        }

        const applied = new Set(validation.applied);

        // Coverage
        coverage = computeCoverage(applied);
        for (const bucket of coverage) {
          if (!bucket.enforced) continue;
          for (const name of bucket.missing) {
            const finding: Finding = {
              severity: options.allowPartial ? "warning" : "error",
              code: "COVERAGE_INCOMPLETE",
              message: `${bucket.name}: missing ${name}`,
              context: { bucket: bucket.name, name },
            };
            (options.allowPartial ? warnings : errors).push(finding);
          }
        }

        // Contrast
        const themeVarMap = parseVarMap(validation.css);
        const defaults = loadDefaultVarMap();
        const contrastResult = runContrastChecks(themeVarMap, defaults);
        contrast = { checked: contrastResult.checked, skipped: contrastResult.skipped };
        for (const finding of contrastResult.findings) {
          (finding.severity === "error" ? errors : warnings).push(finding);
        }
      }
    }
  }

  // --- DESIGN.md: presence, size cap ---
  const guidancePath = join(dir, GUIDANCE_FILE);
  if (!existsSync(guidancePath)) {
    warnings.push({
      severity: "warning",
      code: "GUIDANCE_MISSING",
      message: `${GUIDANCE_FILE} not found in ${dir}`,
    });
  } else {
    const bytes = statSync(guidancePath).size;
    if (bytes > GUIDANCE_MAX_BYTES) {
      errors.push({
        severity: "error",
        code: "GUIDANCE_TOO_LARGE",
        message: `${GUIDANCE_FILE} is ${bytes} bytes, over the ${GUIDANCE_MAX_BYTES}-byte cap`,
        context: { bytes, max: GUIDANCE_MAX_BYTES },
      });
    }
  }

  // --- drop-report.json: presence, schema ---
  const dropReportPath = join(dir, DROP_REPORT_FILE);
  const dropCheck = checkDropReport(dropReportPath);
  const dropReportPresent = dropCheck.status !== "missing";
  const dropReportValid = dropCheck.status === "valid";

  if (dropCheck.status === "missing") {
    const finding: Finding = {
      severity: options.requireDropReport ? "error" : "warning",
      code: "DROP_REPORT_MISSING",
      message: `${DROP_REPORT_FILE} not found in ${dir}`,
    };
    (options.requireDropReport ? errors : warnings).push(finding);
  } else if (dropCheck.status === "invalid") {
    errors.push({
      severity: "error",
      code: "DROP_REPORT_INVALID",
      message: `${DROP_REPORT_FILE} is invalid: ${dropCheck.issues.join("; ")}`,
      context: { issues: dropCheck.issues },
    });
  }

  return {
    ok: errors.length === 0,
    dir,
    errors,
    warnings,
    coverage,
    contrast,
    dropReport: { present: dropReportPresent, valid: dropReportValid },
  };
}
