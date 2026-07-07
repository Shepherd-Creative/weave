# MCP App + Design-Source Theming — Progress / Handoff

**Branch:** `feat/mcp-app-design-source` (worktree `/Users/pierregallet/Documents/weave-wt/mcp-app-design-source`)
**Plan:** `docs/superpowers/plans/2026-07-07-mcp-app-design-source.md` (on `main`)
**Spec:** `docs/superpowers/specs/2026-07-06-mcp-app-design-source-design.md` (on `main`)
**As of:** 2026-07-07. Tree clean, 21 commits ahead of `main`. `pnpm typecheck` 11/11, `pnpm test` 12/12 (49 tests) green.

## Done

- **Stage 1 (MCP App), Tasks 1-5:** `packages/weave-mcp-app` scaffolded; stdio server registers the five `render_*` tools (from `@shepherd-creative/weave-mcp-server/tools` subpath export) + `get_skill` + the `ui://weave/mcp-app.html` View resource. Verification is autonomous: scripted stdio MCP client (`server.e2e.test.ts`) + Playwright render proof of the built View (`view.e2e.test.ts`, helpers in `view-helpers.ts`). `render_dashboard` registered with the full lazy union schema (SDK falls back to raw-schema validation, no key stripping); its `tools/list` advertisement is an empty JSON schema at SDK 1.29.0 (documented, revisit at SDK PR #1689).
- **Stage 2 (theme pipeline), Tasks 6-8:** `weave-tokens/tokens.json` manifest (sync-tested against `tokens.css`). `theme.ts` `validateThemeCss` (restricted `:root` subset; **rejects CSS ident-escapes** — a Critical url() denylist bypass found+fixed in `9a23554`, see [[css-denylist-ident-escape-bypass]]). `loadDesignSources(env)` reads `WEAVE_THEME_CSS_PATH` (64KB cap) + `WEAVE_DESIGN_GUIDANCE_PATH` (16KB cap), never throws, diagnostics to stderr. `injectTheme` fills the `<style id="weave-brand-theme">` slot. Cascade override proven in-browser (themed `--background: #ffffff` wins over base tokens).
- **Stage 3 (contract expansion), Tasks 9-11:** 50 `--weave-*` v2 vars in `tokens.css`/`tokens.json` (typography/spacing/surface/chart), each default == the pre-existing hard-coded literal. `style.ts` scales routed through them (`a57bfe8`). All 13 primitives swept (`afa46c0` atoms+molecules, `2e1af72` organisms, `baef8ea` chart+`resolveFirstVar`): every themeable inline-style literal is now `var(--weave-NAME, <old literal>)`; Chart.tsx recharts props use `resolveFirstVar([...], fallback)`. Render-neutral by construction (fallback == default == old literal); default Playwright render still green.

## Next: Task 12 (finishes Stage 3), then Stage 4

**Task 12** (was mid-start at handoff):
1. `packages/weave-primitives/src/__tests__/no-orphan-literals.test.ts` — scan the 13 component sources; strip comments, `var(...)`, and `resolve*Var(...)`/`toneToColor(...)` call spans (balanced-paren), then assert no bare `#hex` or `[0-9.]+(px|rem|em)` remain. **Allowlist** the known-structural / documented-orphan values: `240px` (Grid minmax breakpoint), `180px` (MetricBand minmax), `0.0625rem` (NoteCard inline-code hairline pad, intentionally not tokenised). `iconPixelSize`/`chartHeight` live in `style.ts` (util, not scanned). If it flags a genuine un-wrapped literal, wrap it.
2. Extend `view.e2e.test.ts`: brand fixture sets `--weave-card-padding: 2rem` + `--weave-chart-grid: #ff0000`; assert a card's computed `padding` is `32px` (proves v2 vars reach the DOM). Gate chart-geometry reads on `waitForSelector("#root .recharts-surface")`.

**Stage 4 (Tasks 13-16):** two demo brands under `examples/themes/{corporate-light,terminal-dense}/` (weave-theme.css + DESIGN.md; both must pass `validateThemeCss` with 0 stripped); three-theme acceptance test (same spec, default + 2 brands, pairwise-different computed styles, screenshot each); docs (`weave-mcp-app/README.md` with Claude Desktop install + manual verification checklist for Pierre; tokens README v2 table; update root README, HANDOFF.md, future-directions note); changesets (minor: weave-tokens, weave-primitives; patch: weave-mcp-server); push branch + PR to `Shepherd-Creative/weave` (do NOT merge, do NOT tear down worktree).

## Execution notes for the next session

- **Subagents were failing this session:** general-purpose agents DELEGATED instead of editing (spawned nested agents that also punted), then hit a spend limit. Tasks 10-11 were completed by the main session editing directly. If subagents still misbehave/spend-limited, do the mechanical edits inline. If dispatching, add an explicit "do NOT call the Agent tool / do NOT delegate; edit files yourself" guard.
- Documented chart exclusions (not tokenised): `fillOpacity` (0.22, cursor 0.3), icon `strokeWidth={1.75}`, pie cell-separator `strokeWidth={2}`, bar corner `radius` arrays, `chartHeight`/`iconPixelSize` numerics. All are numeric props the orphan regex won't flag anyway.
- Verify commands: `pnpm typecheck && pnpm test`; biome only on changed files (`pnpm biome check --write <files>`) — repo has ~44 pre-existing biome findings in weave-primitives (switch-case, `Number` shadow, array-index keys, barrel import order); don't attribute them to your change.
- Two-stage review (spec then quality) per task via the subagent-driven-development skill when subagents are available again.
