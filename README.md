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
| [`@shepherd-creative/weave-tokens`](packages/weave-tokens) | Default CSS variables (opt-in) |

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter weave-mcp-server dev   # MCP server on :8787
```

## License

UNLICENSED during B3–B5 private development. MIT expected at B6 (OSS release).
