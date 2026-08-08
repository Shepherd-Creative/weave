# Handoff: Primitive Portfolio — Wave 1 (versioned document contract and universal validation)

**Generated**: 2026-08-08
**Branch**: `feature/primitive-portfolio-wave-1` (worktree `/Users/pierregallet/Documents/weave-wave-1`)
**Status**: Implemented, independently reviewed **three times**, remediated after each round, locally verified, committed. **Nothing pushed, no PR opened.**

> Supersedes the Wave 0 handoff. Wave 0 is **merged** — `0568b4f Wave 0: truth, documentation and CI gate (#7)` is this branch's base — so its one open exit-gate item (a PR starting `ci.yml`) is closed.

## Goal

Wave 1 of `.hermes/plans/2026-08-07_223240-primitive-portfolio.md` (parent checkout `/Users/pierregallet/Documents/weave`): turn the permissive node union into a versioned, bounded document boundary before any new primitives are added in Wave 2.

## What shipped

All nine Wave 1 tasks. The contract, the measured limits and the migration guide are in **`docs/specs/weave-document-v1.md`** — read that first; this document is the execution record.

- [x] **`WeaveDocumentV1`** — `{ weave: 1, root }`. Root is a layout (`Grid`, `Stack`) or a display organism (`MetricBand`, `ChartCard`, `TableCard`, `NoteCard`). Unknown envelope keys rejected, not stripped.
- [x] **Rejected root classes**: atoms (F1), bare `DataRow` (F2), and molecules (`KPI`/`Stat`/`Chart`). All stay legal *inside* a layout.
- [x] **`DataRow` demoted** to `TableCard` internals — out of the `Spec` union (13 → 12 members).
- [x] **Table cardinality**: 1–7 headers, ≤40 rows, exactly one cell per header.
- [x] **Everything bounded**, from `bench/document-limits.bench.mjs` rather than intuition. Non-finite numbers rejected everywhere. Chart data keys must be the declared `categoryKey`/`valueKeys`.
- [x] **Optional stable `id`** on every node, unique document-wide.
- [x] **One validator, four surfaces** — React, REST, MCP JSON-RPC, MCP App all route through `validateWeaveDocument`.
- [x] **Explicit deprecated adapter** `legacySpecToDocumentV1`, and `<Weave spec>` retained routed through it. It wraps; it never repairs.
- [x] **`render_dashboard` discoverable again (F8)** via a bounded object gateway — `.strict()`, so it takes `root` and nothing else.
- [x] **Render-only peers optional** after inspecting the built entry points.
- [x] Migration doc + changeset (minor × 3).

## The review, and what it broke

An independent adversarial review of `0806ac8` returned **do not approve**, with three proven blockers. All three were real, all three are fixed in the follow-up commit. They are recorded here because each one is a *shape* of mistake worth not repeating, not just a bug.

### 1. Stripping unknown keys silently defeated the limits (P1)

Only the envelope was `.strict()`. Every node and nested object was a default `z.object()`, which drops unknown keys **after** receiving them — so an undeclared field carried whatever a caller liked, was walked in full, and was then deleted before anything weighed it. The reviewer's repro: a `NoteCard` with `onLoad: "x".repeat(300_000)` validated clean and came back as `{type:"NoteCard", body:"ok"}`; `junk: Array(1_000_000).fill(0)` also validated, after a ~23 ms full traversal.

**The lesson is not "we forgot `.strict()`".** It is that *the document looked bounded precisely because the evidence had been thrown away*. Handoff residual limit 3 (now removed) had recorded stripping as a known trade-off deferred to Wave 5 — it was not a trade-off, it was the hole. **A "documented limitation" that makes a stated guarantee false is a defect wearing a note.**

Fixed in two independent layers, and they were falsified separately on purpose:

- **Every node and nested object schema is now `.strict()`** — atoms, molecules, organisms, layouts, table headers, table cells, deltas, sparkline configs. The single permitted open shape is `ChartDatumSchema` (a `z.record()`), because a chart series is named by the caller; its keys stay bounded in count and length, its values in type, and the validator still requires them to match the declared `categoryKey`/`valueKeys`.
- **`LIMITS.values` (300,000)** bounds the structural walk itself. With strict schemas alone the million-element array was still *walked in full* before Zod refused it — proven by the intermediate RED, where that test reported `unrecognized_keys` rather than `weave:values`. `nodes` counts objects and therefore sees nothing in an array of scalars.

### 2. REST could retype a fixed tool's root (P1)

`invokeTool` built `{ type: tool.specType, ...record }`, so a caller-supplied `type` won the spread. `POST /invoke/render_note_card {"type":"Stack","children":[…]}` returned **200** and a Stack. The advertised `inputSchema` said otherwise, but nothing ran it: REST never parses it at all, and the SDK surfaces only *strip* the extra key. **An advertised schema is not a contract on any surface that does not execute it.**

The fix stamped `type` last (`{ ...record, type: tool.specType }`) and this document claimed the conflicting key was then "refused by the real schema". **That claim was false, and the second review round proved it** — stamping last overwrites the key rather than refusing it, and `type` is a *declared* field of the node schema, so nothing was ever left for an unknown-key rule to catch. See "The second review round" below.

### 3. Two of the four surfaces had no ingress budget (P2)

`/mcp` handed the raw request straight to the MCP SDK, and the MCP App let `ReadBuffer` frame stdin unaided. The only size check ran on the **constructed candidate document** — after the SDK had parsed the message and dropped every undeclared key. `render_dashboard` reads only `root`, so a request could carry a megabyte of discarded argument and be measured at a few hundred bytes. **A budget spent after the parse is not a budget.**

Both now spend the budget at the door, on the same `payloadBytes` number REST uses:

- `/mcp` streams the body with a byte counter (`packages/weave-mcp-server/src/ingress.ts`) and answers **413** on the chunk that crosses the limit. `content-length` is deliberately not trusted — absent under chunked encoding, and a claim rather than a fact.
- The MCP App puts a bounded framing stream between `process.stdin` and the transport (`packages/weave-mcp-app/src/bounded-stdin.ts`). An oversized frame is discarded **whole** and the stream resyncs at the next newline; truncating would corrupt the *next* message, which is worse than the fault being fixed. A discarded frame gets no JSON-RPC reply — its `id` was never read — so the caller times out and the operator sees the size on stderr. Stated as semantics in the spec rather than left to be discovered.

### 4. Trailing whitespace at `docs/specs/weave-document-v1.md:73`

Fixed. `git diff --check 0568b4f` is now exit 0.

## The second review round — the fix that moved the fault instead of closing it

A second independent review of `fe70778` returned one remaining blocker. Everything else it exercised held: the ingress budget, the strict schemas, the framing, `git diff --check`, and the full gate.

### `invokeTool` normalised a conflicting `type` instead of rejecting it (P1)

`POST /invoke/render_note_card {"type":"Stack","body":"ok"}` — **valid but for that one key** — returned **200** and a NoteCard. The same call to `/mcp` was refused. The MCP App accepted it too. One request, three surfaces, two answers.

**This is the same defect as blocker 2, one layer along.** Stamping `type` last stopped the *retyping*, and the round-1 tests agreed, because every payload they used was independently invalid: the NoteCard case carried `children` and omitted the required `body`, so it returned 400 whether or not the discriminator was honoured. **A guard that cannot distinguish the fault it exists for from an unrelated fault is not a guard**, and its green is worth nothing. Each new test now uses a payload where `type` is the only thing wrong, and each carries a control asserting the same payload passes without it.

Two shapes worth keeping:

- **"Rejected as an unrecognised key" was never possible here.** `type` is a *declared* field of every node schema. `.strict()` refuses keys a schema does not declare; it has nothing to say about one it does. The round-1 claim was reasoning about the fix rather than running it.
- **Overwriting and ignoring are both silence.** The advertised schema is `…Schema.omit({ type, id })`, so `type` is unrecognised **whether or not it agrees** with the tool's discriminator — the SDK raises `unrecognized_keys` for both. The rule is now "a fixed tool does not take a `type` argument", enforced identically everywhere, rather than a reconciliation performed quietly at one layer.

Fixed in **two independent layers**, because neither covers the other — proven by removing each in turn and watching the other surface stay green:

- **`invokeTool` refuses the key** (`packages/weave-mcp-server/src/tools.ts`), raising the same `unrecognized_keys` issue on `type` that the SDK raises. This is the shared path, so it reaches the surfaces that never execute the advertised schema — REST above all. An own-property test walks nothing, so it runs before the structural walk without becoming the step that traverses unbounded input.
- **The MCP App registers each tool by schema, not by `.shape`** (`packages/weave-mcp-app/src/server.ts`). Handed a raw shape, the SDK rebuilds it with `objectFromShape()` — a plain, non-strict `z.object(...)` that **strips** unknown keys. Passing `.shape` silently discarded the `.strict()` these schemas are built with, so `type` was deleted *before the handler ran* and `invokeTool` never saw it. **A guard cannot run on input that was thrown away upstream of it** — the same lesson the unknown-key hole taught, in a different place. This also makes the spec's standing "rejected, not stripped" claim true on this surface for the first time.

`render_dashboard` is untouched: it carries its root under `root` and stamps no discriminator, so there is nothing to contradict.

### The same rule then closed `id` (engineering decision, not a review finding)

The `type` fix left `id` diverging in the same shape — REST stamped a caller's `id` onto the root, `/mcp` refused it, and the MCP App had been dropping it silently until tools were registered by schema. It was recorded as a residual limit and then **decided rather than left**: fixed organism tools accept no caller `id` either, refused identically on all three surfaces.

The reasoning is that a fixed tool has no ID contract to honour. Nothing in these five tools consumes `id`, so preserving a caller's would mint semantics the tools do not define — and minting semantics quietly, on one surface out of three, is how the `type` defect started. Ids stay available where they mean something: `render_dashboard` takes whole documents and carries every `id` through untouched, which is what Wave 4's Tabs and Wave 5's registry will read. **A test asserts that escape hatch on all three surfaces**, so a later tightening cannot turn a scoping decision into a capability removal without going red.

Two details worth keeping:

- **Both keys are reported in one `unrecognized_keys` issue, in the order the CALLER sent them.** Measured: Zod reports unrecognised keys in input order, so `{body,type,id}` gives `["type","id"]` and `{body,id,type}` gives `["id","type"]` — while the schema's own shape order is `id, type`. A fixed order would have agreed with the SDK on one input and diverged on the other, so the test asserts both.
- **The reserved list is not trusted to stay right.** `FIXED_TOOL_RESERVED_KEYS` is a hand-written mirror of four `.omit({ type, id })` calls, which is exactly the kind of thing that goes stale. A test derives the omitted keys from the schemas themselves and fails if the two disagree in either direction.

## The third review round — the one object nobody had closed

A third independent review returned one remaining blocker, and it is the unknown-key hole again, in the last place it could still hide.

### `DashboardGatewaySchema` was not strict (P1)

`POST /invoke/render_dashboard {"root":{…},"junk":1}` — **a valid document plus one small undeclared key** — returned **200**, with `junk` gone. `/mcp` returned 200 too, and so did the MCP App. Three surfaces, one wrong answer, and this time they all agreed.

**Why this one survived two rounds of closing exactly this hole.** Round 1 made every node and nested object `.strict()`, and that genuinely covered four of the five tools — their arguments *are* a node, so an undeclared key met a strict schema on its way through. `render_dashboard`'s arguments are the gateway object, which is neither the envelope nor a node, so it fell outside the sweep and outside the sentence in the spec that described it. **A policy stated as a list of levels does not cover a level nobody listed.**

The case that makes it more than tidiness is `{ weave: 2, root }`: a caller writing the envelope themselves and asking for a format this build does not implement had `weave` deleted and got a **v1 document back**. The gateway exists so the server stamps the version — and a version negotiation that answers a request for v2 with a v1 document is the one failure mode the envelope was introduced to prevent.

Fixed in **two independent layers**, proven independent by removing each in turn:

- **`.strict()` on the gateway** (`packages/weave-mcp-server/src/tools.ts`). This is what `/mcp` and the MCP App run. Without it the SDK deletes the key *upstream* of the shared path, where no guard can reach it — the third appearance of "a guard cannot run on input that was thrown away above it".
- **`invokeTool` refuses keys the gateway does not advertise**, raising the same `unrecognized_keys` issue. This is what REST runs, because REST parses `inputSchema` never: the old line read `record.root` and discarded the rest without a word.

Two details worth keeping:

- **The allowed keys are read from the advertised schema's shape, not listed again.** A second copy would go stale the day the gateway grows a field, and a test pins the two together rather than mirroring one in the other.
- **`Object.hasOwn`, not `key in shape`.** `in` walks the prototype chain, so `toString` and `constructor` would read as declared keys and be silently discarded — the original defect surviving in the two places nobody would test. Sabotaged: swapping `hasOwn` for `in` produces **exactly 1 red**, on that test alone.

`id` is untouched: it is a key of the root **node**, not of the gateway, and a test on all three surfaces says so.

## Verification

Every gate re-run on the remediated tree.

| Gate | Result |
|---|---|
| `TURBO_FORCE=true pnpm typecheck` | exit 0 |
| `TURBO_FORCE=true pnpm test` | exit 0 — **495 vitest + 26 `node --test` = 521**; round 2 closed at 500, its first pass 490, round 1 478, Wave 1's first pass 443, the pre-Wave-1 baseline 312 |
| `TURBO_FORCE=true pnpm build` | exit 0 |
| `node scripts/biome-new-findings.mjs 0568b4f` | exit 0 — base 46, head 37, **0 new** |
| `pnpm lint` | exit 1 — 37 diagnostics, the pre-existing baseline |
| `git diff --check 0568b4f` | exit 0 |

Per-package: primitives 180 (was 168), theme-cli 102, mcp-server **115** (98 → 90 → 82 → 72), mcp-app **69** (65 → 63 → 59 → 46), skill 14, tokens 10, adapter-skill 5.

Round 1's 35 new tests were all written **before** the fix and watched fail. The exact failure text matters in two of them:

| Guard | RED evidence |
|---|---|
| strict node/nested schemas | 7 validator cases reported `accepted` — the reviewer's finding, reproduced |
| `LIMITS.values` | isolated **after** strict landed: the same case reported `unrecognized_keys`, proving Zod walked the whole million-element array before refusing it. Only then did it become `weave:values` |
| fixed-tool root | 2 REST cases returned **200** with the caller's own root type |
| `/mcp` ingress | 3 cases returned **200** with the document rendered from an oversized request |
| stdio framing | 9 unit cases could not even import the module; the e2e was **answered**, `isError: false` |

Round 2 added **12 tests** (net +8 in mcp-server after replacing 3 false positives, +4 in mcp-app). Eleven were watched fail against the unfixed tree; the twelfth is a non-vacuity control that must pass from the start:

| Guard | RED evidence |
|---|---|
| `invokeTool` refuses a caller `type` | 4 unit cases: **a document came back** (`{weave:1, root:{type:"NoteCard",…}}`) where a throw was required |
| REST | 3 cases returned **200**, including the reviewer's exact `{type:"Stack", body:"ok"}` |
| REST ↔ `/mcp` parity | the `/mcp` half already passed; the REST half returned **200** to the request `/mcp` refused |
| MCP App over stdio | 3 e2e cases came back `isError: undefined` with a valid NoteCard document |

Every round-2 payload is valid but for the `type` key, and each case pairs with a control asserting the same payload succeeds without it — the specific hole that let round 1's tests pass over a broken fix.

Closing `id` added **10 more** (mcp-server 90 → 98, mcp-app 63 → 65). Six were watched fail; four could not be, and saying which is the point:

| Guard | RED evidence |
|---|---|
| `invokeTool` refuses a caller `id` | 3 unit cases: a document came back where a throw was required, and the both-keys case reported `["type"]` instead of `["type","id"]` |
| REST | 2 cases returned **200** with the caller's `id` stamped onto the root |
| drift guard on the reserved list | errored — `FIXED_TOOL_RESERVED_KEYS is not iterable`, the export not existing yet |
| MCP App over stdio | **already green before the fix.** That surface began refusing `id` the moment tools were registered by schema rather than `.shape`; these two cases lock behaviour the previous commit produced rather than driving new behaviour, and are labelled as such in the test |
| `render_dashboard` keeps ids (×3 surfaces) | **green from the start by design** — they assert the escape hatch the decision depends on, so they must pass before and after |

Round 3 added **21 tests** (mcp-server 98 → 115, mcp-app 65 → 69). Twelve were watched fail against the unfixed tree; one was falsified by sabotage because it was written after the code it guards; eight are non-vacuity controls that must pass from the start:

| Guard | RED evidence |
|---|---|
| `invokeTool` refuses undeclared gateway keys | 6 unit cases; the plainest reported `expected { weave: 1, root: { …(2) } } to be undefined` — **a document came back** from a request carrying a key the server had deleted |
| REST | 2 cases returned **200** to `{root, junk:1}` and to `{weave:2, root}` — the reviewer's finding, reproduced |
| `/mcp` | 2 cases returned `isError: undefined` with the document rendered |
| `DashboardGatewaySchema` itself | `safeParse({root, junk:1}).success` was **true** — the advertised schema the other two surfaces run |
| MCP App over stdio | 2 e2e cases came back `isError: undefined` with a valid Stack document |
| `Object.hasOwn` over `key in shape` | written after the guard, so falsified instead: swapping it back produces **exactly 1 red**, on the prototype-chain case alone |
| bare gateway accepted (×3 surfaces), ids preserved (×3), allowed keys derived from the schema | **green from the start by design** — without them every rejection above could be a rejection of the root, or of ids the gateway must not touch |

Every round-3 payload is a valid document root plus **one small** undeclared key — small deliberately, because a large one is refused by the ingress budget and the test would then be proving the budget rather than the gateway.

`pnpm lint` exit 1 is the **pre-existing baseline**, unchanged in kind. It dropped 46 → 37 because formatting the files this work already had to touch cleared 11 pre-existing findings — the same effect Wave 0 saw at 48 → 46. Judge lint by `scripts/biome-new-findings.mjs`, never by the raw exit code.

**⚠️ Use `0568b4f` as the gate's base ref, not `main`.** Local `main` is stale at `b9b1617` and predates the merged Wave 0 commit; against it the gate reports a 48-diagnostic baseline that mixes Wave 0's changes into Wave 1's. There is no `origin/main` in this worktree.

## Falsification — the guards are load-bearing

A green suite is not evidence. Each guard below was sabotaged, watched fail, and restored.

| Sabotage | Result |
|---|---|
| Renderer returns `props.document` instead of calling `validateWeaveDocument` | **5 red** (depth, node count, ragged, duplicate ids, non-finite). The node-count case took **4.3 s** to fail — it rendered the tree the cap exists to refuse. |
| `invokeTool` returns the candidate unvalidated | **12 red** across REST and MCP JSON-RPC |
| Ragged-row rule disabled | **5 red** (4 validator + 1 renderer) |
| Id-uniqueness rule disabled | **5 red** (4 validator + 1 renderer) |
| Root union widened to the full `Spec` union | **7 red** (6 root-membership + the adapter's atom case) |
| UTF-8 payload check replaced by `raw.length` | **initially 0 red — see below**, then **1 red** after the test was fixed |

**The one that got away, and what it cost.** The UTF-8 sabotage passed. The test asserted `.toThrow(WeaveDocumentError)`, and `parseWeaveDocumentJson` throws that class for an oversized payload *and* for malformed JSON — so the multibyte string sailed past the weakened size guard and died in `JSON.parse` instead, satisfying the assertion for the wrong reason. All four payload tests now assert the `code` (`"payload"` / `"malformed"`), and the sabotage goes red. **The same shape bit twice in this wave**: `document.test.ts`'s first run reported 31 "passes" against a module that did not exist, because a missing import throws `TypeError` and `.toThrow(SomeUndefinedClass)` degrades to a bare `.toThrow()`. That file now opens with a harness-sanity test asserting its imports exist.

Restore verified three ways: `diff -q` against backups taken **after** the fix, the fixed code present on the code line, and a tree-wide `grep -rl --no-ignore-files 'SABOTAGE_S[1-6]_MARKER'` returning **0** against a non-vacuity control of **37**.

**Remediation round.** The 35 new tests carry their own RED evidence (see Verification), which covers every new guard except two whose first-pass red was trivially satisfied. Those two were sabotaged directly:

| Sabotage | Result |
|---|---|
| Bounded framing forwards the held bytes instead of discarding the frame (truncate rather than drop) | **5 red** — including "accepts a frame exactly at the limit" and "defaults to the shared payload budget", i.e. the off-by-one and the default both matter |
| `LIMITS.values` lowered to 100,000 — below the values-maximising legal document | **1 red**: "admits the largest legal document the other caps permit" reported `weave:values`. The cap's non-vacuity guard is load-bearing, so a future tightening cannot silently start refusing legal documents |

Restored from post-fix backups, `diff -q` identical, the fix present on the code line, downstream `dist/` rebuilt (the framing sabotage lives in a bundle), and a tree-wide `grep -rl --no-ignore-files 'SABOTAGE_R[12]_MARKER'` returning **0** against a non-vacuity control of **11** dist files. Note esbuild strips comments, so a comment-only marker never reaches `dist/index.js` — the unit tests import source, which is where that sabotage was proven.

**Second review round.** The 12 new tests carry their own RED evidence (see Verification). Both layers were *additionally* sabotaged, because the question that matters is not whether each works but whether **either one alone is enough** — if one silently covered the other, removing the redundant layer later would look safe and would not be:

| Sabotage | Result |
|---|---|
| `invokeTool`'s guard made inert (looks for a key nobody sends, so the branch still exists and never fires) | **8 red** in mcp-server — the whole round-2 REST and unit set. The MCP App e2e stayed **green**, with the sabotaged marker confirmed present in `dist/index.js`: that surface is held by its registration, not by this check |
| MCP App registration reverted to `.shape` | **3 red** over stdio — **with `invokeTool`'s guard fully intact**. The SDK strips `type` upstream, so the shared guard never sees the key. This is the proof the two layers are independent, and the reason the fix is not a one-liner |

Restored from backups taken **after** the fix, `diff -q` identical on both files, each fix confirmed present on its own code line, `dist/` rebuilt, and a tree-wide `grep -rl --no-ignore-files 'SABOTAGE_T[12]_MARKER'` returning **0**. The sweep was given its own non-vacuity control this time: a string known to live in the gitignored bundle was searched with the identical flags and **did** return `packages/weave-mcp-app/dist/index.js`, so the zero is a real zero and not an unsearched tree.

**The `id` decision.** Two sabotages, aimed at the two things that could rot:

| Sabotage | Result |
|---|---|
| `id` dropped from `FIXED_TOOL_RESERVED_KEYS` — the regression a future edit would most plausibly make | **6 red**, and the drift guard caught it *independently* of the behaviour tests: `expected ['id','type'] to deeply equal ['id_SABOTAGE_A_MARKER','type']` |
| Reserved keys reported in a fixed order instead of the caller's | **exactly 1 red**, on the reversed-order input only. A single-order test would have stayed green — which is why that test asserts both orders |

Restored from the post-fix backup, `diff -q` identical, both fixed lines confirmed present, `dist/` rebuilt, `grep -rl --no-ignore-files 'SABOTAGE_[AB]_MARKER'` returning **0** against the same gitignored-bundle control.

**Third review round.** The 21 new tests carry their own RED evidence (see Verification). Both layers were *additionally* sabotaged, for the same reason as round 2: the question is not whether each works but whether **either one alone is enough**, because if one silently covered the other, deleting the redundant layer later would look safe and would not be.

| Sabotage | Result |
|---|---|
| `invokeTool`'s gateway guard made inert (filters for a key nobody sends, so the branch still exists and never fires) | **9 red** in mcp-server — every REST and unit case. The MCP App e2e stayed **green**, with the sabotage confirmed present in `dist/index.js`: that surface is held by `.strict()`, not by this check |
| `.strict()` removed from `DashboardGatewaySchema` | **3 red** in mcp-server (`/mcp` ×2, plus the advertised-schema unit case) and **2 red** over stdio — **with `invokeTool`'s guard fully intact**. REST stayed green. The layers are independent in both directions |
| `Object.hasOwn` replaced by `key in shape` | **exactly 1 red**, on the prototype-chain case alone. A guard using `in` would have passed every other test in the suite |

Restored from a backup taken **after** the fix, `diff -q` identical, both fixed lines (`.strict();` and the `Object.hasOwn` filter) confirmed present by line number, `dist/` rebuilt, and a tree-wide `grep -rl --no-ignore-files 'SABOTAGE_[GH][012]_MARKER'` returning **0** against a non-vacuity control that did return the gitignored `packages/weave-mcp-app/dist/index.js`.

## Key decisions

| Decision | Rationale |
|---|---|
| Root = layouts + display organisms **only** (no standalone `KPI`) | User's call when the plan's wording and SKILL.md §4/§5.3/§7.3 conflicted. Gives one uniform root shape for Waves 3–5. A lone headline KPI now travels inside a one-child `Stack`; `size: "xl"` stays legal there because §6 forbids it only in a container *with siblings*. |
| Cross-field rules live in the **canonical validator**, not the leaf schemas | Forced, not stylistic. Zod 3's `discriminatedUnion` requires `ZodObject` members and `.superRefine()` yields `ZodEffects`, which the union rejects at construction (`TypeError: Cannot read properties of undefined (reading 'type')`, zod 3.25.76). Consequence: `TableCardSchema.parse()` alone checks counts but not raggedness. |
| Tool `inputSchema` is an **advertised projection**; `validateWeaveDocument` is the runtime authority | Exactly the plan's task-9 wording. Keeps `.shape` for the MCP Apps SDK while the real contract runs underneath. |
| `render_dashboard` gateway takes `{ root }`, not a whole document | The server stamps the version, so a caller cannot send a wrong one and the model never writes the envelope. |
| Payload bytes checked at **ingress** on every surface that has a wire, not inside `validateWeaveDocument` | Measuring bytes in the validator would serialise a document nobody asked to serialise, on every React render — so the budget is spent on the wire instead: REST before `JSON.parse`, `/mcp` with a streaming byte counter before the SDK, the MCP App by framing stdin. Direct React has no wire and is bounded by node/values/nesting/string caps. **Revised after review**: the original design measured the *constructed candidate* for the two SDK surfaces, which is a measurement taken after the payload has already been discarded. |
| The unknown-key policy is **closed by default, with exactly one documented exception** | Every node, every nested object **and the tool argument gateway** are `.strict()`; `ChartDatumSchema` stays a `z.record()` because a chart series is named by the caller. Enumerating the exception is the point — "some objects are open" is how the next one gets added without an argument. **Round 3's lesson is the mirror image**: the policy had been written as a list of levels (envelope, node, nested object), and the gateway was a level nobody listed, so it stayed open through two rounds of closing exactly this hole. State a closed-by-default policy as a default, not as an inventory. |
| `values` (300,000) measured against the **values-maximising** legal document, not the all-axes-maxed one | A sparkline cell is one object carrying 100 scalar leaves, so the shape that maximises objects is not the shape that maximises traversal. The all-axes-maxed document traverses 12,189 values; nine tables of sparkline cells traverse **260,816** and are the largest `nodes` admits. A cap read off the wrong document would have refused an ordinary dashboard. |
| Separate `nesting` cap (40) alongside the `depth` cap (6) | `depth` counts containers and is the contract. `nesting` counts raw object/array levels and exists only so a deeply nested chain is a clean rejection rather than a `RangeError` escaping as a 500. Measured: the shape that needs it is a chain of raw **arrays**, which `nodes` and `values` are both structurally blind to; a chain of plain objects is stopped by `nodes` at 3,000 before it can overflow. |
| `nodes` (3,000) sits **above** the all-axes-maxed document (2,158) | A cost cap that rejected the largest document its own sibling caps permit would be a bug report waiting to happen. It bites on the multiplicative case: 12 children × 6 levels. |
| Benchmark builds **unbounded mirrors** of the shipped schemas | The evidence for a cap is what happens past it; the shipped schemas short-circuit there. The two whole-document sections do use the real validator, because the question there is whether the caps admit a legal document. |
| Wire formats broke immediately; the React prop got a deprecation period | The wire formats are pre-release with no published consumers. `<Weave spec>` is the surface a host app would already be calling. |
| One atomic commit | The exit-gate property — "every transport and direct React reject invalid documents identically" — does not exist until all four surfaces land. Splitting it would produce commits that cannot pass `pnpm test`. |

## Failed approaches (don't repeat these)

- **`.superRefine()` on a `discriminatedUnion` member.** Fails at *construction*, not parse. Measured before designing around it.
- **Trusting `.toThrow(SomeClass)` when the class might be undefined**, or when one function throws that class for more than one reason. Both produced fully green suites over broken code in this wave.
- **`biome check --write` with a file list containing a deleted path** — biome errors and writes nothing; `| tail -5` hid the error and three separate "format the changed files" attempts silently did nothing. Build the list with `git diff --name-only --diff-filter=d` and pipe through `xargs` (BSD `xargs` has **no `-a` flag**; `xargs cmd < file` is the portable form).
- **A benchmark that imports the shipped schemas to measure past their caps.** Every over-cap row becomes a rejection that times nothing.
- **A `z.lazy(() => z.discriminatedUnion(…))` whose body builds the union inline** — it rebuilds per child parse, and that cost dominated the measurement by ~7× on a 5,000-node tree. Cache the union.
- **Reading benchmark numbers without a warm-up.** A mid-table row read 20.5 ms next to 3.9 ms at 5× the size, inverting the ordering the numbers exist to establish.
- **Citing a path in a comment without checking it resolves.** The Wave 0 citation guard caught seven at once, including a `dist/` path that is gitignored and may not exist.
- **A `dist/`-reading test in this package.** Turbo's `test` depends on `^build` (upstream only), so this package's own `dist/` may be absent or stale.

## Not yet done

- [x] **Independent adversarial review of the diff** (shared execution rule 4). Round 1 against `0806ac8`: verdict "do not approve", three proven blockers plus a whitespace note — see "The review, and what it broke". Round 2 against `fe70778`: one remaining blocker, the conflicting-`type` normalisation, plus the false-positive tests that had hidden it — see "The second review round". Round 3 against `0df4dba`: one remaining blocker, the non-strict `render_dashboard` gateway — see "The third review round". Everything else rounds 2 and 3 exercised (ingress budget, strict node schemas, stdio framing, the reserved-key rule, the full gate) held.
- [ ] Push, open a PR, and let `ci.yml` run against Wave 1.
- [ ] Only then declare the Wave 1 gate closed and start Wave 2.

## Residual limits, stated rather than hidden

Written with the review's lesson in mind: **a documented limitation that makes a stated guarantee false is a defect wearing a note.** Each item below is checked against "does this make any claim in the spec untrue?" — none of them do.

1. **`TableCardSchema.parse()` alone does not catch a ragged table.** Documented in the schema and the spec; every real path goes through the validator, but a consumer reaching for the leaf schema directly gets counts only.
2. **`validateWeaveDocument` does not measure payload bytes.** By design (see Key decisions). Every surface that has a wire spends the budget at ingress instead; direct React has no wire and is bounded by node, values, nesting and string caps.
3. **`values: 300_000` is a bound, not a tight one.** It sits 1.15× above the largest legal document (260,816 values), so on the direct React path a hostile input can still cost one full traversal of ~300k values (single-digit ms) before rejection. On the wire surfaces `payloadBytes` bites long before it. Tightening it means lowering `sparklinePoints` or `nodes` first, and re-measuring.
4. **Chart "known fields" is only enforced when the chart declares `categoryKey` or `valueKeys`.** A chart that declares neither has unconstrained (but bounded) keys — bounded meaning ≤ 9 keys per record, each ≤ 64 chars, values finite numbers or ≤ 200-char strings. This is the one place a caller still chooses key names, and it is the deliberate open record.
5. **A stdio frame over the budget is answered with silence, not an error.** The message was never framed, so its `id` was never read; an `id: null` JSON-RPC error would surface on an SDK client as an unmatched response rather than a failure. The caller times out; the operator gets the byte count on stderr. Documented in the spec's ingress section.
6. **The `id` field is validated and unique but consumed by nothing.** Reserved for Wave 4's Tabs and Wave 5's registry.
7. **`nesting: 40` was not derived from a stack-depth measurement**, only from the observation that a legal depth-6 document nests about 20. It is a guard rail with headroom, not a tuned number.
8. **`id` was the same divergence and is now closed the same way.** Fixed tools advertise `…Schema.omit({ type, id })`, so `id` is no more a caller argument than `type` is. It had reached a *third* answer per surface. Measured on `POST /invoke/render_note_card {"body":"ok","id":"note-1"}`:

   | Surface | Before round 2 | After round 2 | Now |
   |---|---|---|---|
   | REST | **200**, `id` stamped onto the root | **200**, unchanged | **400** |
   | `/mcp` | rejected, `unrecognized_keys: ["id"]` | unchanged | **400**, unchanged |
   | MCP App | silently **stripped**, `id` lost | **rejected** (schema registration) | **rejected**, unchanged |

   Ids are scoped, not removed: `render_dashboard` takes whole documents and carries every `id` through untouched, which is where Wave 4's Tabs and Wave 5's registry will read them. A test asserts that escape hatch on all three surfaces, so a future tightening cannot quietly turn a scoping decision into a capability removal.

   The reserved keys live in one exported list, `FIXED_TOOL_RESERVED_KEYS`, with a test that derives the omitted keys from the schemas themselves — a hand-written mirror of a schema goes stale, and that test is what fails when it does.

## Files to know

| File | Why |
|---|---|
| `packages/weave-primitives/src/schemas/document.ts` | The contract: envelope, root union, cost policy, cross-field rules, the adapter. |
| `packages/weave-primitives/src/schemas/bounds.ts` | `LIMITS` and the bounded primitives, each cap carrying its measurement — and the unknown-key policy, written where the caps live. |
| `packages/weave-primitives/bench/document-limits.bench.mjs` | The evidence. Self-contained; needs `dist/` only for its whole-document sections, which now report `values` alongside objects and bytes. |
| `docs/specs/weave-document-v1.md` | Contract, recorded benchmark, migration guide, deprecation timetable. |
| `packages/weave-mcp-server/src/tools.ts` | `DashboardGatewaySchema` (F8, `.strict()`) and `invokeTool`, which every transport shares — including the rule that a fixed tool's `type` is not a caller argument, and that the gateway takes `root` and nothing else. |
| `packages/weave-mcp-server/src/ingress.ts` | The `/mcp` byte budget — why the SDK boundary forces it here and not downstream. |
| `packages/weave-mcp-app/src/server.ts` | Registers each tool by **schema, not `.shape`** — and why that distinction is load-bearing rather than stylistic. |
| `packages/weave-mcp-app/src/bounded-stdin.ts` | The stdio framing budget and its documented semantics. |
| `packages/weave-mcp-server/src/__tests__/fixtures.ts` | Payloads valid but for one key, so a rejection is about that key. The absence of these is what let round 1 pass over a broken fix. |
| `packages/weave-primitives/src/__tests__/document.test.ts` | 65 cases. Opens with the harness-sanity test that caught the false-green. |
| `packages/weave-primitives/src/__tests__/packaging.test.ts` | Guards the "schemas without a renderer" claim at source level. |

## Resume instructions

1. `cd /Users/pierregallet/Documents/weave-wave-1`, confirm the tree is clean and 5 commits ahead of `0568b4f`.
2. Re-verify before trusting anything:
   ```bash
   TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test
   ```
   Expected exit 0, 495 vitest + 26 `node --test`.
   If Playwright fails with `Executable doesn't exist … chromium_headless_shell-1228`:
   `pnpm --filter @shepherd-creative/weave-mcp-app exec playwright install chromium`.
3. Confirm the lint position:
   ```bash
   node scripts/biome-new-findings.mjs 0568b4f      # NOT `main` — see the warning above
   ```
   Expected: `No new Biome findings. 46 pre-existing finding(s) left untouched.`, exit 0, head 37.
4. Push, open the PR, and let `ci.yml` run against Wave 1.
5. Then update the plan's Wave 1 record to close the gate.

## Warnings

- **Do not merge without Pierre's review.** `main` has a `protect-main` ruleset.
- **Turbo cache is shared with the parent checkout.** Use `TURBO_FORCE=true` for any run you intend to trust.
- **Rebuild `weave-primitives` before running the mcp-server or mcp-app suites** after touching schemas: those packages resolve primitives from `dist/`, and a stale `dist/` makes imports read `undefined` — which is exactly how a whole suite reports green over nothing.
- **`packages/weave-mcp-app/dist/weave-skill.md` is a build copy of SKILL.md** (gitignored, refreshed by `pnpm build`). Rebuild after editing SKILL.md.
- **The Biome gate can report a pre-existing finding you did not introduce**, by design — see Wave 0's "The gate's contract" in the git history of this file. Fix the reported finding; do not loosen the matcher.
- **Adding `.strict()` changes formatting**, because Biome rewraps `z.object({…}).strict()` onto a `z\n.object({…})\n.strict()` chain. Four files came back as new Biome findings on the first gate run purely for that. Run `pnpm format` on the changed files before reading the gate, and build the file list with `git diff --name-only --diff-filter=d` plus `git ls-files --others --exclude-standard` so new files are included — a formatting miss on an untracked file is invisible until the gate.
- **A comment-only sabotage marker never reaches `packages/weave-mcp-app/dist/index.js`**: esbuild strips comments. Sabotage that bundle through a string the build must keep, or prove the point against the source the unit tests import.
