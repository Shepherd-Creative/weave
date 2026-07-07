# @shepherd-creative/weave-theme-cli

## 0.2.0

### Minor Changes

- 87eda9f: `weave-theme list` and `weave-theme use`: switch Claude Desktop's brand theme with one command instead of hand-editing `claude_desktop_config.json`. `list` enumerates theme directories with a coverage summary, drop-report presence and an active marker (`--json` for a stable array shape). `use <name|path>` lints the theme first (refusing on errors unless `--force`, leaving the config untouched), then sets `mcpServers.<name>.env.WEAVE_THEME_CSS_PATH` / `.WEAVE_DESIGN_GUIDANCE_PATH` as a lossless parse/serialise round-trip (every other key survives untouched), backing up the config to `<path>.bak-<timestamp>` before every write. `use --default` restores the packaged default theme. Both commands resolve `--themes-dir` from `examples/themes/` by walking up for `pnpm-workspace.yaml`, or `$WEAVE_THEMES_DIR` outside this repo.
- 8305b52: New package: `weave-theme`, a deterministic authoring-time lint gate for Weave theme directories. `weave-theme lint <themeDir>` closes the fidelity gaps `validateThemeCss` deliberately leaves open at runtime: unknown variables become hard errors (with a did-you-mean suggestion) instead of being silently stripped, structural/tone/palette coverage must be complete and WCAG contrast is checked across the structural, tone and chart-palette pairs. Also validates an optional `drop-report.json` (the design-source adapter's record of what it dropped and why) against a schema. Supports `--json`, `--allow-partial` (downgrade coverage findings to warnings) and `--require-drop-report` (escalate a missing drop report to an error). Exports `lintThemeDir` from `./lint` for programmatic use.

### Patch Changes

- bbfc278: Public-facing documentation pass ahead of the open-source release: reword shipped docs (README.md, SKILL.md) to drop em dashes and Oxford commas and tidy the copy. No code or behaviour change.
- 7a71e41: Relicense under MIT (LICENSE file at the repository root; all package licence fields flipped from UNLICENSED).
- Updated dependencies [e3ec8e0]
- Updated dependencies [e45c0eb]
- Updated dependencies [43dba25]
- Updated dependencies [7a71e41]
  - @shepherd-creative/weave-tokens@0.2.0
