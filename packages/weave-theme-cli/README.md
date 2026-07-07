# @shepherd-creative/weave-theme-cli

Deterministic authoring-time lint gate for Weave theme directories.

The runtime validator (`@shepherd-creative/weave-tokens/validate`) is deliberately forgiving: it silently strips unknown variables, has no notion of coverage and never looks at colour. That is right for a host loading a theme at startup (never break the render), and wrong for authoring — a typo'd variable should fail loudly before the theme ships, not vanish quietly at runtime. `weave-theme lint` is that gate.

## Install

```bash
pnpm add -D @shepherd-creative/weave-theme-cli
```

## Use

```bash
weave-theme lint <themeDir> [--json] [--allow-partial] [--require-drop-report]
```

`<themeDir>` is a directory containing `weave-theme.css` (required), `DESIGN.md` (expected) and optionally `drop-report.json` (a design-source adapter's record of what it dropped and why).

| Flag | Effect |
|---|---|
| `--json` | Emit a single JSON report to stdout (nothing else reaches stdout) instead of human-readable text |
| `--allow-partial` | Downgrade incomplete structural/tone/palette coverage from error to warning |
| `--require-drop-report` | Treat a missing `drop-report.json` as an error instead of a warning |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | No lint errors (warnings allowed) |
| 1 | Lint errors found |
| 2 | Usage or IO failure (unknown command, missing/invalid directory, unexpected filesystem error) |

## What it checks

Findings are `{severity, code, message, context?}`. Codes and severities:

| Code | Severity | Meaning |
|---|---|---|
| `THEME_MISSING` | error | No `weave-theme.css` in the directory (stops further CSS checks) |
| `THEME_CSS_TOO_LARGE` | error | Theme over `THEME_CSS_MAX_BYTES` (64 KiB; also stops further CSS checks) |
| `GUIDANCE_MISSING` | warning | No `DESIGN.md` |
| `GUIDANCE_TOO_LARGE` | error | `DESIGN.md` over `GUIDANCE_MAX_BYTES` (16 KiB) |
| `CSS_INVALID` | error | `validateThemeCss` grammar/security reject (at-rules, non-`:root` selectors, dangerous values) |
| `UNKNOWN_VARIABLE` | error | A variable the runtime would silently strip, with a did-you-mean suggestion when one is close |
| `COVERAGE_INCOMPLETE` | error (warning with `--allow-partial`) | A missing variable in an enforced bucket (`structural`, `tone`, `palette`) |
| `CONTRAST_FAIL` | error | A text pair below the 3.0:1 floor |
| `CONTRAST_LOW` | warning | A text pair below the 4.5:1 target, or a muted/tone pair below 3.0:1 |
| `CHART_INVISIBLE` | warning | `--chart-1`/`--chart-2` below 1.5:1 against `--card` |
| `DROP_REPORT_MISSING` | warning (error with `--require-drop-report`) | No `drop-report.json` |
| `DROP_REPORT_INVALID` | error | `drop-report.json` is unparseable JSON or fails the schema |

### Coverage buckets

Buckets come from `tokens.json` categories, with the manifest's `chart` category split into `palette` (`--chart-1..8`) and `chart-treatment` (grid, axis, tooltip, ...). `structural`, `tone` and `palette` must be complete; every other bucket (`chart-treatment`, `typography`, `spacing`, `surface`) is report-only — partial coverage there is a legitimate brand choice, not an authoring mistake.

### Contrast pairs and thresholds

WCAG 2.x relative luminance; `rgba()` foregrounds are composited over the resolved opaque background first. A theme value may be `var(--other[, fallback])` — resolved one level (theme, then the shipped defaults, then the fallback literal); deeper indirection is skipped, not failed.

| Pair (fg vs bg) | Error below | Warning below |
|---|---|---|
| `--foreground` / `--background`, `--card-foreground` / `--card`, `--popover-foreground` / `--popover`, `--primary-foreground` / `--primary`, `--secondary-foreground` / `--secondary`, `--destructive-foreground` / `--destructive` | 3.0 | 4.5 |
| `--muted-foreground` vs `--background` and `--card` | — | 3.0 |
| `--tone-{positive,negative,warning,info}` vs `--background` and `--card` | — | 3.0 |
| `--chart-1`, `--chart-2` vs `--card` | — | 1.5 (`CHART_INVISIBLE`) |

`--chart-3..8` are deliberately unchecked: series-capped brands legitimately fade the palette tail. Pairs where either side is unparseable (`clamp()`, `oklch()`, named keywords), unset, behind deeper `var()` indirection or on a translucent background are recorded in `skipped[]` with a reason — never an error. Pairs where neither side is themed are not checked at all (the shipped defaults are pre-reviewed).

## `--json` shape

```jsonc
{
  "version": 1,             // JSON contract version; bumped on breaking reshape
  "ok": true,
  "dir": "/abs/path/to/theme",
  "errors": [ { "severity": "error", "code": "...", "message": "...", "context": { } } ],
  "warnings": [ /* same shape */ ],
  "coverage": [ { "name": "structural", "total": 20, "set": 20, "missing": [], "enforced": true } ],
  "contrast": {
    "checked": [ { "fg": "--foreground", "bg": "--background", "fgValue": "#1c1611", "bgValue": "#ede3cc", "ratio": 14.04, "threshold": 4.5, "status": "ok" } ],
    "skipped": [ { "fg": "...", "bg": "...", "reason": "..." } ]
  },
  "dropReport": { "present": false, "valid": false }
}
```

Contrast findings and `checked[]` entries carry `fgValue`/`bgValue` — the resolved colour strings actually compared. The shape is additive-only; `version` is bumped on any breaking change.

## Programmatic use (`./lint`)

```ts
import { lintThemeDir } from "@shepherd-creative/weave-theme-cli/lint";

const result = lintThemeDir("/path/to/theme", {
  allowPartial: false,
  requireDropReport: true,
});
// result: { ok, dir, errors, warnings, coverage, contrast, dropReport }
```

`lintThemeDir` is pure — no `process.exit`, no console output. The CLI maps its result to exit codes and printing.

## Shipped themes are conformance fixtures

Every theme under `examples/themes/*` must lint with zero errors — the test suite asserts this plainly, with no per-theme allowlist. A regression in a shipped theme, or an over-tight new check, fails the suite loudly. When this linter first ran against `brand-iron` it caught a real 2.8:1 cream-on-saffron text pair; the resolution was to fix the theme, not to whitelist the finding.
