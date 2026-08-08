# Handoff: Primitive Portfolio — Wave 0 (truth, documentation and CI gate)

**Generated**: 2026-08-07 · **Updated**: 2026-08-08 (third review remediation)
**Branch**: `feature/primitive-portfolio-wave-0` (worktree `/Users/pierregallet/Documents/weave-wave-0`)
**Status**: Implemented, independently reviewed **three times**, and all findings from all three rounds remediated. **Blocked on the exit gate** — nothing pushed, no PR, so `ci.yml` has still never executed on GitHub.

> Supersedes the previous HANDOFF.md (design-source adapter / PR #5 batch), which is merged and recoverable from git history on `main`.

## Goal

Wave 0 of the approved plan at `.hermes/plans/2026-08-07_223240-primitive-portfolio.md` (parent checkout `/Users/pierregallet/Documents/weave`): make Weave's public claims true, and add the PR CI that protects every later contract wave. No schema, renderer or primitive changes — those are Wave 1+.

## Completed

18 commits ahead of `main@b9b1617`, tree clean, **nothing pushed**. (Earlier revisions of this document said 13 and 11; both were wrong — `git rev-list --count main..HEAD` is the number.)

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

Review remediation round 1, 2026-08-08 (3 commits — see next section for the findings):

- [x] `7c6a5f8` Biome gate matches through the diff, not a position-blind fingerprint
- [x] `e3da150` Citation grammar widened; cited evidence must resolve inside the repository
- [x] `d5c33ee` Composition skill registered as the MCP resource `weave://skill.md`

Review remediation round 2, 2026-08-08 (2 commits — a second review found both round-1 fixes incomplete):

- [x] `543f9ec` Gate requires source evidence before claiming a finding inside a rewritten hunk
- [x] `ec75fd1` Citation grammar requires a boundary after the extension

Review remediation round 3, 2026-08-08 (2 commits — a third review found both round-2 fixes incomplete):

- [x] `4b41ef5` Gate claims a rewritten-hunk finding only on a one-to-one anchor
- [x] `f45d9fe` Citation suffix grammar defined by its terminators, not an allowlist

## The independent review, and what was done about it

An independent adversarial review of the Wave 0 diff returned three real defects. All three are fixed, each RED-first.

### 1. High — `scripts/biome-new-findings.mjs`: baseline fingerprint ignores range

> Its baseline fingerprint ignores range, so a PR can remove a baseline diagnostic and introduce the same category/message elsewhere in that file without being detected.

Correct, and reproduced end to end. The fingerprint was `file :: category :: message`, with line and column deliberately excluded so unrelated edits could shift a pre-existing finding without failing the PR. A change that deleted one baseline diagnostic and introduced an identical one elsewhere in the same file spent its own budget and reported a clean pass.

**Fix.** Identity is now file + rule + message + *position tracked through `git diff -U0`*. A baseline finding is claimable by a head finding in exactly two ways:

1. the code holding it was untouched, so git's hunks say it merely shifted — matched at its mapped line, exactly;
2. the change rewrote the very region holding it, so its line has no image — matched anywhere inside the **head side of that same hunk**.

Anything else is new. The diff is a required input: if it cannot be computed the gate exits 2, never 0. Renames are followed, so a moved file no longer reports its whole baseline as new.

> ⚠️ **Superseded by round-2 finding A below.** Rule 2 as stated here — "matched anywhere inside the head side of that same hunk" — was still a silent pass for a same-hunk relocation, and the trade-off recorded at the time ("bounded by the hunk, that is the honest limit of positional evidence") was wrong: position inside a `-U0` hunk is not evidence at all. Rule 2 now additionally requires the offending source line to be byte-identical. Read this section for the cross-hunk case it did fix, and finding A for the current rule.

Raw line equality is never used on its own — lines are only compared after being mapped through the diff, which is what keeps harmless shifts from flagging. Biome's file-level `format` diagnostic (one per file, line 0) still cannot distinguish "already unformatted" from "made worse"; unchanged from before and out of the gate's reach — the fix is to format the file.

### 2. Medium — both `doc-citations` tests: grammar too narrow, resolution too generous

> Expand the documented citation grammar to catch quoted, bracketed and Markdown-link path citations. Add negative RED tests for unresolved forms. Reject absolute paths and repository-escaping traversal; cited evidence must resolve inside this repository.

Both halves confirmed. The grammar only recognised a citation preceded by whitespace, `(` or a backtick, so `"quoted"`, `[bracketed]` and `<angled>` citations were never scanned — a stale citation in those forms passed by not being seen. Worse, `resolves()` joined the cited path onto the repo root and the citing file's directory and asked only whether *something* exists there, so `../../../..` traversal resolved against files **outside** the checkout.

**Fix.** Grammar now covers bare, backticked, parenthesised, quoted, bracketed, angled and Markdown-link forms. Cited evidence must be a real file **inside** this repository: absolute paths are rejected even when they exist, and traversal is allowed only while it stays in the tree.

**Trade-off taken.** Bare absolute-looking tokens are still deliberately not harvested: in prose `/skill.md` is an HTTP route far more often than a file, and this server serves exactly that one. Measured before deciding — a grammar that harvests bare absolute tokens picks up `/skill.md` ×3 from `weave-mcp-server`'s own comments and fails the guard on a correct comment. Absolute paths that arrive by Markdown link are rejected at resolution instead, and a test pins the route exclusion so it cannot be quietly widened.

### 3. Low — the MCP skill pointer is not actionable for a generic MCP client

> Generic MCP clients cannot action a relative `GET /skill.md` hint. Prefer a real MCP resource/tool only if the existing server architecture supports it narrowly and testably without scope growth.

It does support it, narrowly: this package already depends on `weave-skill` and `loadSkill()` already backs the HTTP route in the same Hono app, and the pinned SDK (1.29.0) exposes `registerResource`. So the guide is now also registered as the MCP resource **`weave://skill.md`**, and the server advertises the `resources` capability. That is a custom scheme, not a URL — an MCP resource URI is an opaque handle the server resolves itself, so **no public base URL and no new configuration was invented**.

The pointer names both channels, because a client can only follow one of them and both are true of this server: MCP clients read the resource, REST callers reading `/tools` use `GET /skill.md`. It stays out of the shared `TOOLS` descriptor — the stdio MCP App imports that array and serves neither channel, so a pointer baked in there would be the same false promise the old `get_skill` instruction made. The surface-neutrality guard now covers the resource URI as well as the route.

## The second review, and what was done about it

A second independent review proved **both** round-1 fixes incomplete. Neither was wrong in direction; both stopped one step short of real evidence. Findings verbatim:

### A. High — `scripts/lib/biome-diff.mjs:219`: same-hunk relocation still consumed

> The matcher still permits a relocation bypass when the original diagnostic and the newly introduced identical diagnostic are in the **same rewritten `-U0` hunk**. A baseline finding whose original line was deleted gets `line: null` and its hunk retained; line 219 then claims it for *any* same-fingerprint head finding inside that hunk. I executed `findIntroduced` with a three-line replacement that removed the baseline lint finding at line 10 and added the same finding at line 12; it returned `introduced: 0`.

Reproduced exactly (`introduced: 0`). Round 1 documented "bounded by the hunk" as an accepted trade-off; that was the wrong call, because inside the hunk it was still claiming on position alone.

**What evidence exists.** Checked before designing: Biome's JSON reporter emits only `severity`, `message`, `category`, `location{path,start,end}` and `advices` — and `advices` is another position plus generic prose (`"Check the React documentation."`). **No source text, no stable diagnostic id.** So the only identity evidence is what the gate reads from the two trees itself.

**Fix.** Rule 2 now claims a baseline finding only when the **offending source line is byte-identical (trimmed) on both sides**. Base sources are read from the base worktree before it is torn down; an unreadable file yields no anchor, and no anchor means no claim. Where identity cannot be proven the gate **fails closed** and reports the finding.

**Sensitivity trade-off.** Edit the very line carrying a pre-existing finding and, if the finding survives, it is now reported as new. The remedy is cheap — fix the finding on the line you were already editing — and it is far narrower than `--changed`, which fails a PR for any pre-existing finding anywhere in a file it touched. A multi-line finding is unaffected while its *anchor* line is untouched, which is why adding an import does not flag a file's `organizeImports` finding (pinned by a test).

**Residual, stated plainly.** A line moved **verbatim** inside a rewritten hunk is still treated as the same finding. The bytes are identical, so nothing distinguishes "survived a reshuffle" from "removed and retyped", and calling identical code a new finding would flag pure reorderings.

> ⚠️ **Narrowed by round-3 finding I below.** That residual now applies only when the anchor is **unique** in the hunk. Round 2 also left the anchor match itself greedy — with the same anchor present twice, it consumed an arbitrary candidate. It no longer does.

**Falsified end to end on real code** — one identical planted tree, a baseline `noArrayIndexKey` removed at `NoteCard.tsx:19` and a *different* one introduced at `:20`, both inside the single hunk `@@ -19 +19,2 @@`:

| Matcher | Result |
|---|---|
| round-1 (`git show HEAD:`) | **exit 0** — "No new Biome findings" |
| round-2 | **exit 1** — `NoteCard.tsx:20` reported |

### B. Medium — both `doc-citations` tests: no boundary after the extension

> Neither citation regex requires a boundary after the extension. Consequently, a nonexistent cited target such as `README.md.bak` is harvested as `README.md`; because the repository's `README.md` exists, `resolves()` accepts it. I executed both regexes against bare and Markdown-link examples and both returned `README.md`.

Reproduced exactly, in both the bare and the link form. The extension must now end the path, and any suffix that follows stays **attached** to the citation — so the malformed citation is reported as unresolvable rather than silently resolving to a file the comment never named. The trailing part cannot end on a `.`, so a citation at the end of a sentence still stops before the full stop.

Measured before committing: across both packages' real sources the new grammar harvests **exactly the same 13 citations** as the old one — nothing added, nothing removed. The change bites only on the malformed case. It immediately caught one real unresolvable citation: the fix's own explanatory comment, which had named a suffixed path in prose. The comments now describe the shape instead of citing it.

> ⚠️ **Superseded by round-3 finding II below.** The boundary was written as an **allowlist** of suffix characters (`[A-Za-z0-9._-]`), so it only caught the suffixes that had been thought of. A tilde backup suffix fell straight through the new boundary, reproducing the very defect this fix was for.

## The third review, and what was done about it

A third independent review proved **both** round-2 fixes incomplete, in the same way each time: the fix had closed the case it was shown and left the general shape open. Both findings verbatim, both remediated RED-first.

**Policy chosen by the user before implementation, and applied throughout:** *fail closed on ambiguous rewritten-hunk matches, accepting cleanup of preserved debt where identity cannot be proven.*

### I. High — `scripts/lib/biome-diff.mjs:279-282`: duplicate identical anchors are still claimed

> The matcher treats a matching trimmed source line as sufficient identity evidence, then arbitrarily consumes the first unclaimed same-fingerprint candidate. With two identical baseline anchors in one rewritten hunk, deleting one occurrence and introducing a different identical occurrence leaves the same diagnostic count and returns no introduced finding. This contradicts the documented fail-closed rule where identity cannot actually be proven. Reproduced with two baseline and two head `noArrayIndexKey` diagnostics on identical `<li key={i}/>` lines in one `-U0` hunk: `findIntroduced(...)` returned `[]`.

Reproduced exactly, standalone, before any edit: `introduced count: 0`. The reviewer is right about the shape of the error, not just the case. Round 2 required *evidence* and then still made an *arbitrary choice* among the candidates that evidence produced — and an arbitrary choice is precisely what "fail closed" is supposed to exclude. Two identical source lines are identical evidence; they identify a set, not a finding.

**Fix.** Rule 2 now runs in two passes. First it records every pairing the anchors permit, and how many head findings each baseline finding attracts. Then it claims a baseline finding only when the head finding has **exactly one** candidate **and** that candidate has **exactly one** suitor. Everything else is reported. Rule 1 is untouched and deliberately so: an unmodified line has one known head line, so nothing is being chosen between.

Uniqueness is judged pairwise, not by search. No attempt is made to untangle a larger ambiguous cluster into a best global pairing — more claims would mean more inference, and inference is what fails open.

**The false positive this buys, stated plainly and accepted per the chosen policy.** Rewrite a hunk holding two identical offending lines and **both are reported**, even when the change merely preserved them or removed one of them. Pre-existing debt in that region has to be cleaned up rather than carried.

**Falsified end to end on real Biome and real git**, not just on the unit matcher. The realistic way this is reached is re-indentation: anchors are trimmed, so re-indenting a block leaves the anchors identical while git rewrites every line of it into one hunk. A planted `PlantedDupe.tsx` with two identical `<li key={i}>{r}</li>` lines was committed as the base, then wrapped in a `<div>` (format-clean, so no `format` diagnostic confounds the result), producing a single hunk `@@ -3,8 +3,10 @@` covering both:

| Matcher | Result |
|---|---|
| round-2 (`363cb37`) | **exit 0** — "No new Biome findings" |
| round-3 (`f45d9fe`) | **exit 1** — `PlantedDupe.tsx:6` and `:9` both reported |

The fixture and the temporary base commit were reset away afterwards; the restore was verified by `diff -q` against a backup taken **after** the fix, by the presence of the fix's own marker on a code line, and by a tree-wide `--no-ignore-files` sweep for `PlantedDupe` (0 hits, with a control token returning 2968 so the sweep is not vacuous).

Unit tests 17 → 24. The three new ambiguity cases were RED first (`+ [] - [10, 12]` on the reviewer's exact call); the four regression cases (distinct anchors still claimed, ambiguity scoped per fingerprint, base source unavailable, head source unavailable) were written at the same time and were already green — they pin behaviour rather than drive it, and are recorded that way honestly.

**How often this bites in practice is narrower than the unit tests suggest**, and worth knowing before reading a CI failure: `git diff -U0` aligns identical unchanged lines *out* of hunks, so the common "delete one duplicate" edit produces a deletion-only hunk and the survivor stays on an untouched line, matched by rule 1. The ambiguous case needs the duplicates themselves inside the rewritten region — re-indentation being the everyday way that happens.

### II. Medium — both `doc-citations` tests: the boundary is an allowlist, so `~` truncates

> `TRAILING` accepts only `[A-Za-z0-9._-]`, so a citation such as `README.md~` is harvested as `README.md`. Because the real `README.md` exists, the guard accepts a malformed/stale citation — the exact false-negative class being remediated. Reproduced for both bare and Markdown-link forms: `// README.md~ is a backup` → `["README.md"]`; `// [r](README.md~)` → `["README.md"]`.

Reproduced exactly, in both forms, before any edit. Round 2 added a boundary and then defined it by listing the characters a suffix *may contain* — which admits only the suffixes someone anticipated and silently truncates every other one. `~` is the conventional editor backup suffix and was not on the list.

**Fix, taken at the level of the grammar rather than the character.** The suffix is now defined by what **ends** a citation, so it is closed by construction — anything not named continues the path:

- `BREAK` — whitespace, the delimiters a comment wraps a citation in (`( ) [ ] { } < > " ' \``), the `:` of a `path:line` reference, and characters a path cannot carry (`, ; | \ ? *`).
- `TAIL_ONLY` — `.` and `!`: legal inside a path, never last, so a citation closing a sentence still stops before the full stop.

Everything else — `~`, `#`, `%`, `+`, `@`, `=`, `&`, `^`, `$`, a second `.ext` — stays attached, so the malformed citation is **reported as unresolvable** instead of resolving to a shorter file the comment never named.

**Measured before committing**, old grammar against new over both packages' real sources: **16 citations under each, zero added, zero removed**. The change bites only on malformed input. (The "13" recorded in round 2 was counted before that round's own commits added comments; the like-for-like comparison is the one above.)

**Residual, stated plainly.** A citation whose *leading* delimiter is not one of `` ^ \s ( [ { < " ' ` `` is still not harvested at all — emacs autosave form `#README.md#` is invisible to the scanner rather than truncated by it. That is a different defect class from the one reported (not-seen, not resolves-to-the-wrong-file), it was not part of this finding, and widening the leading class risks harvesting new false citations, so it was left alone and is recorded here instead of being quietly fixed.

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
- **A position-blind fingerprint as the gate's identity.** The first version of the replacement. See round-1 finding 1 — bypassable by relocation, and the bypass looks exactly like a clean pass.
- **Treating "same rewritten hunk" as proof two findings are the same.** The second version. See round-2 finding A — a `-U0` hunk deletes every base line and adds every head line, so it proves nothing on its own. Documenting it as an accepted trade-off did not make it one.
- **Requiring evidence and then choosing arbitrarily among what it returns.** The third version. See round-3 finding I — a matching source line identifies a *set* of candidate findings, and consuming the first unclaimed one is a guess. Gathering evidence is not the same as being bound by it.
- **Defining a token boundary by listing what may appear inside it.** See round-3 finding II — an allowlist catches the cases you thought of and silently truncates the rest, which is the same false negative in new clothes. Define the boundary by what *ends* the token, so the grammar is closed by construction.
- **Naming a malformed example path in a comment** while explaining the citation guard: the guard scans comments, so the example became a real unresolvable citation and failed the suite. Describe the shape; keep examples in string literals.
- **Harvesting bare absolute paths as citations.** Measured: it flags `GET /skill.md` (a route this server really serves) as a missing file. See finding 2.
- **`node --test scripts/__tests__/`** (directory argument) fails with `MODULE_NOT_FOUND` on Node 22.23. Pass the glob: `node --test scripts/__tests__/*.test.mjs`.
- **Naming the rejected primitives in the README** while explaining why they don't exist: the guard forbids the strings `Divider`/`Spacer` anywhere in that file.

## Key Decisions

| Decision | Rationale |
|---|---|
| Gate identity = file + rule + message + **diff-mapped position, plus the offending source line inside a rewritten hunk, plus a one-to-one pairing on that line** | A position-blind identity cannot tell a shifted finding from a relocated one. Neither can position *inside* a `-U0` hunk, which deletes every base line and adds every head line (second review, finding A). And a source line that appears twice identifies a set, not a finding (third review, finding I). |
| Where identity cannot be proven, **fail closed** — including where the evidence is real but ambiguous | The user's explicit policy for round 3: accept cleanup of preserved debt rather than claim on a coin toss. A false positive costs a fix; a false negative is a silent pass. This is why editing a line that carries a finding reports it, and why duplicate anchors in one rewritten hunk report all of them. |
| Uniqueness judged **pairwise**, not by searching for a best global pairing | More claims would mean more inference, and inference is the thing that fails open. A head finding claims its sole candidate only when it is that candidate's sole suitor. |
| Token boundaries defined by their **terminators**, never by an allowlist of permitted characters | An allowlist is open by construction: it admits the anticipated cases and silently truncates the rest. Stated as "what ends this token", the grammar is closed and an unanticipated suffix gets reported rather than dropped. |
| The diff is a **required** gate input | Without it the comparison is guesswork. No diff → exit 2. A broken gate must never look like a clean pass. |
| Gate matcher extracted to `scripts/lib/biome-diff.mjs` | The decision "is this finding new?" is the part worth testing, and it can be tested without running Biome or git. `pnpm test` now also runs `node --test` over `scripts/`. |
| Citations must resolve **inside** the repository | `existsSync` alone confirms files this checkout does not contain — a citation that resolves for the wrong reason, on one machine only. |
| Bare absolute tokens are not citations | Routes and absolute paths are indistinguishable in prose, and this repo's comments legitimately cite a route. Rejected at resolution instead, and pinned by a test. |
| Skill exposed as an **MCP resource**, not a new tool or a URL | The surface already loads the skill; `registerResource` is in the pinned SDK. A resource URI is an opaque handle, so nothing invents a base URL or new config. A tool would duplicate the MCP App's `get_skill` on a surface that already serves the content. |
| Skill pointer is **surface-local**, not in the shared `TOOLS` descriptor | `TOOLS` is imported by both this server and the stdio MCP App. A pointer baked into the shared array is false on whichever surface it wasn't written for — exactly how the original `get_skill` defect arose. |
| Gate exits **2** (never 0) when it cannot run | A broken gate must never be mistaken for a clean pass. |
| CHANGELOG history preserved, corrections appended | The stale sentences are dated forward-looking promises. |

## Current State

**Working**: everything. Tree clean, 18 commits ahead of `main`; the last **code** commit is `f45d9fe` and every gate below was run on it. All gates re-run on the committed tree after the falsification cycles:

| Gate | Result |
|---|---|
| `TURBO_FORCE=true pnpm typecheck` | exit 0 |
| `TURBO_FORCE=true pnpm test` | exit 0 — **306 passed** (282 vitest + 24 `node --test`); baseline 240 |
| `TURBO_FORCE=true pnpm build` | exit 0 |
| `node scripts/biome-new-findings.mjs main` | exit 0 — head 46, base 48, **0 new** |
| `pnpm lint` | exit 1 — **46 diagnostics** (31 errors / 6 warnings / 9 infos) |
| `git diff --check` | exit 0 |

`pnpm lint` exit 1 is the **pre-existing baseline**, not a regression. The baseline dropped 48 → 46 because formatting the `weave-mcp-server` files this work already had to touch cleared two pre-existing findings (one `format`, one `organizeImports`). Judge lint by `scripts/biome-new-findings.mjs`, never by the raw exit code.

**Broken**: nothing locally. The only unproven item is the un-run GitHub workflow.

**Uncommitted Changes**: none in this worktree. The plan file in the **parent** checkout (`/Users/pierregallet/Documents/weave/.hermes/plans/2026-08-07_223240-primitive-portfolio.md`) carries the Wave 0 execution record plus the remediation record, and is uncommitted there.

## Files to Know

| File | Why It Matters |
|---|---|
| `scripts/lib/biome-diff.mjs` | The gate's identity rules: diff parsing, base→head line mapping, and the two ways a baseline finding can be claimed. Documents its own limits. |
| `scripts/__tests__/biome-diff.test.mjs` | 24 `node --test` cases, including the cross-hunk, same-hunk and duplicate-anchor relocation repros that were RED before their fixes. |
| `scripts/biome-new-findings.mjs` | The gate's I/O: worktrees the base ref, runs Biome twice, computes the diff. Exit 0/1/2. |
| `.github/workflows/ci.yml` | The PR gate. Never executed on GitHub yet. |
| `packages/weave-mcp-server/src/mcp.ts` | Registers the 5 tools **and** the `weave://skill.md` resource; declares the `resources` capability. |
| `packages/weave-mcp-server/src/tools.ts` | `SKILL_RESOURCE_URI` + `SKILL_ENDPOINT_HINT` + `describeForHttpSurface`. Shared `TOOLS` stays transport-neutral. |
| `packages/*/src/__tests__/catalogue-drift.test.ts` | Union/catalogue/version guards, plus surface-neutrality of the shared descriptors. |
| `packages/*/src/__tests__/doc-citations.test.ts` | Citation grammar + containment scanners (2 packages, mirrored). |

## Code Context

The gate's rule 2, from `scripts/lib/biome-diff.mjs` — evidence first, then a uniqueness test, and no `find`-the-first-one anywhere:

```js
// pass 1: record every pairing the anchors permit
for (const entry of unresolved) {
  const anchor = headAnchor(diagnosticFile(entry.d), entry.line);
  if (anchor === null) continue;                 // unreadable line = identity unknown = no claim
  entry.candidates = entry.pool.filter(
    (c) => !c.claimed && c.hunk !== null && withinHeadSide(c.hunk, entry.line) && c.anchor === anchor,
  );
  for (const c of entry.candidates) c.suitors = (c.suitors ?? 0) + 1;
}

// pass 2: claim only where that pairing is one to one
const [only] = entry.candidates;
if (entry.candidates.length === 1 && only.suitors === 1) { only.claimed = true; continue; }
introduced.push(entry.d);
```

The citation suffix grammar, from both `doc-citations.test.ts` files — stated as what ENDS a citation, so it is closed by construction:

```ts
const BREAK = "\\s()\\[\\]{}<>\"'`,;:|\\\\?*";   // whitespace, wrappers, path:line, illegal in a path
const TAIL_ONLY = ".!";                            // legal inside a path, never last
const TRAILING = new RegExp(`(?:[^${BREAK}]*[^${BREAK}${TAIL_ONLY}])?`).source;
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

1. `cd /Users/pierregallet/Documents/weave-wave-0` and confirm the tree is clean, 18 commits ahead of `main` (last code commit `f45d9fe`).
2. Re-verify before trusting anything:
   ```bash
   TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test
   ```
   - Expected: exit 0, **282 vitest tests + 24 `node --test`**.
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
- **The gate can now report a pre-existing finding you did not introduce, by design.** Two cases: you edited the line carrying it, or you rewrote a hunk holding two identical offending lines (re-indenting a block is the everyday way that happens — anchors are trimmed, so the anchors stay identical while git rewrites every line). In both, identity cannot be proven and the policy is to fail closed. The remedy is to fix the reported finding; do not loosen the matcher to make it go away.
- **The gate now needs a real diff, not just a reachable base ref.** In a shallow clone `git rev-parse` can succeed while `git diff` has nothing to compare; the gate exits 2 rather than guessing.
- **`packages/weave-mcp-app/dist/weave-skill.md` is a build copy of SKILL.md** (gitignored, refreshed by `pnpm build`). If you edit SKILL.md, rebuild before testing the MCP App.
- **The `weave-skill` catalogue is cross-checked from `weave-mcp-server`**, not from `weave-skill` itself — that package has no dependency on `weave-primitives` and adding one was deliberately avoided.
