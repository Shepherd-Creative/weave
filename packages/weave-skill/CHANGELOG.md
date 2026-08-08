# @shepherd-creative/weave-skill

## 0.3.0

### Minor Changes

- 21ab2a1: Wave 1: a versioned, bounded document contract, validated once and shared by every surface.

  **This is a breaking envelope change, released as a pre-1.0 minor.** Full contract, measured limits and migration guide: `docs/specs/weave-document-v1.md`.

  - **`WeaveDocumentV1`.** A dashboard is now `{ weave: 1, root }`. `root` must be a layout (`Grid`, `Stack`) or a display organism (`MetricBand`, `ChartCard`, `TableCard`, `NoteCard`) — never an atom (F1), never a bare `DataRow` (F2), never a molecule. All of them stay legal _inside_ a layout; only the root is restricted.
  - **Unknown keys are rejected, not stripped — at every level.** The envelope, every node, and every nested object inside a node (table headers, table cells, KPI deltas, sparkline configs) are closed. This is a limits rule, not a tidiness one: Zod's default `z.object()` drops an undeclared key _after_ receiving it, so a field nobody declared could carry 300 KB of string or a million-element array, be walked in full, and then be deleted before anything weighed it — the document looked bounded because the evidence had been thrown away. The one shape that stays open is a chart's `data` records, whose keys are the caller's own series names; they remain bounded in key count, key length and value type, and must match the declared `categoryKey`/`valueKeys`.
  - **One validator, four surfaces.** `validateWeaveDocument()` applies payload-size, depth, node-count, nesting and traversal policy plus every cross-field rule, and the React renderer, HTTP REST, MCP JSON-RPC and the MCP App all go through it. F4 is closed: a direct `<Weave>` consumer is no longer relying on a transport that may not be there — and it is the only path that can carry `Infinity`, which JSON cannot express and `z.number()` accepts.
  - **`DataRow` demoted to `TableCard` internals.** It left the `Spec` union; the union is 13 members → 12. Tables now require 1–7 headers, at most 40 rows, and **exactly one cell per header** — a ragged row is rejected rather than silently shifting every value into the wrong column.
  - **Everything is bounded, from measurements.** Arrays, strings, chart series and chart points all have caps, each one set from `bench/document-limits.bench.mjs` rather than intuition. Non-finite numbers are rejected everywhere. Chart data keys must be the `categoryKey` or a declared `valueKey`. A new `values` cap (300,000) bounds the structural walk itself — `nodes` counts objects, so it saw nothing in an array of scalars; `values` counts every array element and object property, and sits above the values-maximising legal document (260,816, measured).
  - **A fixed tool's root cannot be overridden by its arguments.** `render_note_card` and the other single-root tools stamp their advertised `type` last, so a body carrying `{"type":"Stack", …}` is refused instead of rendering a Stack. The old order let the caller win, and REST never parsed `inputSchema` at all — so the advertised contract held only on surfaces whose SDK happened to strip the extra key first.
  - **Payload budgets are spent at ingress, on all three wire surfaces.** REST checks the raw body before `JSON.parse`; `/mcp` streams the body with a byte counter and answers **413** before the MCP SDK parses it; the MCP App frames stdin so no single newline-delimited message exceeds the budget. Previously only REST had a real ingress guard: the other two measured the _constructed_ candidate document, i.e. what survived the SDK dropping every undeclared key, so a request could carry a megabyte of discarded argument and be measured at a few hundred bytes.
  - **Optional stable `id` on every node**, unique document-wide. Nothing consumes it yet; Wave 4's Tabs and Wave 5's action registry need a handle that survives a re-render, and retrofitting identity onto a shipped format costs far more than reserving it.
  - **Legacy specs migrate through an explicit adapter.** `legacySpecToDocumentV1()` is exported and `@deprecated`, and `<Weave spec={…}>` still works by routing through it. **It wraps; it does not repair** — a legacy spec the old permissive union accepted but that is not a valid document still throws.
  - **`render_dashboard` is discoverable again (F8).** Its input schema was the lazy `Spec` union, which has no `.shape`; the MCP Apps SDK normalises through `.shape` and shipped an **empty** schema, so the one tool that composes every other primitive told the model nothing. It is now a bounded object gateway, `{ root }`, whose advertised schema names exactly the six legal roots and whose runtime path is the canonical validator.
  - **Wire formats carry documents.** REST responds `{ document }` (and **413** for an oversized payload); MCP JSON-RPC returns the document as `structuredContent` (and **413** for an oversized request); the MCP App's three delivery channels become `structuredContent.document`, `_meta["weave/document"]` and the same fenced JSON block.
  - **`react`, `react-dom`, `recharts` and `lucide-react` are optional peers.** Verified by inspecting the built entry points: `/schemas` resolves nothing but `zod` in ESM, CJS and types, so the document contract is usable in a service or CLI with no React installed. `zod` stays required.
  - **The composition skill teaches the new contract**: the root rule, the table cardinality rule, the new caps, `DataRow`'s demotion, and a lone headline KPI travelling inside a one-child `Stack`.

- 0568b4f: Wave 0: make the public claims true, and guard them with tests.

  - **Removed the misleading `0.0.0` version constants.** `WEAVE_PRIMITIVES_VERSION`,
    `WEAVE_SKILL_VERSION` and `WEAVE_MCP_SERVER_VERSION` were hard-coded literals
    that never tracked the published package versions (0.2.0, 0.2.0 and 0.1.2 at
    the time of removal). They are gone rather than re-derived: package metadata
    is already the source of truth, and a constant that restates it only drifts.
    Read `version` from `package.json` if you need it.
  - **`weave-skill`: no primitive is recommended that does not exist.** The
    two-KPI guidance recommended a `Comparison` primitive that was never built;
    it now recommends the `Stack` of two `KPI`s that actually works. The
    forthcoming list drops `Divider` and `Comparison` and keeps only `Sparkline`,
    `ProgressBar` and `Badge`.
  - **`weave-mcp-server`: no tool is advertised that this surface does not
    register, and the guidance it points at is reachable.** `render_dashboard`'s
    description told models to "call get_skill", a tool only the MCP App
    registers. The REST and MCP JSON-RPC surfaces now point at `GET /skill.md`,
    which this server really serves, **and the composition guide is registered as
    the MCP resource `weave://skill.md`** so a JSON-RPC client — which has no
    base URL to resolve a relative route against — can read it over the protocol
    it speaks. The server therefore advertises the `resources` capability. The
    shared `TOOLS` descriptors stay transport-neutral so embedders cannot inherit
    a false pointer. New exports: `SKILL_ENDPOINT_HINT`, `SKILL_RESOURCE_URI` and
    `describeForHttpSurface`.
  - **Documentation reconciled with the code.** The primitives README claimed
    "12 of 18 primitives" against a Spec union of 13. Catalogue, count and
    roadmap claims are now asserted against the union and package metadata by
    tests, so they fail loudly instead of rotting.

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
