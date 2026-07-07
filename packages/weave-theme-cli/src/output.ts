import type { LintResult } from "./lint.js";

/**
 * Human-readable report: coverage table, then errors, warnings, and skipped
 * contrast checks, ending in a one-line verdict. Written to stdout in human
 * mode; under `--json` this is never called (see cli.ts — only the JSON
 * blob reaches stdout there).
 */
export function formatHuman(result: LintResult): string {
  const lines: string[] = [];
  lines.push(`weave-theme lint: ${result.dir}`);

  if (result.coverage.length > 0) {
    lines.push("");
    lines.push("Coverage:");
    for (const bucket of result.coverage) {
      const suffix = bucket.enforced ? "" : "  (report-only)";
      lines.push(`  ${bucket.name.padEnd(16)} ${bucket.set}/${bucket.total}${suffix}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push(`Errors (${result.errors.length}):`);
    for (const e of result.errors) lines.push(`  ✗ [${e.code}] ${e.message}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push(`Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) lines.push(`  ! [${w.code}] ${w.message}`);
  }

  if (result.contrast.skipped.length > 0) {
    lines.push("");
    // Neutral header: each entry's reason carries the specifics (unparseable
    // value, unset variable, var() depth cap, translucent background, ...).
    lines.push("Contrast checks skipped:");
    for (const s of result.contrast.skipped) {
      lines.push(`  - ${s.fg} on ${s.bg}: ${s.reason}`);
    }
  }

  lines.push("");
  lines.push(
    result.ok ? "✓ ok" : `✗ ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`,
  );
  return lines.join("\n");
}

/**
 * Stable JSON shape for `--json` mode. This is a contract other tooling
 * (the future `weave-theme use` command, CI) depends on — additive changes
 * only; bump `version` on any breaking reshape so consumers can branch.
 */
export function formatJson(result: LintResult): string {
  return JSON.stringify({
    version: 1,
    ok: result.ok,
    dir: result.dir,
    errors: result.errors,
    warnings: result.warnings,
    coverage: result.coverage,
    contrast: result.contrast,
    dropReport: result.dropReport,
  });
}
