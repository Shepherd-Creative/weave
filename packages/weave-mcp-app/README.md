# @shepherd-creative/weave-mcp-app

MCP App that renders Weave dashboards **inline in Claude Desktop**. Registers the five `render_*` tools (`render_dashboard`, `render_metric_band`, `render_chart_card`, `render_table_card`, `render_note_card`) plus `get_skill`, and serves a `ui://weave/mcp-app.html` View that renders each tool result with `weave-primitives`.

Private workspace package, not published. Built artefacts land in `dist/`:

- `dist/index.js` — self-contained stdio server bundle (esbuild)
- `dist/mcp-app.html` — single-file View bundle (vite-plugin-singlefile)
- `dist/weave-skill.md` — the composition skill served by `get_skill`

## Build

```bash
pnpm --filter @shepherd-creative/weave-mcp-app build
```

## Install in Claude Desktop

> **Pre-merge note:** while `feat/mcp-app-design-source` is unmerged, this package exists only in
> the worktree — use `/Users/pierregallet/Documents/weave-wt/mcp-app-design-source/packages/weave-mcp-app/dist/index.js`
> in the config below (and the worktree path for the `examples/themes/` env vars). After the PR
> merges, run `pnpm install && pnpm build` in the main clone and switch to the
> `/Users/pierregallet/Documents/weave/...` path, because worktree teardown will kill the old one.

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "weave": {
      "command": "node",
      "args": [
        "/Users/pierregallet/Documents/weave/packages/weave-mcp-app/dist/index.js",
        "--stdio"
      ]
    }
  }
}
```

Always point the config at the **pre-bundled** `dist/index.js`. Never point it at `tsx`: Claude Desktop's sandbox EPERMs the tsx loader fork on the second call (see HANDOFF.md, Failed Approaches). Restart Claude Desktop after every config change — it reads the file at launch only.

## Brand theming (design sources)

Two optional env vars, set in the config entry:

```json
{
  "mcpServers": {
    "weave": {
      "command": "node",
      "args": ["/Users/pierregallet/Documents/weave/packages/weave-mcp-app/dist/index.js", "--stdio"],
      "env": {
        "WEAVE_THEME_CSS_PATH": "/Users/pierregallet/Documents/weave/examples/themes/corporate-light/weave-theme.css",
        "WEAVE_DESIGN_GUIDANCE_PATH": "/Users/pierregallet/Documents/weave/examples/themes/corporate-light/DESIGN.md"
      }
    }
  }
}
```

- `WEAVE_THEME_CSS_PATH` — a brand stylesheet, validated then injected into the View so every rendered dashboard adopts the brand. Cap: 64 KiB.
- `WEAVE_DESIGN_GUIDANCE_PATH` — a plain-text composition brief appended to the `get_skill` output, steering what the LLM composes (density, chart choice, tone). Cap: 16 KiB.

Two ready-made demo brands live in [`examples/themes/`](../../examples/themes): `corporate-light` and `terminal-dense`.

### Theme-authoring rules

`validateThemeCss` accepts a **restricted subset** of CSS, nothing else:

- comments and `:root { ... }` blocks only; any other selector or at-rule is a hard reject;
- declarations must be custom properties (`--name: value;`);
- values must not contain `url(`, `expression(`, `javascript:`, `<`, `>` or any backslash (CSS ident-escapes are rejected outright — they can smuggle `url(` past a token denylist);
- only variable names in the [`weave-tokens` contract](../weave-tokens/README.md) are applied; unknown names are silently stripped (non-fatal).

### Diagnostics behaviour

Loading never throws and never blocks boot: on a missing file, an over-cap file or invalid CSS, the app falls back to default theming and writes one human-readable diagnostic line to **stderr** (stdout is the JSON-RPC channel in stdio mode). Check the MCP server logs in Claude Desktop's developer settings if a theme silently fails to apply.

## Manual verification checklist (Claude Desktop)

1. Build, then add the config block above **without** the `env` section. Restart Claude Desktop.
2. Open a fresh chat. Prompt tool-direct, never name the server (naming it triggers the connector-marketplace detour): *"call render_metric_band with two KPIs: revenue $248,500 up 14.2%, conversion 3.4%"*.
3. Expect an inline metric band in the chat, dark default theme.
4. Add the two `env` vars pointing at `examples/themes/corporate-light/`. Restart Claude Desktop.
5. Same prompt in a fresh chat: expect white cards, serif display numbers, navy accents.
6. Ask *"call get_skill"* and confirm the corporate-light composition brief is appended at the end.
7. Flip both paths to `examples/themes/terminal-dense/`. Restart Claude Desktop.
8. Same prompt: expect near-black, monospace, square corners, green/amber accents.
9. Break `WEAVE_THEME_CSS_PATH` (point it at a nonexistent file). Restart: rendering must still work on the default theme, with a diagnostic in the server log.

## Tests

```bash
pnpm --filter @shepherd-creative/weave-mcp-app test
```

- `server.e2e.test.ts` — scripted stdio MCP client against the built server
- `view.e2e.test.ts` — Playwright render proof of the built View, including brand-var injection
- `acceptance.e2e.test.ts` — one spec rendered under default + both demo brands, computed styles pairwise different, screenshots in `dist/acceptance/`
- `theme.test.ts` / `design-sources.test.ts` — validator and loader unit tests

Playwright downloads Chromium on first `pnpm install`; the e2e specs need the package built first (`turbo` orders this automatically via `pnpm test` at the root).

## Known limitations

- `render_dashboard` advertises an empty input schema in `tools/list` at SDK 1.29.0 (the lazy discriminated-union schema falls back to raw-schema validation at call time; revisit at SDK PR #1689).
- One theme per server process; no runtime switching (see `docs/future-directions/design-source-integration.md`).
