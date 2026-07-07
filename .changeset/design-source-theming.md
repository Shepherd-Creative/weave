---
"@shepherd-creative/weave-tokens": minor
"@shepherd-creative/weave-primitives": minor
"@shepherd-creative/weave-mcp-server": patch
---

Design-source theming: contract v2 and var()-routed primitives.

- `weave-tokens`: 50 new `--weave-*` variables covering typography scale and weights, spacing and density, card surfaces and chart treatment, each defaulting to the literal previously hard-coded in the components. Ships a machine-readable `tokens.json` manifest of the full token contract.
- `weave-primitives`: every themeable inline-style literal in the 13 components now reads `var(--weave-*, <previous literal>)`; recharts props resolve variables at render time. Render-identical when no override is present.
- `weave-mcp-server`: new `./tools` subpath export so embedders (the Weave MCP App) can register the render tools on their own server instance.
