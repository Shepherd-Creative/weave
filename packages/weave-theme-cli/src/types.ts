/**
 * Shared finding vocabulary, split out from lint.ts so contrast.ts (and any
 * other check module) can produce findings without importing the
 * orchestrator — avoids a circular import between lint.ts and its checks.
 */

export type Severity = "error" | "warning";

export type LintCode =
  | "THEME_MISSING"
  | "THEME_CSS_TOO_LARGE"
  | "GUIDANCE_MISSING"
  | "GUIDANCE_TOO_LARGE"
  | "CSS_INVALID"
  | "UNKNOWN_VARIABLE"
  | "COVERAGE_INCOMPLETE"
  | "CONTRAST_FAIL"
  | "CONTRAST_LOW"
  | "CHART_INVISIBLE"
  | "DROP_REPORT_MISSING"
  | "DROP_REPORT_INVALID";

export type Finding = {
  severity: Severity;
  code: LintCode;
  message: string;
  context?: Record<string, unknown>;
};
