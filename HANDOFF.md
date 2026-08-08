# Handoff: Primitive Portfolio — Wave 1 (versioned document contract and universal validation)

**Generated**: 2026-08-08
**Branch**: `feature/primitive-portfolio-wave-1` (worktree `/Users/pierregallet/Documents/weave-wave-1`)
**Status**: Implemented, locally verified, committed. **Nothing pushed, no PR opened.** Awaiting independent adversarial review before the Wave 1 gate is declared closed.

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
- [x] **`render_dashboard` discoverable again (F8)** via a bounded object gateway.
- [x] **Render-only peers optional** after inspecting the built entry points.
- [x] Migration doc + changeset (minor × 3).

## Verification

Every gate re-run on the committed tree.

| Gate | Result |
|---|---|
| `TURBO_FORCE=true pnpm typecheck` | exit 0 |
| `TURBO_FORCE=true pnpm test` | exit 0 — **417 vitest + 26 `node --test` = 443**; baseline was 286 + 26 = 312 |
| `TURBO_FORCE=true pnpm build` | exit 0 |
| `node scripts/biome-new-findings.mjs 0568b4f` | exit 0 — base 46, head 37, **0 new** |
| `pnpm lint` | exit 1 — 37 diagnostics (22 errors / 6 warnings / 9 infos) |
| `git diff --check` | exit 0 |

`pnpm lint` exit 1 is the **pre-existing baseline**, unchanged in kind. It dropped 46 → 37 because formatting the files this work already had to touch cleared 11 pre-existing findings — the same effect Wave 0 saw at 48 → 46. Judge lint by `scripts/biome-new-findings.mjs`, never by the raw exit code.

**⚠️ Use `0568b4f` as the gate's base ref, not `main`.** Local `main` is stale at `b9b1617` and predates the merged Wave 0 commit; against it the gate reports a 48-diagnostic baseline that mixes Wave 0's changes into Wave 1's. There is no `origin/main` in this worktree.

Per-package test counts: primitives 168, theme-cli 102, mcp-server 72, mcp-app 46 (including Playwright e2e), skill 14, tokens 10, adapter-skill 5.

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

## Key decisions

| Decision | Rationale |
|---|---|
| Root = layouts + display organisms **only** (no standalone `KPI`) | User's call when the plan's wording and SKILL.md §4/§5.3/§7.3 conflicted. Gives one uniform root shape for Waves 3–5. A lone headline KPI now travels inside a one-child `Stack`; `size: "xl"` stays legal there because §6 forbids it only in a container *with siblings*. |
| Cross-field rules live in the **canonical validator**, not the leaf schemas | Forced, not stylistic. Zod 3's `discriminatedUnion` requires `ZodObject` members and `.superRefine()` yields `ZodEffects`, which the union rejects at construction (`TypeError: Cannot read properties of undefined (reading 'type')`, zod 3.25.76). Consequence: `TableCardSchema.parse()` alone checks counts but not raggedness. |
| Tool `inputSchema` is an **advertised projection**; `validateWeaveDocument` is the runtime authority | Exactly the plan's task-9 wording. Keeps `.shape` for the MCP Apps SDK while the real contract runs underneath. |
| `render_dashboard` gateway takes `{ root }`, not a whole document | The server stamps the version, so a caller cannot send a wrong one and the model never writes the envelope. |
| Payload bytes checked where a payload **exists**, not inside `validateWeaveDocument` | REST checks raw text before `JSON.parse`; `invokeTool` serialises for the surfaces the SDK has already parsed; direct React has no payload and is bounded by node/nesting/string caps instead. Measuring bytes in the validator would serialise a document nobody asked to serialise, on every render. |
| Separate `nesting` cap (40) alongside the `depth` cap (6) | `depth` counts containers and is the contract. `nesting` counts raw object levels and exists only so a 20,000-deep chain is a clean rejection rather than a `RangeError` escaping as a 500. |
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

- [ ] **Independent adversarial review of the diff** (shared execution rule 4). Not obtained. Codex was not attempted this session — Wave 0 recorded three failed attempts and the root cause (`scripts/codex-companion.mjs` only detaches under `--background`).
- [ ] Push, open a PR, and let `ci.yml` run against Wave 1.
- [ ] Only then declare the Wave 1 gate closed and start Wave 2.

## Residual limits, stated rather than hidden

1. **`TableCardSchema.parse()` alone does not catch a ragged table.** Documented in the schema and the spec; every real path goes through the validator, but a consumer reaching for the leaf schema directly gets counts only.
2. **`validateWeaveDocument` does not measure payload bytes.** By design (see Key decisions). Direct React consumers get node, nesting and string caps instead.
3. **Node schemas still strip unknown keys** rather than rejecting them; only the envelope is `.strict()`. Rejecting arbitrary props on nodes is Wave 5's "reject URL/JS/command/free-text action props" work.
4. **Chart "known fields" is only enforced when the chart declares `categoryKey` or `valueKeys`.** A chart that declares neither has unconstrained (but bounded) keys.
5. **The `id` field is validated and unique but consumed by nothing.** Reserved for Wave 4's Tabs and Wave 5's registry.
6. **`nesting: 40` was not derived from a stack-depth measurement**, only from the observation that a legal depth-6 document nests about 20. It is a guard rail with headroom, not a tuned number.

## Files to know

| File | Why |
|---|---|
| `packages/weave-primitives/src/schemas/document.ts` | The contract: envelope, root union, cost policy, cross-field rules, the adapter. |
| `packages/weave-primitives/src/schemas/bounds.ts` | `LIMITS` and the bounded primitives, each cap carrying its measurement. |
| `packages/weave-primitives/bench/document-limits.bench.mjs` | The evidence. Self-contained; needs `dist/` only for its last two sections. |
| `docs/specs/weave-document-v1.md` | Contract, recorded benchmark, migration guide, deprecation timetable. |
| `packages/weave-mcp-server/src/tools.ts` | `DashboardGatewaySchema` (F8) and `invokeTool`, which every transport shares. |
| `packages/weave-primitives/src/__tests__/document.test.ts` | 55 cases. Opens with the harness-sanity test that caught the false-green. |
| `packages/weave-primitives/src/__tests__/packaging.test.ts` | Guards the "schemas without a renderer" claim at source level. |

## Resume instructions

1. `cd /Users/pierregallet/Documents/weave-wave-1`, confirm the tree is clean and 1 commit ahead of `0568b4f`.
2. Re-verify before trusting anything:
   ```bash
   TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test
   ```
   Expected exit 0, 417 vitest + 26 `node --test`.
   If Playwright fails with `Executable doesn't exist … chromium_headless_shell-1228`:
   `pnpm --filter @shepherd-creative/weave-mcp-app exec playwright install chromium`.
3. Confirm the lint position:
   ```bash
   node scripts/biome-new-findings.mjs 0568b4f      # NOT `main` — see the warning above
   ```
   Expected: `No new Biome findings. 46 pre-existing finding(s) left untouched.`, exit 0, head 37.
4. Obtain the independent adversarial review of the diff.
5. Then push, open the PR, and update the plan's Wave 1 record to close the gate.

## Warnings

- **Do not merge without Pierre's review.** `main` has a `protect-main` ruleset.
- **Turbo cache is shared with the parent checkout.** Use `TURBO_FORCE=true` for any run you intend to trust.
- **Rebuild `weave-primitives` before running the mcp-server or mcp-app suites** after touching schemas: those packages resolve primitives from `dist/`, and a stale `dist/` makes imports read `undefined` — which is exactly how a whole suite reports green over nothing.
- **`packages/weave-mcp-app/dist/weave-skill.md` is a build copy of SKILL.md** (gitignored, refreshed by `pnpm build`). Rebuild after editing SKILL.md.
- **The Biome gate can report a pre-existing finding you did not introduce**, by design — see Wave 0's "The gate's contract" in the git history of this file. Fix the reported finding; do not loosen the matcher.
