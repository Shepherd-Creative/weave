# Weave MCP App with Design-Source Theming

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation planning
**Supersedes nothing.** Elevates [`docs/future-directions/design-source-integration.md`](../../future-directions/design-source-integration.md) from proposal to committed scope, combined with the MCP App wrap described in [`HANDOFF.md`](../../../HANDOFF.md).

## Goal

Build the Weave MCP App (inline generative UI in Claude Desktop) so that a host can point it at two configured design sources:

- a `weave-theme.css` written against Weave's CSS-variable contract, injected into the rendered View; and
- a `DESIGN.md` composition-guidance file, appended to the Weave skill text the LLM reads.

The result: LLM-composed dashboards render inline in chat in the host's own visual style, while the LLM itself never generates CSS. Same spec, different brand, materially different look.

## Decisions Made (with the user, 2026-07-06)

| Decision | Choice |
|----------|--------|
| Scope | MCP App phases 0-2 plus theming MVP; old phases 3-4 polish deferred |
| Design sources | Both CSS theme and DESIGN.md guidance |
| Brand fidelity | Full contract expansion (typography scale, spacing/density, borders/shadows, chart treatment) |
| Conversion | Author-against-contract: theme files are written to Weave's documented token contract offline; the server only validates and injects. No CSS parsing/mapping of arbitrary brand repos at runtime |
| Sequencing | App first, then theme pipeline on the current contract, then contract expansion, then deepened demo themes |

## Architecture

Four stages, each independently verifiable in Claude Desktop:

```text
Stage 1  weave-mcp-app (phases 0-2)      inline <Weave> rendering in chat
Stage 2  theme pipeline                  env-configured CSS + DESIGN.md, validated at startup
Stage 3  full contract expansion         tokens.css v2 + de-hardcode the 13 primitives
Stage 4  demo brand themes + acceptance  same spec, three materially different looks
```

New workspace package `packages/weave-mcp-app` (per HANDOFF key decisions). Existing `weave-mcp-server` (HTTP) stays untouched. Two build targets: an esbuild-bundled stdio server (`dist/index.js`, never tsx-at-runtime) and a vite-plugin-singlefile View bundle (`dist/weave-view.html`) that imports `<Weave>` from `weave-primitives` and `weave-tokens/tokens.css` as the base theme. One `ui://` View resource serves all five `render_*` tools.

### Stage 1: MCP App (phases 0-2 from HANDOFF.md)

- Phase 0 gate: validate MCPJam Inspector against the working `mermaid-app-mcp` reference before any new code.
- Scaffold via the `mcp-apps:create-mcp-app` skill, React template. Mirror `mermaid-app-mcp` shape: `registerAppTool` with `_meta.ui.resourceUri`, `registerAppResource` with `_meta` on `contents[]`, View handlers registered before `app.connect()`.
- Reuse the five tool descriptors and Zod schemas that `weave-mcp-server` builds from `weave-primitives/schemas`. The `TOOLS` registry is not currently exported from `weave-mcp-server`'s package surface; the plan must pick a mechanism (subpath export from `weave-mcp-server`, or lift the registry to a shared location) rather than duplicating descriptors. Each tool returns the validated spec as `structuredContent` plus a text fallback.

### Stage 2: Theme pipeline

**Configuration.** Two env vars, read once at server startup, set in the `claude_desktop_config.json` server entry:

```text
WEAVE_THEME_CSS_PATH=/path/to/weave-theme.css
WEAVE_DESIGN_GUIDANCE_PATH=/path/to/DESIGN.md
```

Tool arguments never carry filesystem paths. Both unset means default tokens and base skill; the app must work with zero theme config.

**Theme validation** (`weave-mcp-app/src/theme.ts`). Accepted grammar is a restricted CSS subset: comments plus `:root { --name: value; }` declarations only. Reject `@import`, `url()`, `@font-face`, nested blocks and anything that is not a custom-property declaration. Variable names are checked against the token manifest (below): unknown names are stripped with a logged warning, known names load. Values containing `url(`, `expression(` or `javascript:` are rejected. Deterministic: same input, same output, snapshot-testable.

**Token manifest.** `weave-tokens` gains a machine-readable `tokens.json` listing every contract variable name (and category). Single source of truth consumed by the validator, the docs and any future theme-authoring skill. `tokens.css` remains the human-readable default values.

**Injection.** The built View HTML contains an empty `<style id="weave-brand-theme"></style>` placeholder element after the base tokens (an element, not an HTML comment, because vite-plugin-singlefile minification can strip comments). At startup the server sets its content to the validated theme, so brand variables override defaults by cascade order. No theme configured means the element stays empty.

**Guidance.** A `get_skill` tool (pulled forward from the old Phase 4 backlog) returns the `weave-skill` SKILL.md text with the brand composition guidance appended under a clearly delimited section. When guidance is configured, each `render_*` tool description gains one sentence pointing the model at `get_skill`. Guidance file is capped at 16KB; oversize produces a diagnostic and falls back to the base skill.

### Stage 3: Full contract expansion

- New namespaced variables in `weave-tokens`, added to both `tokens.css` (defaults) and `tokens.json` (manifest):
  - typography: `--weave-font-size-{xs,sm,md,lg,xl,2xl}`, `--weave-font-weight-{normal,medium,semibold,bold}`, `--weave-line-height-{tight,normal,relaxed}`;
  - spacing/density: `--weave-space-{xs,sm,md,lg,xl}`, `--weave-card-padding`, `--weave-gap-{sm,md,lg}`;
  - surfaces: `--weave-card-border-width`, `--weave-card-shadow`, `--weave-radius-{sm,md,lg}`;
  - charts: `--weave-chart-grid`, `--weave-chart-axis`, `--weave-chart-label`, `--weave-chart-tooltip-bg`, `--weave-chart-tooltip-fg`.
  Exact variable list to be finalised during planning by auditing the hard-coded values actually present in the primitives; the categories above are the committed scope.
- Every hard-coded visual literal in the 13 primitives becomes `var(--weave-x, <previous literal>)`. The fallback equals the old hard-coded value, so rendering under the default theme is provably unchanged and hosts without the new tokens do not break. Where a new variable shadows an existing contract token (for example `--weave-radius-md` over `--radius`), use a chained fallback (`var(--weave-radius-md, var(--radius, <literal>))`) so themes authored against the old contract still influence de-hardcoded spots.
- Existing shadcn-convention variable names are kept for backwards compatibility; only new variables get the `--weave-` namespace.

### Stage 4: Demo themes and acceptance

- Two demo brands under `examples/themes/<brand>/`, each with `weave-theme.css` and `DESIGN.md`, deliberately far apart visually (for example a light corporate look and a dense dark analytics look).
- Acceptance mirrors the future-direction note's success criteria: one saved dashboard spec rendered in Claude Desktop under default plus both demo themes produces materially different visuals with zero spec changes, and the agent's composition observably follows the configured guidance.

## Data Flow

Startup: env paths, read and validate, theme injected into View HTML, guidance appended to skill text. Runtime: LLM calls `render_*`, Zod validates the spec, spec travels as `structuredContent`, View receives it via `app.ontoolresult`, `<Weave>` renders under base tokens plus brand overrides. The LLM only ever emits validated Weave JSON.

## Error Handling

Missing, unreadable or invalid design sources never prevent server startup. Each failure logs a clear stderr diagnostic and falls back to defaults (default tokens, base skill). Partially valid theme files load the valid subset with warnings listing what was stripped. All diagnostics name the offending file and rule.

## Testing

- Unit (vitest, in `weave-mcp-app`): validator accept/reject/strip matrix, HTML injection snapshots with and without theme, guidance loader fallback cases.
- Contract expansion (in `weave-primitives`): existing test suite must stay green; add a lint-style test that greps primitive sources for orphaned hard-coded colour and pixel literals outside the sanctioned fallback pattern.
- Phase gates: MCPJam Inspector at each stage boundary; manual Claude Desktop verification per stage (fresh chats, tool-direct prompts, never naming the server, per HANDOFF failed-approaches).
- Acceptance: the Stage 4 three-theme comparison.

## Constraints and Non-Goals

- Runtime stays deterministic: no LLM-generated CSS, no arbitrary-CSS parsing, no network fetches for design sources.
- One configured theme per server process. Runtime theme switching, multi-brand registries and a format-adapter CLI are out of scope (future directions).
- Old MCP App phases 3-4 (spec inspector, chart variant switcher, fullscreen, tree-shaking pass) are deferred, except `get_skill` which Stage 2 pulls forward.
- `weave-mcp-server` HTTP behaviour is unchanged.
- Implementation work happens on a feature branch in an isolated worktree (another session may share the main checkout).

## Risks

- **Claude Desktop sandbox**: mitigated by pre-bundling with esbuild (HANDOFF failed-approaches; EPERM with tsx-at-runtime).
- **Recharts bundle size in the View**: watch during Stage 1; aggressive tree-shaking is deferred polish but the singlefile build must stay loadable.
- **De-hardcoding regressions**: mitigated by fallback-equals-old-literal rule plus the grep test plus per-stage Claude Desktop verification.
