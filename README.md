# Weave

JSON-composable React primitives + MCP server for LLM-driven dashboards.

> **Status:** B3 pre-release. Not yet published to npm. API may change.

Weave is a small React component library plus a companion MCP server. An LLM emits JSON trees of primitives; the library renders them theme-neutrally against the host app's CSS variables. Host apps control the look; the LLM controls the composition.

## Packages

| Package | Purpose |
|---|---|
| [`@shepherd-creative/weave-primitives`](packages/weave-primitives) | React components + Zod schemas |
| [`@shepherd-creative/weave-mcp-server`](packages/weave-mcp-server) | HTTP server exposing render tools |
| [`@shepherd-creative/weave-skill`](packages/weave-skill) | `SKILL.md` teaching an LLM how to compose primitives |
| [`@shepherd-creative/weave-tokens`](packages/weave-tokens) | Default CSS variables (opt-in) + the machine-readable token contract (`tokens.json`) + theme-CSS validator (`./validate`) |
| [`@shepherd-creative/weave-mcp-app`](packages/weave-mcp-app) | MCP App rendering dashboards inline in Claude Desktop, with host-configured brand theming (private, unpublished) |
| [`@shepherd-creative/weave-theme-cli`](packages/weave-theme-cli) | `weave-theme` CLI — authoring-time lint gate for theme directories (coverage, contrast, drop-report schema) |

## Future directions

- [Design-source integration](docs/future-directions/design-source-integration.md): adapting `DESIGN.md`, brand CSS, or design-token repositories into LLM composition guidance and a validated Weave theme. The configured-theme core of this shipped with `weave-mcp-app` (env-configured theme CSS + composition guidance, demo brands under `examples/themes/`); the format-adapter CLI remains unscheduled.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter weave-mcp-server dev   # MCP server on :8787
```

## License

UNLICENSED during B3–B5 private development. MIT expected at B6 (OSS release).
