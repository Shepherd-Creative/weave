---
"@shepherd-creative/weave-theme-cli": minor
---

New package: `weave-theme` — a deterministic authoring-time lint gate for Weave theme directories. `weave-theme lint <themeDir>` closes the fidelity gaps `validateThemeCss` deliberately leaves open at runtime: unknown variables become hard errors (with a did-you-mean suggestion) instead of being silently stripped, structural/tone/palette coverage must be complete, and WCAG contrast is checked across the structural, tone and chart-palette pairs. Also validates an optional `drop-report.json` (the design-source adapter's record of what it dropped and why) against a schema. Supports `--json`, `--allow-partial` (downgrade coverage findings to warnings) and `--require-drop-report` (escalate a missing drop report to an error). Exports `lintThemeDir` from `./lint` for programmatic use.
