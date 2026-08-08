# WeaveDocumentV1 — contract, limits and migration

**Status:** shipped in Wave 1 of the primitive-portfolio programme. Pre-1.0, so this is a **minor** release with a breaking envelope change and a documented deprecation path.

Wave 1 turned the permissive node union into a versioned, bounded document boundary. This document is the contract, the evidence behind every limit, and the migration guide.

---

## 1. The contract

A Weave document is:

```json
{
  "weave": 1,
  "root": { "type": "Stack", "children": [ … ] }
}
```

- `weave` — the format version. An integer, not the package version. A build that does not implement a version refuses the document rather than guessing.
- `root` — one of **six** node types: `Grid`, `Stack` (layouts) or `MetricBand`, `ChartCard`, `TableCard`, `NoteCard` (display organisms).

Unknown top-level keys are **rejected**, not stripped. A caller who sends `onLoad` believes this format does something it does not, and silently dropping it hides that.

### What may no longer be a root

| Type | Why |
|---|---|
| `Number`, `Label`, `Icon` | Atoms. A bare atom was a legal "dashboard" before Wave 1 (F1). |
| `DataRow` | Table-internal. As a root it rendered a `<tr>` with no `<table>` around it (F2). |
| `KPI`, `Stat`, `Chart` | Molecules — building blocks. A bare `Chart` has no title, which SKILL.md §6 forbids outright. |

**All of them remain legal inside a layout.** Only the root is restricted. `Stack > Label` is still the prescribed way to frame a section (SKILL.md §5.1), and a lone headline KPI is still the right answer to a single-scalar question — it now travels inside a one-child `Stack`. `size: "xl"` stays legal there: §6 forbids `xl` only in a container *with siblings*.

`DataRow` is the one exception: it left the `Spec` union entirely and is reachable only through `TableCard.rows`.

### Where each rule lives

Three layers, and the split is forced rather than stylistic:

| Layer | Rules | Enforced by |
|---|---|---|
| **Structural bounds** | array lengths, string lengths, finite numbers, enums | the leaf schemas — so they hold wherever a schema is used |
| **Cost policy** | payload bytes, container depth, object count, raw nesting | `validateWeaveDocument`, *before* Zod sees the input |
| **Cross-field rules** | one cell per header, chart keys matching declared series, document-wide unique ids | `validateWeaveDocument`, as Zod issues on the envelope |

Cross-field rules cannot live in the leaf schemas. Zod 3's `discriminatedUnion` requires every member to be a `ZodObject`; `.superRefine()` yields a `ZodEffects`, which the union rejects **at construction time**. Measured on zod 3.25.76:

```
z.discriminatedUnion("type", [z.object({…}).superRefine(…), …])
→ TypeError: Cannot read properties of undefined (reading 'type')
```

The consequence is worth stating plainly: `TableCardSchema.parse()` on its own checks header and row *counts* but not raggedness. `validateWeaveDocument` is the contract; the leaf schemas are shape reference. Every surface — React, REST, MCP JSON-RPC, the MCP App — goes through the validator.

### Errors

| Thrown | When |
|---|---|
| `z.ZodError` | shape, bounds, root membership, or a cross-field rule |
| `WeaveDocumentError` | payload / depth / nodes / nesting policy, malformed JSON, or a misused adapter. Carries a `code`. |

Both are input errors. REST maps `code: "payload"` to **413** and everything else to **400**.

---

## 2. The limits, and the evidence for them

Run `node packages/weave-primitives/bench/document-limits.bench.mjs`. It builds unbounded mirrors of the shipped shapes on purpose — the evidence for a cap is what happens *past* it, and the shipped schemas short-circuit there.

Recorded run, Node v22.23.2, zod 3.25.76, Apple silicon:

| Axis | 
|---|
| **Chart points** (1 series): 10 → 0.066 ms · 200 → 0.392 ms / 6,464 B · 1,000 → 0.866 ms · 5,000 → 4.444 ms / 172,864 B |
| **Chart series** (100 points): 8 → 0.193 ms / 8,318 B · 16 → 0.491 ms · 64 → 1.391 ms / 67,632 B |
| **Table rows** (4 cells): 40 → 0.436 ms / 10,806 B · 1,000 → 2.587 ms · 5,000 → 14.229 ms / 1,347,966 B |
| **String length**: flat 0.001 ms at every size from 200 to 1,000,000 chars — Zod does not scan a string, so this axis costs **payload and render**, never parse |
| **Sparkline points**: 100 → 0.011 ms · 10,000 → 0.428 ms / 48,948 B |
| **Total nodes** (flat): 500 → 0.284 ms · 1,000 → 0.502 ms · 5,000 → 2.910 ms / 263,930 B |
| **Nesting depth**: 6 → 0.007 ms · 100 → 0.202 ms — cheap since F1 moved the union to `discriminatedUnion`, so `depth` is a *contract* cap, not a cost one |

Two whole-document measurements anchor the global caps:

| Document | objects | bytes | verdict |
|---|---|---|---|
| Busiest dashboard anyone would compose — 8 widgets, 4 charts at the point cap, 2 full tables | 1,473 | 47,596 | **accepted** |
| Every per-axis cap at its maximum, simultaneously | 2,158 | 126,048 | **accepted** |

### The caps

| Cap | Value | Why this number |
|---|---|---|
| `payloadBytes` | 262,144 | 5.5× the realistic dashboard, 2.1× the all-axes-maxed one. Checked in **UTF-8 bytes**: `€` is one UTF-16 code unit and three bytes, so a `.length` check would admit three times the cap. |
| `depth` | 6 | Unchanged from the already-shipped `render_dashboard` cap. SKILL.md's worked examples reach 3. |
| `nodes` | 3,000 | Above the all-axes-maxed shape (2,158), so the per-axis caps stay honest. It bites on the *multiplicative* case the per-axis caps miss: 12 children × 6 levels of nesting is tens of thousands of objects with every individual axis legal. |
| `nesting` | 40 | Not a contract cap — a stack-overflow guard. A chain of 20,000 ordinary objects would otherwise raise a `RangeError` from the walk itself, escaping as a 500 rather than a clean rejection. A depth-6 document nests about 20. |
| `text` | 200 chars | Labels, titles, captions, headers, cells. Zero parse cost; the axis is payload and layout. |
| `body` | 4,000 chars | NoteCard prose — roughly two pages. |
| `layoutChildren` | 12 | SKILL.md §5.2 already calls 6+ widgets a "data-dense view". |
| `tableHeaders` | 7 | Already stated in SKILL.md §5.7 and §8.4. |
| `tableRows` | 40 | Already stated in SKILL.md §5.7. 5,000 rows costs 14.2 ms and 1.3 MB. |
| `chartPoints` | 200 | 0.39 ms / 6.5 KB. Beyond this a dashboard-width chart is sub-pixel per point. |
| `chartSeries` | 8 | SKILL.md §6 already forbids more than 8 ("the eye can't track more"). |
| `sparklinePoints` | 100 | A sparkline is ~100 px wide. More than one point per pixel is not drawable. |
| `chartKeyText` | 64 chars | |
| `localeText` | 35 chars | BCP-47 practical maximum. |
| `nodeId` | 64 chars | |

**Non-finite numbers are rejected everywhere.** `z.number()` rejects `NaN` but **accepts `Infinity`** (measured on zod 3.25.76). JSON cannot carry it, so the transports are not a backstop — but the direct `<Weave>` path takes in-memory objects, where it reaches the DOM as the literal string `"Infinity"`.

### Where payload size is *not* checked

`validateWeaveDocument` does not measure bytes. It takes an object; measuring would mean serialising a document nobody asked to serialise, on every React render.

Bytes are checked where a payload actually exists:

- **REST** reads the body as text and checks it **before** `JSON.parse`, so an oversized body is refused without being materialised.
- **MCP JSON-RPC and the MCP App** never expose the raw body — the SDK has already parsed it — so `invokeTool` serialises the candidate document and checks that. Safe because the structural walk has already bounded node count and nesting by then.
- **Direct `<Weave>`** has no payload. Node count, nesting and bounded string fields are what constrain it, and they are enforced identically.

---

## 3. Migration

### React

```diff
- <Weave spec={{ type: "Stack", children: [ … ] }} />
+ <Weave document={{ weave: 1, root: { type: "Stack", children: [ … ] } }} />
```

The `spec` prop still works and is `@deprecated`. It calls the exported adapter:

```ts
import { legacySpecToDocumentV1 } from "@shepherd-creative/weave-primitives/schemas";

const document = legacySpecToDocumentV1(bareSpec);
```

**The adapter wraps; it does not repair.** A legacy spec the old permissive union accepted but that is not a valid document — a bare atom, a bare `DataRow`, a ragged table, an over-long body — throws. That is deliberate: silently making malformed input render is how a contract stops being one. It also refuses to double-wrap something that is already a document, rather than building `{root: {weave: 1, …}}` and failing with a confusing discriminator error.

A lone KPI migrates by gaining a container:

```diff
- { "type": "KPI", "label": "Active campaigns", "value": 12, "size": "xl" }
+ { "weave": 1, "root": { "type": "Stack", "children": [
+     { "type": "KPI", "label": "Active campaigns", "value": 12, "size": "xl" }
+ ] } }
```

### HTTP REST

`POST /invoke/:name` now responds `{ document }` instead of `{ spec }`:

```diff
- { "spec": { "type": "MetricBand", "items": [ … ] } }
+ { "document": { "weave": 1, "root": { "type": "MetricBand", "items": [ … ] } } }
```

`render_dashboard` takes its root under a `root` key:

```diff
- POST /invoke/render_dashboard  { "type": "Grid", "children": [ … ] }
+ POST /invoke/render_dashboard  { "root": { "type": "Grid", "children": [ … ] } }
```

New status code: **413** for a payload over the byte cap. Everything else that was 400 is still 400.

### MCP JSON-RPC

`tools/call` returns the document as `structuredContent` and as the stringified `content[0].text`:

```diff
- structuredContent: { "type": "MetricBand", … }
+ structuredContent: { "weave": 1, "root": { "type": "MetricBand", … } }
```

### MCP App

All three delivery channels carry the document (the three exist because hosts differ in what they forward — Claude Desktop was observed stripping `structuredContent` on 2026-07-07):

| Channel | Before | After |
|---|---|---|
| structured | `structuredContent.spec` | `structuredContent.document` |
| meta | `_meta["weave/spec"]` | `_meta["weave/document"]` |
| fenced text | ` ```json ` block, `Weave <tool> spec:` | same block, `Weave <tool> document:` |

`outputSchema` advertises `document` rather than `spec`. The view's dev harness takes `?document=<base64>` instead of `?spec=`.

### `render_dashboard` discoverability (F8)

Its input schema was `SpecSchema` — a `z.lazy()` union with no `.shape`. The MCP Apps SDK normalises through `.shape` and falls back to an **empty schema**, so the one tool that composes every other primitive told the model nothing about its input.

It is now a bounded object gateway, `z.object({ root: RootSpecSchema })`. Every surface can project it, the advertised schema names exactly the six legal roots, and the runtime path still validates the whole document through `validateWeaveDocument` with no key stripping.

---

## 4. Packaging: schemas without a renderer

`react`, `react-dom`, `recharts` and `lucide-react` are now marked `peerDependenciesMeta: { optional: true }`. `zod` is not — every schema in the package is a zod schema.

Verified by inspecting the built entry points, not assumed:

| Entry | Externals resolved |
|---|---|
| `dist/schemas/index.js` | `zod` |
| `dist/schemas/index.cjs` | `zod` |
| `dist/schemas/index.d.ts` | `zod` |
| `dist/index.js` | `react`, `react/jsx-runtime`, `recharts`, `lucide-react`, `zod` |

So `import { … } from "@shepherd-creative/weave-primitives/schemas"` is usable in a Node service, a worker or a CLI with no React installed. `src/__tests__/packaging.test.ts` guards the source-level property that keeps this true; the built-output inspection above is the one-time evidence for the claim itself.

---

## 5. Deprecation timetable

| Surface | Status | Removed |
|---|---|---|
| `<Weave spec={…}>` | deprecated, works, validates canonically | a future wave, once in-repo consumers have moved |
| `legacySpecToDocumentV1` | supported for the migration period | with the `spec` prop |
| `{ spec }` REST response | **removed now** | — |
| `structuredContent.spec` / `_meta["weave/spec"]` | **removed now** | — |

The response-shape changes are immediate because they are wire formats with no in-the-wild consumers yet (B3 pre-release, not published to npm). The React prop keeps a deprecation period because it is the surface a host application would already be calling.
