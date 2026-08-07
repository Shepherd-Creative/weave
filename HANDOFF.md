# Handoff: Primitive Portfolio — Wave 0 (truth, documentation and CI gate)

**Generated**: 2026-08-07
**Branch**: `feature/primitive-portfolio-wave-0` (worktree `/Users/pierregallet/Documents/weave-wave-0`)
**Status**: Implemented and locally verified. **Blocked on the exit gate** — nothing pushed, no PR, no independent Codex review.

> Supersedes the previous HANDOFF.md (design-source adapter / PR #5 batch), which is merged and recoverable from git history on `main`.

## Goal

Wave 0 of the approved plan at `.hermes/plans/2026-08-07_223240-primitive-portfolio.md` (parent checkout `/Users/pierregallet/Documents/weave`): make Weave's public claims true, and add the PR CI that protects every later contract wave. No schema, renderer or primitive changes — those are Wave 1+.

## Completed

7 commits on `main@b9b1617`, tree clean at `3716146`, **nothing pushed**.

- [x] Test-first drift/version guards (+23 assertions) in `weave-primitives`, `weave-skill`, `weave-mcp-server`
- [x] README + SKILL catalogues reconciled with the actual 13-member Spec union
- [x] `Comparison` recommendation removed → `Stack` of two `KPI`s (it was never built)
- [x] `get_skill` guidance corrected: HTTP/MCP surfaces now point at `GET /skill.md`, which they really serve
- [x] B5 counts reconciled; `Spacer`/`Divider` promises removed across 4 CHANGELOGs
- [x] Three misleading `0.0.0` version constants removed (nothing consumed them)
- [x] Five stale doc citations repaired (comment-only edits, zero behaviour change)
- [x] `.github/workflows/ci.yml` — `pull_request` gate: typecheck, test, build, new-Biome-findings-only
- [x] `.claude/settings.json` Stop hook schema repaired (was silently inert)
- [x] Changeset added (minor × 3)

## Not Yet Done — these are the exit gate

- [ ] **Push the branch and open a PR against `main`** so `ci.yml` executes for the first time. It has never run on GitHub.
- [ ] **Obtain the independent Codex adversarial review** required by the plan's shared execution rule 4. See Failed Approaches — use `task --background`.
- [ ] Only then declare the Wave 0 gate closed and start Wave 1.

## Failed Approaches (Don't Repeat These)

- **Codex review, 3 attempts, no retrievable output.** (1) Via the `codex:rescue` subagent: the companion call hit the 120 s foreground timeout, was backgrounded, and left a 0-byte output with no job registered. (2) Direct `node codex-companion.mjs task "<prompt>"`: registered job `task-msjgx6tc-a2qisz` but the worker is a **child of the invoking shell**, so it died when that shell was stopped — only `Starting Codex Task.` was ever written to its log. (3) `task --background --fresh`: exited **144** without registering a job. **Root cause for (2):** `scripts/codex-companion.mjs:643-650` only detaches (`detached: true` + `child.unref()`) under `--background`. **Next attempt must pass `--background`, then poll `status --json` and fetch with `result`.** Also note `task --help` is not parsed as a flag — it registers a job titled `--help`.
- **`pnpm typecheck -- --force`** to bypass the turbo cache: the `--force` is forwarded to `tsc`, which dies. Use `TURBO_FORCE=true pnpm typecheck` instead.
- **Trusting the first green baseline.** Turbo replayed cache entries from the *parent* checkout (`/Users/pierregallet/Documents/weave`), so the first `pnpm typecheck` was a cache hit, not a real run. Always `TURBO_FORCE=true` in this worktree.
- **`pnpm exec playwright install chromium` from the repo root** installed revision 1208; `weave-mcp-app` pins playwright 1.61.1 and needs **1228**. Install from the package: `pnpm --filter @shepherd-creative/weave-mcp-app exec playwright install chromium`.
- **`biome check --changed --since=<base>` as the CI lint gate.** Rejected: it still fails a PR for pre-existing findings inside a file the PR merely touched, and the 48 baseline findings sit exactly in the files Waves 1–3 will edit most. Replaced with a base-vs-head fingerprint diff.
- **`for f in $FILES`** (space-joined string) in zsh — no word splitting, so the loop body received one giant filename and silently did nothing. Use an array: `files=(a b c); for f in "${files[@]}"`.
- **Naming the rejected primitives in the README** while explaining why they don't exist: the guard forbids the strings `Divider`/`Spacer` anywhere in that file. The explanation is phrased positively instead ("`Grid`/`Stack` gaps and density own whitespace").

## Key Decisions

| Decision | Rationale |
|---|---|
| **Remove** the `0.0.0` constants rather than inject build-time metadata | tsup `define` would make the constant a build artifact that vitest (which never runs tsup) can't see, so the guard would test the wrong thing. Nothing consumed the constants. `package.json` is already the source of truth. |
| Skill pointer is **surface-local**, not in the shared `TOOLS` descriptor | `TOOLS` is imported by both `weave-mcp-server` (HTTP, serves `/skill.md`) and `weave-mcp-app` (stdio, registers `get_skill`). A pointer baked into the shared array is false on whichever surface it wasn't written for — exactly how the original `get_skill` defect arose. |
| Biome gate = base-vs-head fingerprint diff, fingerprint excludes line/column | Unrelated edits shift line numbers; a shifted pre-existing finding is not a new finding. |
| Gate exits **2** (never 0) when it cannot run | A broken gate must never be mistaken for a clean pass. |
| README drops the "of 18" denominator | The denominator was invented and is itself a drift generator; the shipped count is asserted against the union instead. |
| CHANGELOG history preserved, corrections appended | The stale sentences are dated forward-looking promises; the bare `12` for a 13-item list is a plain arithmetic error and was fixed in place. |
| SKILL/README/CHANGELOG-only scope | Wave 0 explicitly excludes schema and renderer work. Confirmed: the only `src/` diffs outside tests are **comment-only**. |

## Current State

**Working**: everything. Tree clean, 7 commits, all four gates re-run after the falsification cycles:

| Gate | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0 — **240 passed** (baseline 217) |
| `pnpm build` | exit 0 |
| `pnpm lint` | exit 1 — **48 diagnostics, 0 new** |

`pnpm lint` exit 1 is the **pre-existing baseline** (33 errors / 6 warnings / 9 infos), not a regression. Confirmed two ways: per-category diff against a JSON baseline captured before any edit, and `node scripts/biome-new-findings.mjs main` reporting `No new Biome findings`.

**Broken**: nothing locally. The unproven items are the un-run GitHub workflow and the missing Codex review.

**Uncommitted Changes**: none in this worktree. The plan file in the **parent** checkout (`/Users/pierregallet/Documents/weave/.hermes/plans/2026-08-07_223240-primitive-portfolio.md`) was updated with a Wave 0 execution record and is uncommitted there.

## Files to Know

| File | Why It Matters |
|---|---|
| `scripts/biome-new-findings.mjs` | The new-findings-only Biome gate. Worktrees the base ref, fingerprints both sides. Exit 0/1/2. |
| `.github/workflows/ci.yml` | The PR gate. Never executed on GitHub yet. |
| `packages/weave-mcp-server/src/tools.ts` | `SKILL_ENDPOINT_HINT` + `describeForHttpSurface`. Shared `TOOLS` stays transport-neutral. |
| `packages/*/src/__tests__/catalogue-drift.test.ts` | Union/catalogue/version guards (3 packages). |
| `packages/*/src/__tests__/doc-citations.test.ts` | Comment-citation scanners (2 packages). |
| `packages/weave-skill/SKILL.md` | Model-facing. §5.3 two-KPI guidance, §9 catalogue. |

## Code Context

The Spec union is enumerated from Zod internals; it **throws** rather than returning an empty set, so the guard cannot pass by measuring nothing:

```ts
function specUnionMembers(): string[] {
  const lazyDef = (SpecSchema as unknown as { _def?: { getter?: () => unknown } })._def;
  const inner = typeof lazyDef?.getter === "function" ? lazyDef.getter() : SpecSchema;
  const optionsMap = (inner as { _def?: { optionsMap?: Map<string, unknown> } })._def?.optionsMap;
  if (!optionsMap || optionsMap.size === 0) throw new Error("Zod internals changed — update this guard");
  return [...optionsMap.keys()];   // 13 members
}
```

Surface-local skill pointer (`packages/weave-mcp-server/src/tools.ts`), consumed by `toolsJsonManifest()` and by `mcp.ts`:

```ts
export const SKILL_ENDPOINT_HINT =
  " The full composition guide is served by this server at `GET /skill.md`.";

export function describeForHttpSurface(tool: ToolDescriptor): string {
  return tool.name === "render_dashboard" ? tool.description + SKILL_ENDPOINT_HINT : tool.description;
}
```

Biome gate contract:

```bash
node scripts/biome-new-findings.mjs origin/main
# exit 0 = no new findings   exit 1 = new findings   exit 2 = gate could not run
```

## Resume Instructions

1. `cd /Users/pierregallet/Documents/weave-wave-0` and confirm the tree is clean at `3716146`.
2. Re-verify before trusting anything:
   ```bash
   TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test
   ```
   - Expected: exit 0, **240 tests passed**.
   - If Playwright suites fail with `Executable doesn't exist ... chromium_headless_shell-1228`: run `pnpm --filter @shepherd-creative/weave-mcp-app exec playwright install chromium`.
3. Confirm the lint position is unchanged:
   ```bash
   node scripts/biome-new-findings.mjs main
   ```
   - Expected: `No new Biome findings. 48 pre-existing finding(s) left untouched.` exit 0.
   - If it reports new findings, `pnpm format` **only the files you touched** — never repo-wide, that would commit 48 files of unrelated churn.
4. Get the Codex review (**required before the gate closes**):
   ```bash
   node "$HOME/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" \
     task --background --fresh "<review prompt>"
   node "$HOME/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" status --json
   node "$HOME/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" result
   ```
   - `--background` is load-bearing; without it the worker dies with your shell.
   - Focus it on the Biome gate failing open and on the HTTP/MCP skill guidance.
5. Push and open the PR (this is what closes the gate's first item):
   ```bash
   git push -u origin feature/primitive-portfolio-wave-0
   gh pr create -R Shepherd-Creative/weave --base main
   ```
   - Expected: the **CI** workflow starts on the PR and all four steps pass.
   - If `Install Playwright Chromium` fails: check the `Resolve Playwright version` step parsed `1.61.1` from `playwright --version`.
   - If the Biome step exits 2: `origin/${{ github.base_ref }}` did not resolve — verify `actions/checkout` ran with `fetch-depth: 0`.
6. Reconcile any Codex findings, then update the plan's Wave 0 execution record to close the gate.

## Warnings

- **Do not merge without Pierre's review.** Human gate; `main` has a `protect-main` ruleset (PR required, no force push).
- **Turbo cache is shared with the parent checkout.** A bare `pnpm test` here can replay results computed in `/Users/pierregallet/Documents/weave`. Use `TURBO_FORCE=true` for any run you intend to trust.
- **`pnpm lint` exits 1 by design.** 48 pre-existing findings. Judge lint by `scripts/biome-new-findings.mjs`, not by the raw exit code.
- **`packages/weave-mcp-app/dist/weave-skill.md` is a build copy of SKILL.md** (gitignored, refreshed by `pnpm build`). If you edit SKILL.md, rebuild before testing the MCP App, or the app serves the stale skill.
- **The `weave-skill` catalogue is cross-checked from `weave-mcp-server`**, not from `weave-skill` itself — that package has no dependency on `weave-primitives` and adding one was deliberately avoided.
- The adversarial pass recorded in the plan is the **implementer's own**, not independent. Treat it as unverified until Codex or a second reviewer confirms it.
