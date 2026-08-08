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

Unknown keys are **rejected, not stripped — at every level**: the envelope, every node, every nested object inside a node (table headers, table cells, KPI deltas, sparkline configs), and the **tool argument objects** the MCP surfaces take. A caller who sends `onLoad` believes this format does something it does not, and silently dropping it hides that.

The tool arguments are worth naming separately, because they were the last level to be closed and the easiest to overlook. Four of the five tools take arguments that *are* a node, so an undeclared key met a strict node schema on its way through. `render_dashboard` takes the gateway object instead — see [`render_dashboard` discoverability](#render_dashboard-discoverability-f8) — and until it was made `.strict()` an undeclared key there met nothing at all.

The reason this is a contract rule rather than a tidiness preference is that stripping *defeated the limits*. Zod's default `z.object()` drops an unknown key **after** receiving it, so an undeclared field could carry anything — 300 KB of string, a million-element array — be walked in full, and then be deleted before anyone weighed it. The document then looked bounded precisely because the evidence had been thrown away.

**One shape stays open, and only one:** a chart's `data` records are a `z.record()`, because a series is named by the caller — `"gross margin %"` is data, not schema. Their keys are bounded in count (≤ `chartSeries` + 1) and length (`chartKeyText`), their values must be finite numbers or bounded strings, and the validator additionally requires every key to be the declared `categoryKey` or one of `valueKeys`. Anything added to the contract later should be closed unless it can make the same argument.

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
| **Structural bounds** | array lengths, string lengths, finite numbers, enums, unknown keys | the leaf schemas — so they hold wherever a schema is used |
| **Cost policy** | payload bytes, container depth, object count, raw nesting, values traversed | `validateWeaveDocument`, *before* Zod sees the input |
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
| `WeaveDocumentError` | payload / depth / nodes / nesting / values policy, malformed JSON, or a misused adapter. Carries a `code`. |

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

| Document | objects | values | bytes | verdict |
|---|---|---|---|---|
| Busiest dashboard anyone would compose — 8 widgets, 4 charts at the point cap, 2 full tables | 1,473 | 4,435 | 47,596 | **accepted** |
| Every per-axis cap at its maximum, simultaneously | 2,158 | 12,189 | 126,048 | **accepted** |
| The **values-maximising** legal document — 9 tables of sparkline cells | 2,954 | 260,816 | 818,256 | **accepted** |
| …and a tenth table | 3,282 | 289,795 | 909,168 | rejected (`nodes`) |

The third row is what sets `values`. "Objects" and "values" diverge sharply because a sparkline cell is one object carrying 100 scalar leaves, so the shape that maximises objects is not the shape that maximises traversal. A cap read off the all-axes-maxed document (12,189) would have refused an ordinary nine-table dashboard.

### The caps

| Cap | Value | Why this number |
|---|---|---|
| `payloadBytes` | 262,144 | 5.5× the realistic dashboard, 2.1× the all-axes-maxed one. Checked in **UTF-8 bytes**: `€` is one UTF-16 code unit and three bytes, so a `.length` check would admit three times the cap. |
| `depth` | 6 | Unchanged from the already-shipped `render_dashboard` cap. SKILL.md's worked examples reach 3. |
| `nodes` | 3,000 | Above the all-axes-maxed shape (2,158), so the per-axis caps stay honest. It bites on the *multiplicative* case the per-axis caps miss: 12 children × 6 levels of nesting is tens of thousands of objects with every individual axis legal. |
| `values` | 300,000 | Every array element and object property the structural walk visits, scalars included. `nodes` counts objects only, so it says nothing about an array of scalars — an undeclared field holding a million zeros was walked in full before anything refused it. Above the values-maximising legal document (260,816), which is the largest `nodes` admits. |
| `nesting` | 40 | Not a contract cap — a stack-overflow guard. A deep chain of raw **arrays** would otherwise raise a `RangeError` from the walk itself, escaping as a 500 rather than a clean rejection: arrays are not counted as nodes and cost one value per level, so `nodes` and `values` are both blind to them and this is the only cap that bounds the recursion. (A chain of plain *objects* is stopped by `nodes` at 3,000 first, so it never reaches the overflow.) A depth-6 document nests about 20. |
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

### Where payload size is checked, and where it is not

`validateWeaveDocument` does not measure bytes. It takes an object; measuring would mean serialising a document nobody asked to serialise, on every React render.

Bytes are therefore checked at **ingress** — on the wire, before anything parses — on every surface that has a wire. All three use the same `payloadBytes` budget, so they refuse the same message:

| Surface | Where the budget is spent |
|---|---|
| **REST** `/invoke/:name` | reads the body as text and checks it before `JSON.parse` |
| **MCP JSON-RPC** `/mcp` | streams the body with a byte counter and refuses on the chunk that crosses the limit (**413**), before the request reaches the MCP SDK. `content-length` is not trusted: it is absent under chunked encoding and is a claim rather than a fact |
| **MCP App** (stdio) | a bounded framing stream sits between `process.stdin` and the transport, forwarding only whole newline-delimited frames within the budget |
| **Direct `<Weave>`** | no wire, so no bytes. Bounded instead by `nodes`, `values`, `nesting` and the bounded string fields |

**Why ingress and not the candidate document.** The check used to run on the *constructed* candidate — i.e. after the SDK had parsed the message and dropped every key the tool's advertised schema did not declare. `render_dashboard` reads only `root`, so a request could carry a megabyte of discarded argument and leave a few hundred bytes of candidate behind; by the time anything measured, the payload no longer existed to be measured. A budget spent after the parse is not a budget.

`invokeTool` still serialises the candidate and checks it, as a second, narrower guard for any caller that reaches it directly.

The gateway now *refusing* an undeclared key rather than dropping it does not make the ingress budget redundant, and reading it that way would be the same mistake in a new place: the refusal happens after the SDK has already parsed the megabyte. **The key check decides whether a request is answered; only the byte budget decides whether it is read.**

**The stdio semantics, stated rather than implied.** A frame over the budget is discarded whole and the stream resyncs at the next newline; it is never truncated, because a half-forwarded frame would corrupt the *next* message. A discarded frame gets **no JSON-RPC reply** — the message was never framed, so its `id` was never read, and an `id: null` error would only surface on the client as an unmatched response. The caller sees its request time out; the operator sees the reason and the byte count on stderr.

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

**A fixed tool takes neither `type` nor `id`.** `render_metric_band`, `render_chart_card`, `render_table_card` and `render_note_card` each render exactly the organism they advertise. Their input schema is `…Schema.omit({ type, id })`, so a request carrying either key is carrying a key the tool does not take. Both are refused as unrecognised keys — **`type` whether or not it agrees with the tool's own discriminator** — and on every surface:

```diff
- POST /invoke/render_note_card  { "type": "Stack",    "body": "ok" }   → 200, a NoteCard
+ POST /invoke/render_note_card  { "type": "Stack",    "body": "ok" }   → 400
- POST /invoke/render_note_card  { "type": "NoteCard", "body": "ok" }   → 200
+ POST /invoke/render_note_card  { "type": "NoteCard", "body": "ok" }   → 400
- POST /invoke/render_note_card  { "id": "note-1",     "body": "ok" }   → 200, id on the root
+ POST /invoke/render_note_card  { "id": "note-1",     "body": "ok" }   → 400
```

When both keys are sent they are reported in a single `unrecognized_keys` issue, naming them **in the order the caller sent them** — which is the order Zod itself reports, not the schema's field order.

**Ids are not being taken away, they are being scoped.** A fixed tool has no ID contract to honour: nothing in these five tools consumes `id`, and preserving a caller's would mint semantics the tools do not define. The canonical path keeps them — `render_dashboard` takes whole documents and carries every `id` through untouched, which is where a stable identifier means something and where Wave 4's Tabs and Wave 5's registry will read it:

```jsonc
// still valid, ids preserved
POST /invoke/render_dashboard
{ "root": { "type": "Stack", "id": "root-1",
            "children": [ { "type": "NoteCard", "id": "n1", "body": "ok" } ] } }
```

`render_dashboard` is otherwise unaffected by the rule: it carries its root under `root` and stamps no discriminator, so there is nothing for a caller to contradict.

Earlier versions got `type` wrong in opposite directions, and both wore the same disguise — a request that succeeded. Building the root as `{ type: specType, ...record }` let the caller's `type` win the spread, so the tool returned whatever root it was handed. Stamping `type` **last** stopped the retyping but replaced it with a quieter fault: the conflicting key was silently overwritten, so the request above returned **200** and a NoteCard on REST and the MCP App, while `/mcp` refused it. `id` had the same shape and managed a third answer — stamped onto the root by REST, refused by `/mcp`, dropped in silence by the MCP App. One request, three surfaces, three answers.

The rule is therefore enforced in the shared `invokeTool` path, not left to whichever schema a given transport happens to run — REST never parses `inputSchema` at all, and an advertised schema is not a contract on a surface that does not execute it. The MCP App additionally registers each tool by **schema** rather than by `.shape`, because the SDK rebuilds a raw shape as a non-strict `z.object(...)` that *strips* unknown keys: passing `.shape` discarded the `.strict()` these schemas carry, and the key was deleted before any downstream guard could see it. Neither layer covers the other — each was removed in turn and the other surface stayed green.

The reserved keys are listed once, in `FIXED_TOOL_RESERVED_KEYS`. Because a hand-written list mirroring a schema is exactly the kind of thing that goes stale, a test derives the omitted keys from the schemas themselves and fails if the list and the `.omit(...)` calls ever disagree in either direction.

### MCP JSON-RPC

`tools/call` returns the document as `structuredContent` and as the stringified `content[0].text`:

```diff
- structuredContent: { "type": "MetricBand", … }
+ structuredContent: { "weave": 1, "root": { "type": "MetricBand", … } }
```

A request whose raw bytes exceed `payloadBytes` is refused with **413** and a JSON-RPC error body before the SDK parses it — see "Where payload size is checked".

### MCP App

All three delivery channels carry the document (the three exist because hosts differ in what they forward — Claude Desktop was observed stripping `structuredContent` on 2026-07-07):

| Channel | Before | After |
|---|---|---|
| structured | `structuredContent.spec` | `structuredContent.document` |
| meta | `_meta["weave/spec"]` | `_meta["weave/document"]` |
| fenced text | ` ```json ` block, `Weave <tool> spec:` | same block, `Weave <tool> document:` |

`outputSchema` advertises `document` rather than `spec`. The view's dev harness takes `?document=<base64>` instead of `?spec=`.

Stdin is framed under the same `payloadBytes` budget before the transport reads it; an oversized frame is dropped whole, reported on stderr, and never answered.

### `render_dashboard` discoverability (F8)

Its input schema was `SpecSchema` — a `z.lazy()` union with no `.shape`. The MCP Apps SDK normalises through `.shape` and falls back to an **empty schema**, so the one tool that composes every other primitive told the model nothing about its input.

It is now a bounded object gateway, `z.object({ root: RootSpecSchema }).strict()`. Every surface can project it, the advertised schema names exactly the six legal roots, and the runtime path still validates the whole document through `validateWeaveDocument` with no key stripping.

**The gateway takes `root` and nothing else.** It was the last object on any surface still dropping unknown keys in silence, and the widest, because the other four tools' arguments are a node and met a strict node schema downstream:

```diff
- POST /invoke/render_dashboard  { "root": { … }, "junk": 1 }      → 200, `junk` discarded
+ POST /invoke/render_dashboard  { "root": { … }, "junk": 1 }      → 400
- POST /invoke/render_dashboard  { "weave": 2, "root": { … } }     → 200, a v1 document
+ POST /invoke/render_dashboard  { "weave": 2, "root": { … } }     → 400
```

The second line is why this is more than tidiness. The gateway exists so the **server** stamps the version; a caller who writes the envelope themselves and asks for a format this build does not implement had `weave` deleted and got a v1 document back — the one answer a version negotiation must never give.

Closed in **two layers**, because neither covers the other — each was removed in turn and the other surface stayed green:

- **`.strict()` on the gateway** is what `/mcp` and the MCP App run. Without it the SDK deletes the key *upstream* of the shared path, where no guard can reach it.
- **`invokeTool` refuses keys the gateway does not advertise**, raising the same `unrecognized_keys` issue. This is what REST runs, because REST parses `inputSchema` never — it read `root` and ignored the rest.

The allowed keys are read from the advertised schema's own shape rather than listed a second time, so the guard cannot drift from the gateway it guards. `Object.hasOwn`, not `in`: `in` walks the prototype chain, which would quietly admit `toString` and `constructor` as declared keys.

A document's own `id`s are untouched by this — `id` is a key of the root **node**, not of the gateway.

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
