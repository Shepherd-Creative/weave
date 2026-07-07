# @shepherd-creative/weave-mcp-server

## 0.1.2

### Patch Changes

- e45c0eb: Design-source theming: contract v2 and var()-routed primitives.

  - `weave-tokens`: 50 new `--weave-*` variables covering typography scale and weights, spacing and density, card surfaces and chart treatment, each defaulting to the literal previously hard-coded in the components. Ships a machine-readable `tokens.json` manifest of the full token contract.
  - `weave-primitives`: every themeable inline-style literal in the 13 components now reads `var(--weave-*, <previous literal>)`; recharts props resolve variables at render time. Render-identical when no override is present.
  - `weave-mcp-server`: new `./tools` subpath export so embedders (the Weave MCP App) can register the render tools on their own server instance.

- 7a71e41: Relicense under MIT (LICENSE file at the repository root; all package licence fields flipped from UNLICENSED).
- 4af676d: Proactive visuals guidance: render dashboards when an answer is data-shaped instead of waiting to be asked.

  The composition skill gains a "When to visualise unprompted" section (§1.1): render the moment an answer turns data-shaped, before committing it to prose. It carries a per-primitive threshold table, a litmus test (if your prose draft holds a markdown table or a list of figures, render it) and counter-heuristics that keep single scalars, prose questions and mid-conversation clarifications in chat. A closing note flags that host brand guidance may sharpen the thresholds at runtime. The section widens only _when_ the model reaches for Weave, never _what_ it may emit: the no-CSS, no-colours, no-pixels contract is restated, not relaxed.

  Each of the five `render_*` tool descriptions gains one proactive cue so the nudge also reaches a model that never calls `get_skill` (prefer `render_metric_band` over a prose list of three or more KPIs, `render_table_card` over a markdown table, `render_chart_card` when describing a trend and `render_dashboard` for a multi-dimensional status summary; `render_note_card` stays reserved for annotating a rendered dashboard rather than duplicating prose). Description text only, no schema or behaviour change.

- Updated dependencies [e3ec8e0]
- Updated dependencies [e45c0eb]
- Updated dependencies [7a71e41]
- Updated dependencies [4af676d]
  - @shepherd-creative/weave-primitives@0.2.0
  - @shepherd-creative/weave-skill@0.2.0

## 0.1.1

### Patch Changes

- 8de1df0: F1 hardening: switch `SpecSchema` from `z.union([...13])` to `z.discriminatedUnion("type", [...13])` and add a depth cap on `render_dashboard`.

  - **Primitives** — `SpecSchema` now branches on the `type` literal, collapsing parse cost from O(13^N) to O(N) on nested Grid/Stack trees. Depth-20 inputs that previously OOM'd the Node process parse in <1 ms.
  - **MCP server** — `invokeTool` rejects `render_dashboard` payloads with nested Grid/Stack depth > 6 via a new `DepthLimitError` (HTTP 400 on the REST path; MCP `isError: true` on the JSON-RPC path). Belt-and-braces against future Zod regressions and misbehaving clients.

- Updated dependencies [8de1df0]
  - @shepherd-creative/weave-primitives@0.1.1

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

### Patch Changes

- Updated dependencies [8160736]
  - @shepherd-creative/weave-primitives@0.1.0
  - @shepherd-creative/weave-skill@0.1.0

## 0.0.0 (unreleased — B3)

- Minimal HTTP/JSON server on port 8787 via Hono + @hono/node-server.
- 5 tools: `render_metric_band`, `render_chart_card`, `render_table_card`, `render_note_card`, `render_dashboard`.
- Input schemas imported from `@shepherd-creative/weave-primitives/schemas` — no parallel schema maintenance.
- `GET /tools` returns Zod-derived JSON Schema manifests (via `zod-to-json-schema`).
- `GET /skill.md` serves the bundled `@shepherd-creative/weave-skill` content.
- CORS restricted to `http://localhost:3000` in dev by default.
- Proper MCP protocol (JSON-RPC over SSE / stdio) deferred to A6+.
- 11 unit tests green.
