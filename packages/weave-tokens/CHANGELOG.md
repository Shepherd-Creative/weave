# @shepherd-creative/weave-tokens

## 0.2.0

### Minor Changes

- e3ec8e0: Contract v3: per-role font routing and numeric font features. `weave-tokens` adds `--weave-font-overline`, `--weave-font-numeric` and `--weave-font-feature-numeric` (defaults identical to the `--font-sans`/`--font-display`/`normal` literals they replace); `weave-primitives` routes Label, KPI, TableCard, Number, Stat and DataRow through the new variables, keeping the existing `font-variant-numeric: tabular-nums` baseline in place.
- e45c0eb: Design-source theming: contract v2 and var()-routed primitives.

  - `weave-tokens`: 50 new `--weave-*` variables covering typography scale and weights, spacing and density, card surfaces and chart treatment, each defaulting to the literal previously hard-coded in the components. Ships a machine-readable `tokens.json` manifest of the full token contract.
  - `weave-primitives`: every themeable inline-style literal in the 13 components now reads `var(--weave-*, <previous literal>)`; recharts props resolve variables at render time. Render-identical when no override is present.
  - `weave-mcp-server`: new `./tools` subpath export so embedders (the Weave MCP App) can register the render tools on their own server instance.

- 43dba25: New `./validate` export: the deterministic theme-CSS validator (`validateThemeCss`, `ThemeValidation`, `THEME_CSS_MAX_BYTES`, `GUIDANCE_MAX_BYTES`, `knownVarsFromManifest`) moves from `weave-mcp-app` into `weave-tokens`, so the contract package validates its own contract and other consumers (e.g. a lint CLI) can share the single implementation.

### Patch Changes

- 7a71e41: Relicense under MIT (LICENSE file at the repository root; all package licence fields flipped from UNLICENSED).

## 0.1.0

### Minor Changes

- 8160736: First cut of Weave (`0.1.0`) published to GitHub Packages under the private
  `@shepherd-creative` scope.

  Shipped in this version:

  - **`weave-primitives`** — 12 primitives (atoms: `Number`, `Label`, `Icon`;
    molecules: `KPI`, `Stat`, `DataRow`, `Chart`; organisms: `MetricBand`,
    `ChartCard`, `TableCard`, `NoteCard`; layouts: `Grid`, `Stack`) with Zod
    schemas and a recursive renderer. Container-query sizing + ellipsis
    safety on narrow cells.
  - **`weave-skill`** — `SKILL.md` v1 teaching LLMs how to compose dashboards
    from the primitives, plus a `loadSkill()` utility for embedding the skill
    content into a runtime system prompt.
  - **`weave-mcp-server`** — HTTP server on `:8787` exposing 5 render tools
    (`render_metric_band`, `render_chart_card`, `render_table_card`,
    `render_note_card`, `render_dashboard`) with Zod validation sourced from
    `weave-primitives/schemas`. Available over two wire protocols:
    - `POST /invoke/:name` — minimal REST/JSON (B3 legacy; kept for
      backwards compat, removed in B6).
    - `POST /mcp` — MCP JSON-RPC (Streamable HTTP transport, stateless).
      Works with any MCP client, including CopilotKit BuiltInAgent's
      `mcpServers` config.
  - **`weave-tokens`** — opt-in default CSS variables for tone + chart palettes
    (hosts that already define their own `--tone-*` / `--chart-*` variables
    don't need to import this).

  Six primitives (`Sparkline`, `ProgressBar`, `Badge`, `Divider`, `Comparison`,
  plus `Spacer`) remain deferred to the B5 milestone.

## 0.0.0 (unreleased — B3)

- Initial CSS variable surface: structural (shadcn-inherited), semantic tones (`--tone-*`), chart palette (`--chart-1..8`), and typography pass-throughs.
