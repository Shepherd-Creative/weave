# Weave

<!-- Sections marked EVOLVING grow over time; everything else is stable project fact. -->

## Project Purpose

JSON-composable React primitives + MCP server for LLM-driven dashboards. An LLM emits a JSON tree of primitives; Weave renders it theme-neutrally against the host app's CSS variables — the host controls appearance, the LLM controls composition. B3 pre-release, not published to npm, API may change through B5.

## Key Commands

```bash
pnpm install
pnpm build                            # turbo run build
pnpm dev                               # turbo run dev --parallel
pnpm typecheck                         # turbo run typecheck
pnpm test                              # turbo run test (vitest per-package) + node --test for scripts/
pnpm lint                              # biome check .
pnpm format                            # biome format --write .
pnpm --filter weave-mcp-server dev     # MCP server on :8787
node packages/weave-theme-cli/dist/cli.js list                        # themes + which is active in Claude Desktop
node packages/weave-theme-cli/dist/cli.js use <name>                  # lint-first switch (restart Claude Desktop after)
node packages/weave-theme-cli/dist/cli.js use --default               # back to the packaged default theme
node packages/weave-theme-cli/dist/cli.js lint <dir> --require-drop-report   # gate an adapter-authored theme
```

Brand adaptation: the `weave-theme-adapter` skill (auto-discovered from `.claude/skills/`) turns a brand DESIGN.md or token CSS into a theme directory; see `packages/weave-adapter-skill/SKILL.md`.

## Verification

```bash
pnpm typecheck && pnpm test
```

Both pass clean as of 2026-07-06 (43 tests). `pnpm lint` (biome check) currently reports ~44 pre-existing formatting/import-order errors, mostly in `weave-primitives` — unrelated to any single change. Don't assume a lint failure was caused by your edit; run `pnpm format` first to see what's pre-existing vs new.

## Architecture

- **Workspace**: `packages/{weave-primitives, weave-mcp-server, weave-skill, weave-tokens}` + `apps/docs` + `examples/copilotkit-next`.
- **Renderer**: LLM emits a JSON spec validated by Zod discriminated-union schemas (`weave-primitives/src/schemas`); a single recursive `<Weave>` component dispatches by `kind`, depth-capped (see `render_dashboard`).
- **MCP surface**: `weave-mcp-server` exposes 5 `render_*` tools over HTTP + MCP JSON-RPC. Schemas convert to JSON Schema via `zod-to-json-schema`.
- **Theming**: `weave-tokens` ships default CSS variables (opt-in); primitives never hardcode colors/fonts.
- **`weave-skill`**: `SKILL.md` teaches an LLM which primitives to compose — deliberately forbids generating CSS or picking colors.
- Full package purposes: see [README.md](README.md).

## Code Style & Conventions

- Biome (not ESLint/Prettier) for lint + format.
- TypeScript strict mode across all packages.
- `react`, `recharts`, `lucide`, `zod` are peerDependencies of `weave-primitives`, not bundled.

## Environment

- Node >=22, pnpm 10.33.0 (pinned via `packageManager` in `package.json`).
- No required env vars for local dev. `weave-mcp-server` HTTP mode reads optional `WEAVE_MCP_PORT` / `WEAVE_MCP_CORS_ORIGIN`.

## Deployment / CI-CD

- **Release**: Changesets-driven (`pnpm ci:version` / `pnpm ci:publish`), see `.github/workflows/release.yml`. Version bumps land as "chore: version packages" PRs from the changeset-release bot.
- **Docker**: `.github/workflows/docker.yml` publishes `weave-mcp-server` to GHCR.
- No PR-triggered build/test CI currently exists — don't assume one will catch a broken build before merge.

## Repo Etiquette

- Commits mix Conventional Commits (`feat(scope): ...`, `fix(scope): ...`, `chore: ...`, `docs(scope): ...`) with an optional phase-tag prefix used during structured build-out (`A4 #7: ...`, `A6: F1 — ...`). Match whichever pattern the current work batch is using.
- `main` is the only active branch; PRs merge in from feature branches on the `Shepherd-Creative/weave` org repo.

## Gotchas

<!-- EVOLVING. Cross-project gotchas belong in ~/.claude/CLAUDE.md instead. -->

When a correction happens or something fails unexpectedly, propose logging it here: "Want me to log that as a gotcha?" If yes, append with today's date and N=0.

<!-- Lifecycle: N=0 after 3+ months → delete. High N + path-specific → promote to .claude/rules/. High N + critical → PreToolUse hook. -->

## Session end (when meaningful work was done)

1. Update `HANDOFF.md` (repo root) if work spans sessions — see global `/handoff:create`.
2. Bump `N=` on any gotcha relevant this session; propose promoting any at N≥3.

---

On session start: check `.claude/context/INDEX.md` for auto-synced project/feedback memory (any agent can read it, including via `AGENTS.md`).
