# Contributing to Weave

Thanks for looking. This is a small pnpm + turbo monorepo. This page covers the layout, the verify gate, the house style and how releases work.

## Layout

Everything is a workspace package under `packages/`, plus `apps/` and `examples/`:

- `packages/weave-primitives`, `weave-tokens`, `weave-skill`, `weave-mcp-server`, `weave-mcp-app`, `weave-adapter-skill`, `weave-theme-cli` (see the [package table in the README](README.md#packages) for what each does).
- `examples/` holds a CopilotKit + Next.js host and the shipped brand themes under `examples/themes/`.

Common commands, all run from the repo root:

```bash
pnpm install
pnpm build        # turbo run build
pnpm dev          # turbo run dev --parallel
pnpm typecheck    # turbo run typecheck
pnpm test         # turbo run test (vitest per package)
pnpm lint         # biome check .
pnpm format       # biome format --write .
```

Node >= 22 and pnpm 10 are required (`packageManager` pins `pnpm@10.33.0`).

## Verify before you claim it works

There is no PR-triggered CI, so the gate is local and it is on you to run it. Before opening a PR that claims something builds, passes or is fixed, run:

```bash
pnpm typecheck && pnpm test
```

Both should pass clean (43 tests at the time of writing). Paste the tail of the real output into the PR. Evidence over assertions: "tests pass" is worth nothing without the output that says so.

## Linting and formatting

Biome does both (not ESLint or Prettier). `pnpm lint` currently reports around 30 pre-existing findings, mostly formatting and import-order noise in `weave-primitives`, unrelated to any one change. So do not assume a lint failure is yours.

Run `pnpm format` first: it fixes the mechanical findings in place, and whatever is left is signal. That is the quickest way to separate pre-existing noise from anything your change actually introduced.

## Commits

The history mixes [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope): ...`, `fix(scope): ...`, `chore: ...`, `docs(scope): ...`) with an optional phase-tag prefix used during structured build-out (for example `A6: F1 ...`). Match whichever pattern the current batch of work is using. Keep the subject line imperative and scoped.

## Themes are conformance fixtures

Every theme under `examples/themes/*` must lint with zero errors. The test suite asserts this with no per-theme allowlist, so a regression in a shipped theme, or an over-tight new check, fails the suite loudly. If you add or change a theme, gate it first:

```bash
node packages/weave-theme-cli/dist/cli.js lint examples/themes/<name> --require-drop-report
```

Warnings are a legitimate authoring judgement and do not fail the gate; errors do. See [`packages/weave-theme-cli/README.md`](packages/weave-theme-cli/README.md) for the full finding vocabulary.

## Releases

Releases are [Changesets](https://github.com/changesets/changesets)-driven. Any change to a published package (everything under `packages/` except the private `weave-mcp-app`) needs a changeset. The simplest way is to add a file under `.changeset/`:

```md
---
"@shepherd-creative/weave-theme-cli": patch
---

One-line summary of the change, in the same voice as the others.
```

Use `patch` for fixes and docs, `minor` for additive features. Version bumps are applied by `pnpm ci:version` and land as a "chore: version packages" PR from the changeset-release bot; publishing is `pnpm ci:publish`. You do not run those; you just leave the changeset.

## Pull requests

`main` is the only active branch. Work on a feature branch, open a PR to `main`, keep it focused. Run the verify gate before you ask for review.
