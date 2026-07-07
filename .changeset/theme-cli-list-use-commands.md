---
"@shepherd-creative/weave-theme-cli": minor
---

`weave-theme list` and `weave-theme use` — switch Claude Desktop's brand theme with one command instead of hand-editing `claude_desktop_config.json`. `list` enumerates theme directories with a coverage summary, drop-report presence and an active marker (`--json` for a stable array shape). `use <name|path>` lints the theme first — refusing on errors unless `--force`, leaving the config untouched — then sets `mcpServers.<name>.env.WEAVE_THEME_CSS_PATH` / `.WEAVE_DESIGN_GUIDANCE_PATH` as a lossless parse/serialise round-trip (every other key survives untouched), backing up the config to `<path>.bak-<timestamp>` before every write. `use --default` restores the packaged default theme. Both commands resolve `--themes-dir` from `examples/themes/` by walking up for `pnpm-workspace.yaml`, or `$WEAVE_THEMES_DIR` outside this repo.
