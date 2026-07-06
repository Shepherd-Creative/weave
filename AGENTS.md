# Weave — Agent Notes

JSON-composable React primitives + MCP server for LLM-driven dashboards. An LLM emits a JSON tree of primitives; Weave renders it theme-neutrally against the host app's CSS variables — the host controls appearance, the LLM controls composition. B3 pre-release, not published to npm, API may change through B5.

## Commands

```bash
pnpm install
pnpm build            # turbo run build
pnpm dev               # turbo run dev --parallel
pnpm typecheck         # turbo run typecheck
pnpm test              # turbo run test (vitest per-package)
pnpm lint              # biome check .
pnpm format            # biome format --write .
```

## Verification

Run `pnpm typecheck && pnpm test` before considering a change done — both pass clean as of 2026-07-06 (43 tests). `pnpm lint` currently has ~44 pre-existing formatting/import-order errors, mostly in `weave-primitives`, unrelated to any single change — run `pnpm format` to tell pre-existing from newly introduced.

## Architecture

- Workspace: `packages/{weave-primitives, weave-mcp-server, weave-skill, weave-tokens}` + `apps/docs` + `examples/copilotkit-next`.
- LLM output is a JSON spec validated by Zod discriminated-union schemas; a single recursive `<Weave>` React component dispatches rendering by `kind`, depth-capped.
- `weave-mcp-server` exposes 5 `render_*` tools over HTTP + MCP JSON-RPC.
- `weave-tokens` supplies default CSS variables; primitives never hardcode colors/fonts.
- `weave-skill`'s `SKILL.md` teaches an LLM which primitives to compose — forbids it from generating CSS or picking colors.

## Style

- Biome for lint + format (not ESLint/Prettier). TypeScript strict mode throughout.
- `react`, `recharts`, `lucide`, `zod` are peerDependencies of `weave-primitives`, not bundled.

## Environment

- Node >=22, pnpm 10.33.0.
- No required env vars for local dev.

## CI/CD

- Release via Changesets (`.github/workflows/release.yml`). Docker publish to GHCR (`.github/workflows/docker.yml`). No PR-triggered test/build CI currently exists.

## Repo Conventions

- Commits mix Conventional Commits (`feat(scope): ...`) with an optional phase-tag prefix (`A4 #7: ...`) used during structured build-out phases.

## Project / Feedback Memory

`.claude/context/INDEX.md` holds project- and feedback-type notes synced from Claude Code sessions — check it for prior decisions and known pitfalls before starting work.
