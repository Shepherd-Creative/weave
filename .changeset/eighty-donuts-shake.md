---
"@shepherd-creative/weave-primitives": minor
"@shepherd-creative/weave-skill": minor
"@shepherd-creative/weave-mcp-server": minor
---

Wave 1: a versioned, bounded document contract, validated once and shared by every surface.

**This is a breaking envelope change, released as a pre-1.0 minor.** Full contract, measured limits and migration guide: `docs/specs/weave-document-v1.md`.

- **`WeaveDocumentV1`.** A dashboard is now `{ weave: 1, root }`. `root` must be a layout (`Grid`, `Stack`) or a display organism (`MetricBand`, `ChartCard`, `TableCard`, `NoteCard`) — never an atom (F1), never a bare `DataRow` (F2), never a molecule. All of them stay legal *inside* a layout; only the root is restricted. Unknown envelope keys are rejected rather than stripped.
- **One validator, four surfaces.** `validateWeaveDocument()` applies payload-size, depth, node-count and nesting policy plus every cross-field rule, and the React renderer, HTTP REST, MCP JSON-RPC and the MCP App all go through it. F4 is closed: a direct `<Weave>` consumer is no longer relying on a transport that may not be there — and it is the only path that can carry `Infinity`, which JSON cannot express and `z.number()` accepts.
- **`DataRow` demoted to `TableCard` internals.** It left the `Spec` union; the union is 13 members → 12. Tables now require 1–7 headers, at most 40 rows, and **exactly one cell per header** — a ragged row is rejected rather than silently shifting every value into the wrong column.
- **Everything is bounded, from measurements.** Arrays, strings, chart series and chart points all have caps, each one set from `bench/document-limits.bench.mjs` rather than intuition. Non-finite numbers are rejected everywhere. Chart data keys must be the `categoryKey` or a declared `valueKey`.
- **Optional stable `id` on every node**, unique document-wide. Nothing consumes it yet; Wave 4's Tabs and Wave 5's action registry need a handle that survives a re-render, and retrofitting identity onto a shipped format costs far more than reserving it.
- **Legacy specs migrate through an explicit adapter.** `legacySpecToDocumentV1()` is exported and `@deprecated`, and `<Weave spec={…}>` still works by routing through it. **It wraps; it does not repair** — a legacy spec the old permissive union accepted but that is not a valid document still throws.
- **`render_dashboard` is discoverable again (F8).** Its input schema was the lazy `Spec` union, which has no `.shape`; the MCP Apps SDK normalises through `.shape` and shipped an **empty** schema, so the one tool that composes every other primitive told the model nothing. It is now a bounded object gateway, `{ root }`, whose advertised schema names exactly the six legal roots and whose runtime path is the canonical validator.
- **Wire formats carry documents.** REST responds `{ document }` (and **413** for an oversized payload); MCP JSON-RPC returns the document as `structuredContent`; the MCP App's three delivery channels become `structuredContent.document`, `_meta["weave/document"]` and the same fenced JSON block.
- **`react`, `react-dom`, `recharts` and `lucide-react` are optional peers.** Verified by inspecting the built entry points: `/schemas` resolves nothing but `zod` in ESM, CJS and types, so the document contract is usable in a service or CLI with no React installed. `zod` stays required.
- **The composition skill teaches the new contract**: the root rule, the table cardinality rule, the new caps, `DataRow`'s demotion, and a lone headline KPI travelling inside a one-child `Stack`.
