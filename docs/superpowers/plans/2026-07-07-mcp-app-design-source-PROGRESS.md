# MCP App + Design-Source Theming — Progress / Handoff

**Branch:** `feat/mcp-app-design-source` (worktree `/Users/pierregallet/Documents/weave-wt/mcp-app-design-source`)
**Plan:** `docs/superpowers/plans/2026-07-07-mcp-app-design-source.md` (on `main`)
**Spec:** `docs/superpowers/specs/2026-07-06-mcp-app-design-source-design.md` (on `main`)
**As of:** 2026-07-07 (session 2). **ALL 16 TASKS COMPLETE.** PR open: <https://github.com/Shepherd-Creative/weave/pull/3>. Tree clean, branch pushed. `pnpm build` 7/7, `pnpm typecheck` 11/11, `pnpm test` 12/12 (99 tests) green.

## Done

- **Stage 1 (MCP App), Tasks 1-5:** `packages/weave-mcp-app` scaffolded; stdio server registers the five `render_*` tools (from `@shepherd-creative/weave-mcp-server/tools` subpath export) + `get_skill` + the `ui://weave/mcp-app.html` View resource. Verification is autonomous: scripted stdio MCP client (`server.e2e.test.ts`) + Playwright render proof of the built View (`view.e2e.test.ts`). `render_dashboard`'s `tools/list` advertisement is an empty JSON schema at SDK 1.29.0 (documented, revisit at SDK PR #1689).
- **Stage 2 (theme pipeline), Tasks 6-8:** `weave-tokens/tokens.json` manifest; `validateThemeCss` (restricted `:root` subset, rejects CSS ident-escapes, see [[css-denylist-ident-escape-bypass]]); `loadDesignSources(env)` with size caps and never-throw diagnostics; `injectTheme` into the `<style id="weave-brand-theme">` slot.
- **Stage 3 (contract expansion), Tasks 9-12:** 50 `--weave-*` v2 vars; `style.ts` + all 13 primitives routed through `var(--weave-NAME, <old literal>)`; `no-orphan-literals.test.ts` scan (comments/var()/resolve-call spans stripped balanced-paren, allowlist: Grid `240px`, MetricBand `180px`, NoteCard `0.0625rem`; mutation-checked); brand fixture proves `--weave-card-padding: 2rem` → computed `32px` and `--weave-chart-grid: #ff0000` → grid stroke in the DOM.
- **Stage 4 (Tasks 13-16):**
  - Demo brands `examples/themes/{corporate-light,terminal-dense}/` (weave-theme.css + DESIGN.md), both validate with 0 stripped vars (`design-sources.test.ts` iterates the dir).
  - `acceptance.e2e.test.ts`: same spec × {default, corporate-light, terminal-dense} → pairwise-different computed looks + screenshots in `dist/acceptance/` (screenshots wait 1.8s for the recharts line-draw animation, else the plot area is empty).
  - Docs: `weave-mcp-app/README.md` (Desktop install + env vars + theme-authoring rules + diagnostics + **manual verification checklist for Pierre**), tokens README contract v2 table (`--weave-radius-sm`/`-lg` are defined-but-unconsumed, marked reserved), root README package row, HANDOFF.md phases 0-2 done, future-directions note status flipped to largely-implemented.
  - Changeset `design-source-theming.md`: minor tokens + primitives, patch mcp-server. Lint: only pre-existing finding classes (verified same on `main`); the branch adds zero new errors.

## Next (for whoever picks this up)

1. **Pierre: manual Claude Desktop verification** — checklist in `packages/weave-mcp-app/README.md`. Everything else is machine-verified.
2. **PR review + merge** of <https://github.com/Shepherd-Creative/weave/pull/3> (human gate; do not auto-merge).
3. After merge: tear down the worktree **from the main clone** (`git -C ~/Documents/weave worktree remove ...` then branch delete), never from inside it.
4. Future (unscheduled): format-adapter CLI (DESIGN.md/token-repo → weave-theme.css), runtime theme switching, MCP App phases 3-4 (spec inspector, fullscreen, recharts tree-shaking).

## Notes that survive this session

- Subagents misbehaved in session 1 (delegated instead of editing, spend limit); session 2 did everything inline in the main session — fine at this scale.
- `pnpm format` reformats 10 files of pre-existing drift on `main` (schemas, mcp-server, `.claude/settings.json`) — do NOT commit those into a feature PR; revert and keep the diff focused.
- Verify commands: `pnpm typecheck && pnpm test`; biome only on changed files.
