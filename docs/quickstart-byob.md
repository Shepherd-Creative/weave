# Quickstart: bring your own brand

Go from a fresh clone to a dashboard themed to your brand, rendering inline in Claude Desktop, in about 15 minutes. You need a brand `DESIGN.md` (or a brand CSS / design-token file) as the input. You do not need to read any source.

The shape of it: build the MCP app, register it in Claude Desktop, confirm the default look renders, run the adapter to author a theme from your brand, gate the theme with the linter, switch to it and confirm your brand renders. Same dashboard spec throughout, only the theme changes.

## 1. Prerequisites

- Node >= 22 (`node --version`).
- pnpm 10 (`pnpm --version`; the repo pins `pnpm@10.33.0` via `packageManager`).
- Claude Desktop (macOS or Windows). The config path below is macOS; on Windows use `%APPDATA%\Claude\claude_desktop_config.json`.

## 2. Clone and build

```bash
git clone https://github.com/Shepherd-Creative/weave.git
cd weave
pnpm install
pnpm build
```

`pnpm build` produces the pre-bundled MCP app at `packages/weave-mcp-app/dist/index.js`, which is what Claude Desktop runs.

## 3. Register the MCP app in Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "weave": {
      "command": "node",
      "args": [
        "/absolute/path/to/weave/packages/weave-mcp-app/dist/index.js",
        "--stdio"
      ]
    }
  }
}
```

Replace `/absolute/path/to/weave` with your clone's path. From the repo root, this prints the exact string to paste:

```bash
echo "$(pwd)/packages/weave-mcp-app/dist/index.js"
```

Always point the config at the pre-bundled `dist/index.js`. Never point it at `tsx`: Claude Desktop's sandbox EPERMs the tsx loader fork on the second call. Restart Claude Desktop after every config change; it reads the file at launch only.

## 4. Confirm the default look

Open a fresh chat in Claude Desktop and prompt tool-direct. Do not name the server (naming it triggers the connector-marketplace detour):

> call render_metric_band with two KPIs: revenue $248,500 up 14.2%, conversion 3.4%

Expect an inline metric band in the dark default theme. If you see it, the app is wired up and rendering. If you do not, see Troubleshooting below.

## 5. Author a theme from your brand

The adapter is an LLM skill, not a script: mapping a brand onto the token contract (tone derivation, chart-ramp synthesis, font fallbacks) is a set of judgement calls. Point an agent at your brand source and let it author the theme.

- **In Claude Code (this repo):** the repo-level skill at [`.claude/skills/weave-theme-adapter`](../.claude/skills/weave-theme-adapter) triggers on prompts like *"create a weave theme from my DESIGN.md"*, *"adapt my brand"* or *"brand my dashboards"*. Give it your brand source.
- **Any other agent or harness:** feed it [`packages/weave-adapter-skill/SKILL.md`](../packages/weave-adapter-skill/SKILL.md) as a skill or system prompt, then give it your brand source.

The skill follows eight numbered steps and writes a theme directory under `examples/themes/<your-brand>/` containing:

- `weave-theme.css`: the brand mapped onto the Weave token contract, with `JUDGEMENT CALL` comments where it had to decide;
- `DESIGN.md`: a composition brief that steers density, chart choice and tone;
- `drop-report.json`: a record of what the brand had that could not travel through the restricted CSS subset, and why.

[`examples/themes/brand-iron/`](../examples/themes/brand-iron) is a real worked example of exactly this output.

## 6. Gate the theme

Run the linter until it exits 0:

```bash
node packages/weave-theme-cli/dist/cli.js lint examples/themes/<your-brand> --require-drop-report
```

Exit 0 means no errors. Errors are hard failures: an unknown variable, incomplete structural / tone / palette coverage, a text pair below the 3.0:1 contrast floor, an invalid or (with `--require-drop-report`) missing drop report. Fix the theme and re-run.

Warnings are the author's judgement, not blockers: a contrast pair below the 4.5:1 target, a chart colour that fades against the card. They never change the exit code. The shipped `brand-iron` theme passes with three contrast warnings and still exits 0. Keep iterating with the agent until the errors are gone.

## 7. Switch to your theme

```bash
node packages/weave-theme-cli/dist/cli.js use <your-brand>
```

`use` lints the theme again first and refuses to switch if it fails (pass `--force` to override), backs up the config before writing, then sets the two env vars that point the app at your theme. Restart Claude Desktop to apply; the config is read at launch only.

To go back to the packaged default at any time:

```bash
node packages/weave-theme-cli/dist/cli.js use --default
```

## 8. Confirm your brand

Open a fresh chat and run the same prompt as step 4:

> call render_metric_band with two KPIs: revenue $248,500 up 14.2%, conversion 3.4%

Expect the same data in your brand's look: your surfaces, your accent, your type. Ask *"call get_skill"* and confirm your `DESIGN.md` composition brief is appended at the end, which is what steers the agent's composition choices.

## Troubleshooting

- **The theme silently did not apply.** Loading never blocks boot: on a missing file, an over-cap file or invalid CSS, the app falls back to the default theme and writes one diagnostic line to stderr. Check the MCP server logs in Claude Desktop's developer settings (see [`packages/weave-mcp-app/README.md`](../packages/weave-mcp-app/README.md), Diagnostics behaviour).
- **A lint finding you do not understand.** Every finding has a code (`UNKNOWN_VARIABLE`, `COVERAGE_INCOMPLETE`, `CONTRAST_FAIL`, `DROP_REPORT_INVALID` and so on). The full vocabulary, coverage buckets and contrast thresholds are in [`packages/weave-theme-cli/README.md`](../packages/weave-theme-cli/README.md).
- **`use` says it cannot find the theme or the config.** `<your-brand>` is looked up under `examples/themes/`; a value with a slash is treated as a directory path. A missing `mcpServers.weave` entry means step 3 has not been done yet.
