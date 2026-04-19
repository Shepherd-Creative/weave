---
"@shepherd-creative/weave-primitives": patch
"@shepherd-creative/weave-mcp-server": patch
---

F1 hardening: switch `SpecSchema` from `z.union([...13])` to `z.discriminatedUnion("type", [...13])` and add a depth cap on `render_dashboard`.

- **Primitives** — `SpecSchema` now branches on the `type` literal, collapsing parse cost from O(13^N) to O(N) on nested Grid/Stack trees. Depth-20 inputs that previously OOM'd the Node process parse in <1 ms.
- **MCP server** — `invokeTool` rejects `render_dashboard` payloads with nested Grid/Stack depth > 6 via a new `DepthLimitError` (HTTP 400 on the REST path; MCP `isError: true` on the JSON-RPC path). Belt-and-braces against future Zod regressions and misbehaving clients.
