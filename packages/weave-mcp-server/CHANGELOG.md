# @shepherd-creative/weave-mcp-server

## 0.0.0 (unreleased — B3)

- Minimal HTTP/JSON server on port 8787 via Hono + @hono/node-server.
- 5 tools: `render_metric_band`, `render_chart_card`, `render_table_card`, `render_note_card`, `render_dashboard`.
- Input schemas imported from `@shepherd-creative/weave-primitives/schemas` — no parallel schema maintenance.
- `GET /tools` returns Zod-derived JSON Schema manifests (via `zod-to-json-schema`).
- `GET /skill.md` serves the bundled `@shepherd-creative/weave-skill` content.
- CORS restricted to `http://localhost:3000` in dev by default.
- Proper MCP protocol (JSON-RPC over SSE / stdio) deferred to A6+.
- 11 unit tests green.
