---
"@shepherd-creative/weave-primitives": minor
"@shepherd-creative/weave-skill": minor
"@shepherd-creative/weave-mcp-server": minor
"@shepherd-creative/weave-tokens": minor
---

First cut of Weave (`0.1.0`) published to GitHub Packages under the private
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
  `weave-primitives/schemas`.
- **`weave-tokens`** — opt-in default CSS variables for tone + chart palettes
  (hosts that already define their own `--tone-*` / `--chart-*` variables
  don't need to import this).

Six primitives (`Sparkline`, `ProgressBar`, `Badge`, `Divider`, `Comparison`,
plus `Spacer`) remain deferred to the B5 milestone. JSON-RPC MCP protocol
via `@modelcontextprotocol/sdk` is deferred to A6+; `0.1.0` ships the
minimal HTTP/JSON wire protocol.
