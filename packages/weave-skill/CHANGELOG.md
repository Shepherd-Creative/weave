# @shepherd-creative/weave-skill

## 0.2.0

### Minor Changes

- 4af676d: Proactive visuals guidance: render dashboards when an answer is data-shaped instead of waiting to be asked.

  The composition skill gains a "When to visualise unprompted" section (§1.1): render the moment an answer turns data-shaped, before committing it to prose. It carries a per-primitive threshold table, a litmus test (if your prose draft holds a markdown table or a list of figures, render it) and counter-heuristics that keep single scalars, prose questions and mid-conversation clarifications in chat. A closing note flags that host brand guidance may sharpen the thresholds at runtime. The section widens only _when_ the model reaches for Weave, never _what_ it may emit: the no-CSS, no-colours, no-pixels contract is restated, not relaxed.

  Each of the five `render_*` tool descriptions gains one proactive cue so the nudge also reaches a model that never calls `get_skill` (prefer `render_metric_band` over a prose list of three or more KPIs, `render_table_card` over a markdown table, `render_chart_card` when describing a trend and `render_dashboard` for a multi-dimensional status summary; `render_note_card` stays reserved for annotating a rendered dashboard rather than duplicating prose). Description text only, no schema or behaviour change.

### Patch Changes

- 7a71e41: Relicense under MIT (LICENSE file at the repository root; all package licence fields flipped from UNLICENSED).

## 0.1.0

### Minor Changes

- 8160736: First cut of Weave (`0.1.0`) published to GitHub Packages under the private
  `@shepherd-creative` scope.

  Shipped in this version:

  - **`weave-primitives`** — 13 primitives (atoms: `Number`, `Label`, `Icon`;
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

  > **Corrected 2026-08-07.** That roadmap did not survive portfolio review, and
  > the count was wrong: 13 primitives shipped, not 12 of 18. `Sparkline`,
  > `ProgressBar` and `Badge` are still planned. `Divider` and `Spacer` are
  > rejected — `Grid`/`Stack` gaps and density own whitespace, and semantic
  > sectioning becomes a `Section` organism. `Comparison` is deferred behind
  > unmet entry criteria; two `KPI`s in a `Stack` cover the need today.

## 0.0.0 (unreleased — B3)

- Initial `SKILL.md` — §1–§9 extracted from the Weave design doc `dashboard-composition-skill.md`.
- `NOTES.md` — §10+ design rationale, shipped with the package but not loaded into LLM context.
- `loadSkill()` / `skillPath()` — Node-only helpers to read the markdown at runtime.
