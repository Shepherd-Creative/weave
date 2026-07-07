# @shepherd-creative/weave-primitives

## 0.2.0

### Minor Changes

- e3ec8e0: Contract v3: per-role font routing and numeric font features. `weave-tokens` adds `--weave-font-overline`, `--weave-font-numeric` and `--weave-font-feature-numeric` (defaults identical to the `--font-sans`/`--font-display`/`normal` literals they replace); `weave-primitives` routes Label, KPI, TableCard, Number, Stat and DataRow through the new variables, keeping the existing `font-variant-numeric: tabular-nums` baseline in place.
- e45c0eb: Design-source theming: contract v2 and var()-routed primitives.

  - `weave-tokens`: 50 new `--weave-*` variables covering typography scale and weights, spacing and density, card surfaces and chart treatment, each defaulting to the literal previously hard-coded in the components. Ships a machine-readable `tokens.json` manifest of the full token contract.
  - `weave-primitives`: every themeable inline-style literal in the 13 components now reads `var(--weave-*, <previous literal>)`; recharts props resolve variables at render time. Render-identical when no override is present.
  - `weave-mcp-server`: new `./tools` subpath export so embedders (the Weave MCP App) can register the render tools on their own server instance.

### Patch Changes

- 7a71e41: Relicense under MIT (LICENSE file at the repository root; all package licence fields flipped from UNLICENSED).

## 0.1.1

### Patch Changes

- 8de1df0: F1 hardening: switch `SpecSchema` from `z.union([...13])` to `z.discriminatedUnion("type", [...13])` and add a depth cap on `render_dashboard`.

  - **Primitives** — `SpecSchema` now branches on the `type` literal, collapsing parse cost from O(13^N) to O(N) on nested Grid/Stack trees. Depth-20 inputs that previously OOM'd the Node process parse in <1 ms.
  - **MCP server** — `invokeTool` rejects `render_dashboard` payloads with nested Grid/Stack depth > 6 via a new `DepthLimitError` (HTTP 400 on the REST path; MCP `isError: true` on the JSON-RPC path). Belt-and-braces against future Zod regressions and misbehaving clients.

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

- Initial cut: 12 of 18 primitives.
  - Atoms: `Number`, `Label`, `Icon`.
  - Molecules: `KPI`, `Stat`, `DataRow`, `Chart`.
  - Organisms: `MetricBand`, `ChartCard`, `TableCard`, `NoteCard`.
  - Layouts: `Grid`, `Stack`.
- Zod schemas in `./schemas` — single source of truth shared with `@shepherd-creative/weave-mcp-server`.
- `<Weave spec={...} />` recursive dispatcher with spec validation.
- Recharts integration via `resolveCSSVar()` helper — charts inherit `--chart-N` from the host theme.
- Theme-neutral: every colour → CSS var, every size → semantic token.
- Sparkline prop accepted on KPI but not rendered (Sparkline atom lands in B5).
