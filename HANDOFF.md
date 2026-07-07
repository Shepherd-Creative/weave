# Handoff: Design-source adapter, theme tooling and public release

**Generated**: 2026-05-04 (rewritten 2026-07-07 after the adapter batch)
**Branch**: `feat/design-source-adapter` (main clone, sequential session)
**Status**: All build stages complete, gate green (15 turbo test tasks). PR pending. Two decisions held for Pierre: the repo visibility flip and whether to rewrite history for the previously tracked `.memsearch/` session notes.

## What this branch delivers (13+ commits, each stage two-stage reviewed)

1. **Contract v3** (`weave-tokens` 91 vars, manifest `version: 3`): per-role font routing (`--weave-font-overline`, `--weave-font-numeric`) and `--weave-font-feature-numeric`, routed through Label, KPI, TableCard, Number, Stat and DataRow with defaults behaviour-identical to the replaced literals. brand-iron exercises all three (mono overlines, oldstyle figures) and the acceptance e2e proves them in-browser.
2. **Shared validator**: `validateThemeCss` moved verbatim into `@shepherd-creative/weave-tokens/validate` (single implementation repo-wide; security comments intact). weave-tokens gained its first real build. Turbo cache correctness fixed twice ($TURBO_DEFAULT$ inputs; `examples/themes/**` hashed by both consumer packages).
3. **`weave-theme-cli`** (`weave-theme` bin, 102 tests): `lint` (coverage policy: structural/tone/palette enforced; WCAG contrast tiers with translucent-skip and resolved values in findings; Levenshtein did-you-mean; drop-report zod schema; `--json`), `list` (coverage summary + active marker) and `use` (lint-first Claude Desktop config switching, timestamped collision-safe backups, `--default` restore, exact restart reminder). The lint gate caught a real defect pre-ship: brand-iron's cream-on-saffron `--primary` pair at 2.8:1, fixed to ink at 5.0:1.
4. **`weave-adapter-skill`**: SKILL.md 8-step method encoding the seven brand-iron learnings (tone derivation, chart ramps, font fallback stacks, drops, prose rules, muted variants, the lint gate), plus `.claude/skills/weave-theme-adapter` stub for Claude Code auto-discovery. brand-iron carries the exemplar `drop-report.json` (six judgement calls) and passes `--require-drop-report`.
5. **Proactive visuals**: SKILL.md §1.1 "When to visualise unprompted" (data-shape heuristics, litmus test, counter-heuristics, contract restated), one proactive cue per render-tool description, per-brand "Proactive triggers" in all three example briefs.
6. **Public readiness**: MIT LICENSE and fields everywhere; `.memsearch/` untracked and gitignored; landing README (four-brand screenshot grid in `docs/assets/`, Mermaid pipeline diagram, seven-package table); `docs/quickstart-byob.md` (clone → themed dashboard, 8 steps); `CONTRIBUTING.md`; repo topics set; `pnpm lint` unblocked (`.claude/worktrees` biome excludes); zero personal paths, em dashes or Oxford-comma lists in branch-authored public prose.

## Verification (2026-07-07)

`pnpm typecheck` 13/13 tasks, `pnpm test` 15/15 tasks: theme-cli 102, mcp-app 43 (incl. 4-theme acceptance e2e + proactive assertions), primitives 33, tokens 10, adapter-skill 5, skill 5, mcp-server 19. All three shipped themes lint exit-0; brand-iron also passes `--require-drop-report`. Live smoke of `use`/`list`/round-trip/refusal against a fixture config: all green. gitleaks full-history scan: clean (60 commits).

## Held decisions (Pierre's explicit go required)

1. **Repo visibility flip** (`gh repo edit --visibility public`) after PR merge. History is secrets-clean per gitleaks; personal paths remain in historical docs (`docs/superpowers/plans/*`, this file's history) and in git history generally.
2. **`.memsearch` history**: the session-notes file is untracked going forward but exists in history. Options: accept (content is low-sensitivity dev notes about this repo) or `git filter-repo` before the flip (heavier; invalidates clones).

## Still open from the earlier MCP App handoff

- **Phase 3 — Interactivity**: spec inspector, chart variant switcher, theme toggle, send-back-to-Claude.
- **Phase 4 — Polish**: fullscreen via `app.requestDisplayMode`, `validate_spec` tool, recharts tree-shaking.
- **Runtime theme switching / multi-brand registries / `applyHostFonts`**: explicitly out of scope, documented in `docs/future-directions/design-source-integration.md`.
- **Cloudflared cleanup (open question)**: kill leftover daemons, delete the named tunnel `mcp-app` from Cloudflare Zero Trust, remove `~/.cloudflared/config.yml.named-tunnel-bak` + creds JSON, delete dead CNAME `mcp-app.brandiron.co.za` on HostServ.

## Failed approaches (do not repeat)

Preserved from the MCP App build; all still apply:

- **`tsx`-at-runtime for stdio install**: Claude Desktop's sandbox EPERMs the tsx loader fork on the second call. Always pre-bundle to `dist/index.js` with esbuild and point the config at `node .../dist/index.js`.
- **Naming the server in chat prompts** triggers the connector-marketplace detour; name the tool directly ("call render_metric_band with ...").
- **cloudflared named tunnel with non-Cloudflare DNS** cannot resolve (`cfargotunnel.com` is Cloudflare-private); quick tunnels only.
- **Inventing API fields from memory**: read `/tmp/mcp-ext-apps/src/spec.types.ts` before promising MCP Apps API surface.
- **`session_id`/`SessionEnd` for lifecycle automation**: see the global session-concurrency protocol; warn-only mechanisms.
- New this batch: **`CMD="node x.js"; $CMD` fails under zsh** (no word splitting); use direct invocation or arrays. **Turbo package-level `inputs` overrides replace, not merge** the root array; `$TURBO_DEFAULT$` avoids the drift. **Backup filenames keyed on wall-clock seconds collide** under rapid successive writes; suffix on collision.

## Files to know

| File | Why |
|------|-----|
| `docs/future-directions/design-source-integration.md` | The adapter's requirements seed and current status (skill+lint delivered; remaining future work listed) |
| `packages/weave-adapter-skill/SKILL.md` | The adapter method; `examples/themes/brand-iron/` is its worked example |
| `packages/weave-tokens/src/validate.ts` | The single validator implementation (security comments load-bearing) |
| `packages/weave-theme-cli/src/lint.ts` | The deterministic gate; finding codes are long-lived contract |
| `packages/weave-mcp-app/src/theme.ts` | Runtime loading/injection (env vars → validated `:root` block) |
| `docs/quickstart-byob.md` | The public bring-your-own-brand walkthrough |
| `~/Library/Logs/Claude/mcp-server-<name>.log` | First stop when debugging Claude Desktop MCP issues |

## Resume instructions

1. `cd ~/Documents/weave && git status` — expect `feat/design-source-adapter` (or main after merge).
2. Gate: `pnpm typecheck && pnpm test` (quote output; biome has ~33 pre-existing findings, run `pnpm format` to distinguish).
3. If the PR is open: review comments land there; each fix keeps the gate green.
4. After merge: tear down any stale worktrees from the main clone, then ask Pierre for the visibility-flip go and the memsearch-history decision (§Held decisions).
5. Next build candidates: MCP App phases 3-4, runtime theme switching (needs a concrete host requirement), `applyHostFonts` for real brand faces.
