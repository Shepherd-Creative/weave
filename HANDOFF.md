# Handoff: Primitive Portfolio — Wave 0 (truth, documentation and CI gate)

**Generated**: 2026-08-07 · **Updated**: 2026-08-08 (review remediation)
**Branch**: `feature/primitive-portfolio-wave-0` (worktree `/Users/pierregallet/Documents/weave-wave-0`)
**Status**: Implemented, independently reviewed, and all three review findings remediated. **Blocked on the exit gate** — nothing pushed, no PR, so `ci.yml` has still never executed on GitHub.

> Supersedes the previous HANDOFF.md (design-source adapter / PR #5 batch), which is merged and recoverable from git history on `main`.

## Goal

Wave 0 of the approved plan at `.hermes/plans/2026-08-07_223240-primitive-portfolio.md` (parent checkout `/Users/pierregallet/Documents/weave`): make Weave's public claims true, and add the PR CI that protects every later contract wave. No schema, renderer or primitive changes — those are Wave 1+.

## Completed

11 commits on `main@b9b1617`, tree clean, **nothing pushed**.

Wave 0 implementation (8 commits):

- [x] Test-first drift/version guards in `weave-primitives`, `weave-skill`, `weave-mcp-server`
- [x] README + SKILL catalogues reconciled with the actual 13-member Spec union
- [x] `Comparison` recommendation removed → `Stack` of two `KPI`s (it was never built)
- [x] `get_skill` guidance corrected (see the review remediation below, which finished the job)
- [x] B5 counts reconciled; `Spacer`/`Divider` promises removed across 4 CHANGELOGs
- [x] Three misleading `0.0.0` version constants removed (nothing consumed them)
- [x] Five stale doc citations repaired (comment-only edits, zero behaviour change)
- [x] `.github/workflows/ci.yml` — `pull_request` gate: typecheck, test, build, new-Biome-findings-only
- [x] `.claude/settings.json` Stop hook schema repaired (was silently inert)
- [x] Changeset added (minor × 3)

Review remediation, 2026-08-08 (3 commits — see next section for the findings):

- [x] `7c6a5f8` Biome gate matches through the diff, not a position-blind fingerprint
- [x] `e3da150` Citation grammar widened; cited evidence must resolve inside the repository
- [x] `d5c33ee` Composition skill registered as the MCP resource `weave://skill.md`

## The independent review, and what was done about it

An independent adversarial review of the Wave 0 diff returned three real defects. All three are fixed, each RED-first.

### 1. High — `scripts/biome-new-findings.mjs`: baseline fingerprint ignores range

> Its baseline fingerprint ignores range, so a PR can remove a baseline diagnostic and introduce the same category/message elsewhere in that file without being detected.

Correct, and reproduced end to end. The fingerprint was `file :: category :: message`, with line and column deliberately excluded so unrelated edits could shift a pre-existing finding without failing the PR. A change that deleted one baseline diagnostic and introduced an identical one elsewhere in the same file spent its own budget and reported a clean pass.

**Fix.** Identity is now file + rule + message + *position tracked through `git diff -U0`*. A baseline finding is claimable by a head finding in exactly two ways:

1. the code holding it was untouched, so git's hunks say it merely shifted — matched at its mapped line, exactly;
2. the change rewrote the very region holding it, so its line has no image — matched anywhere inside the **head side of that same hunk**.

Anything else is new. The diff is a required input: if it cannot be computed the gate exits 2, never 0. Renames are followed, so a moved file no longer reports its whole baseline as new.

**Trade-off taken.** Rule 2 is bounded by the hunk, not the file, so a change that rewrites an entire file in one hunk degrades to file-level matching. That is the honest limit of positional evidence and such a diff is loud in review. Raw line equality is never used on its own — lines are only compared after being mapped through the diff, which is what keeps harmless shifts from flagging. Biome's file-level `format` diagnostic (one per file, line 0) still cannot distinguish "already unformatted" from "made worse"; unchanged from before and out of the gate's reach — the fix is to format the file.

### 2. Medium — both `doc-citations` tests: grammar too narrow, resolution too generous

> Expand the documented citation grammar to catch quoted, bracketed and Markdown-link path citations. Add negative RED tests for unresolved forms. Reject absolute paths and repository-escaping traversal; cited evidence must resolve inside this repository.

Both halves confirmed. The grammar only recognised a citation preceded by whitespace, `(` or a backtick, so `"quoted"`, `[bracketed]` and `<angled>` citations were never scanned — a stale citation in those forms passed by not being seen. Worse, `resolves()` joined the cited path onto the repo root and the citing file's directory and asked only whether *something* exists there, so `../../../..` traversal resolved against files **outside** the checkout.

**Fix.** Grammar now covers bare, backticked, parenthesised, quoted, bracketed, angled and Markdown-link forms. Cited evidence must be a real file **inside** this repository: absolute paths are rejected even when they exist, and traversal is allowed only while it stays in the tree.

**Trade-off taken.** Bare absolute-looking tokens are still deliberately not harvested: in prose `/skill.md` is an HTTP route far more often than a file, and this server serves exactly that one. Measured before deciding — a grammar that harvests bare absolute tokens picks up `/skill.md` ×3 from `weave-mcp-server`'s own comments and fails the guard on a correct comment. Absolute paths that arrive by Markdown link are rejected at resolution instead, and a test pins the route exclusion so it cannot be quietly widened.

### 3. Low — the MCP skill pointer is not actionable for a generic MCP client

> Generic MCP clients cannot action a relative `GET /skill.md` hint. Prefer a real MCP resource/tool only if the existing server architecture supports it narrowly and testably without scope growth.

It does support it, narrowly: this package already depends on `weave-skill` and `loadSkill()` already backs the HTTP route in the same Hono app, and the pinned SDK (1.29.0) exposes `registerResource`. So the guide is now also registered as the MCP resource **`weave://skill.md`**, and the server advertises the `resources` capability. That is a custom scheme, not a URL — an MCP resource URI is an opaque handle the server resolves itself, so **no public base URL and no new configuration was invented**.

The pointer names both channels, because a client can only follow one of them and both are true of this server: MCP clients read the resource, REST callers reading `/tools` use `GET /skill.md`. It stays out of the shared `TOOLS` descriptor — the stdio MCP App imports that array and serves neither channel, so a pointer baked in there would be the same false promise the old `get_skill` instruction made. The surface-neutrality guard now covers the resource URI as well as the route.

## Not Yet Done — this is the exit gate

- [ ] **Push the branch and open a PR against `main`** so `ci.yml` executes for the first time. It has never run on GitHub.
- [x] ~~Obtain the independent adversarial review~~ — obtained; its three findings are remediated above.
- [ ] Only then declare the Wave 0 gate closed and start Wave 1.

## Failed Approaches (Don't Repeat These)

- **Codex review, 3 attempts, no retrievable output.** (1) Via the `codex:rescue` subagent: the companion call hit the 120 s foreground timeout, was backgrounded, and left a 0-byte output with no job registered. (2) Direct `node codex-companion.mjs task "<prompt>"`: registered job `task-msjgx6tc-a2qisz` but the worker is a **child of the invoking shell**, so it died when that shell was stopped. **Root cause:** `scripts/codex-companion.mjs:643-650` only detaches (`detached: true` + `child.unref()`) under `--background`. (3) `task --background --fresh` exited **144** without registering a job. The review that produced the three findings above came from elsewhere; no further Codex attempt was made.
- **`pnpm typecheck -- --force`** to bypass the turbo cache: the `--force` is forwarded to `tsc`, which dies. Use `TURBO_FORCE=true pnpm typecheck` instead.
- **Trusting the first green baseline.** Turbo replayed cache entries from the *parent* checkout, so the first `pnpm typecheck` was a cache hit, not a real run. Always `TURBO_FORCE=true` in this worktree.
- **`pnpm exec playwright install chromium` from the repo root** installed revision 1208; `weave-mcp-app` pins playwright 1.61.1 and needs **1228**. Install from the package: `pnpm --filter @shepherd-creative/weave-mcp-app exec playwright install chromium`.
- **`biome check --changed --since=<base>` as the CI lint gate.** Rejected: it still fails a PR for pre-existing findings inside a file the PR merely touched.
- **A position-blind fingerprint as the gate's identity.** The first version of the replacement. See finding 1 — it is bypassable by relocation, and the bypass looks exactly like a clean pass.
- **Harvesting bare absolute paths as citations.** Measured: it flags `GET /skill.md` (a route this server really serves) as a missing file. See finding 2.
- **`node --test scripts/__tests__/`** (directory argument) fails with `MODULE_NOT_FOUND` on Node 22.23. Pass the glob: `node --test scripts/__tests__/*.test.mjs`.
- **Naming the rejected primitives in the README** while explaining why they don't exist: the guard forbids the strings `Divider`/`Spacer` anywhere in that file.

## Key Decisions

| Decision | Rationale |
|---|---|
| Gate identity = file + rule + message + **diff-mapped position** | A position-blind identity cannot tell a shifted finding from a relocated one, and that gap is a silent pass. Bounded by the hunk, so an in-place edit still does not fail a PR on debt it merely touched. |
| The diff is a **required** gate input | Without it the comparison is guesswork. No diff → exit 2. A broken gate must never look like a clean pass. |
| Gate matcher extracted to `scripts/lib/biome-diff.mjs` | The decision "is this finding new?" is the part worth testing, and it can be tested without running Biome or git. `pnpm test` now also runs `node --test` over `scripts/`. |
| Citations must resolve **inside** the repository | `existsSync` alone confirms files this checkout does not contain — a citation that resolves for the wrong reason, on one machine only. |
| Bare absolute tokens are not citations | Routes and absolute paths are indistinguishable in prose, and this repo's comments legitimately cite a route. Rejected at resolution instead, and pinned by a test. |
| Skill exposed as an **MCP resource**, not a new tool or a URL | The surface already loads the skill; `registerResource` is in the pinned SDK. A resource URI is an opaque handle, so nothing invents a base URL or new config. A tool would duplicate the MCP App's `get_skill` on a surface that already serves the content. |
| Skill pointer is **surface-local**, not in the shared `TOOLS` descriptor | `TOOLS` is imported by both this server and the stdio MCP App. A pointer baked into the shared array is false on whichever surface it wasn't written for — exactly how the original `get_skill` defect arose. |
| Gate exits **2** (never 0) when it cannot run | A broken gate must never be mistaken for a clean pass. |
| CHANGELOG history preserved, corrections appended | The stale sentences are dated forward-looking promises. |

## Current State

**Working**: everything. Tree clean, 11 commits. All gates re-run on the committed tree after the falsification cycles:

| Gate | Result |
|---|---|
| `TURBO_FORCE=true pnpm typecheck` | exit 0 |
| `TURBO_FORCE=true pnpm test` | exit 0 — **279 passed** (266 vitest + 13 `node --test`); baseline 240 |
| `TURBO_FORCE=true pnpm build` | exit 0 |
| `node scripts/biome-new-findings.mjs main` | exit 0 — head 46, base 48, **0 new** |
| `pnpm lint` | exit 1 — **46 diagnostics** (31 errors / 6 warnings / 9 infos) |

`pnpm lint` exit 1 is the **pre-existing baseline**, not a regression. The baseline dropped 48 → 46 because formatting the `weave-mcp-server` files this work already had to touch cleared two pre-existing findings (one `format`, one `organizeImports`). Judge lint by `scripts/biome-new-findings.mjs`, never by the raw exit code.

**Broken**: nothing locally. The only unproven item is the un-run GitHub workflow.

**Uncommitted Changes**: none in this worktree. The plan file in the **parent** checkout (`/Users/pierregallet/Documents/weave/.hermes/plans/2026-08-07_223240-primitive-portfolio.md`) carries the Wave 0 execution record plus the remediation record, and is uncommitted there.

## Files to Know

| File | Why It Matters |
|---|---|
| `scripts/lib/biome-diff.mjs` | The gate's identity rules: diff parsing, base→head line mapping, and the two ways a baseline finding can be claimed. Documents its own limits. |
| `scripts/__tests__/biome-diff.test.mjs` | 13 `node --test` cases, including the two relocation repros that were RED before the fix. |
| `scripts/biome-new-findings.mjs` | The gate's I/O: worktrees the base ref, runs Biome twice, computes the diff. Exit 0/1/2. |
| `.github/workflows/ci.yml` | The PR gate. Never executed on GitHub yet. |
| `packages/weave-mcp-server/src/mcp.ts` | Registers the 5 tools **and** the `weave://skill.md` resource; declares the `resources` capability. |
| `packages/weave-mcp-server/src/tools.ts` | `SKILL_RESOURCE_URI` + `SKILL_ENDPOINT_HINT` + `describeForHttpSurface`. Shared `TOOLS` stays transport-neutral. |
| `packages/*/src/__tests__/catalogue-drift.test.ts` | Union/catalogue/version guards, plus surface-neutrality of the shared descriptors. |
| `packages/*/src/__tests__/doc-citations.test.ts` | Citation grammar + containment scanners (2 packages, mirrored). |

## Code Context

The gate's two claim rules, from `scripts/lib/biome-diff.mjs`:

```js
const match =
  pool.find((c) => !c.claimed && c.line === line) ??                        // shifted, untouched code
  pool.find((c) => !c.claimed && c.hunk !== null && withinHeadSide(c.hunk, line)); // the change rewrote its region
```

Citation containment, from both `doc-citations.test.ts` files:

```ts
function resolves(cited: string, citingFile: string): boolean {
  if (path.isAbsolute(cited)) return false;
  return [path.resolve(REPO_ROOT, cited), path.resolve(path.dirname(citingFile), cited)].some(
    (candidate) => insideRepo(candidate) && existsSync(candidate),
  );
}
```

Gate contract:

```bash
node scripts/biome-new-findings.mjs origin/main
# exit 0 = no new findings   exit 1 = new findings   exit 2 = gate could not run
```

## Resume Instructions

1. `cd /Users/pierregallet/Documents/weave-wave-0` and confirm the tree is clean at `d5c33ee`.
2. Re-verify before trusting anything:
   ```bash
   TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test
   ```
   - Expected: exit 0, **266 vitest tests + 13 `node --test`**.
   - If Playwright suites fail with `Executable doesn't exist ... chromium_headless_shell-1228`: run `pnpm --filter @shepherd-creative/weave-mcp-app exec playwright install chromium`.
3. Confirm the lint position is unchanged:
   ```bash
   node scripts/biome-new-findings.mjs main
   ```
   - Expected: `No new Biome findings. 48 pre-existing finding(s) left untouched.` exit 0 (head 46).
   - If it reports new findings, `pnpm format` **only the files you touched** — never repo-wide.
4. Push and open the PR (this is what closes the gate):
   ```bash
   git push -u origin feature/primitive-portfolio-wave-0
   gh pr create -R Shepherd-Creative/weave --base main
   ```
   - Expected: the **CI** workflow starts on the PR and all four steps pass.
   - If `Install Playwright Chromium` fails: check the `Resolve Playwright version` step parsed `1.61.1`.
   - If the Biome step exits 2: `origin/${{ github.base_ref }}` did not resolve, or `git diff` against it failed — verify `actions/checkout` ran with `fetch-depth: 0`.
5. Then update the plan's Wave 0 execution record to close the gate.

## Warnings

- **Do not merge without Pierre's review.** Human gate; `main` has a `protect-main` ruleset (PR required, no force push).
- **Turbo cache is shared with the parent checkout.** A bare `pnpm test` here can replay results computed in `/Users/pierregallet/Documents/weave`. Use `TURBO_FORCE=true` for any run you intend to trust.
- **`pnpm lint` exits 1 by design.** 46 pre-existing findings. Judge lint by `scripts/biome-new-findings.mjs`.
- **The gate now needs a real diff, not just a reachable base ref.** In a shallow clone `git rev-parse` can succeed while `git diff` has nothing to compare; the gate exits 2 rather than guessing.
- **`packages/weave-mcp-app/dist/weave-skill.md` is a build copy of SKILL.md** (gitignored, refreshed by `pnpm build`). If you edit SKILL.md, rebuild before testing the MCP App.
- **The `weave-skill` catalogue is cross-checked from `weave-mcp-server`**, not from `weave-skill` itself — that package has no dependency on `weave-primitives` and adding one was deliberately avoided.
