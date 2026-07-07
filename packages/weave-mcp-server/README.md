# @shepherd-creative/weave-mcp-server

HTTP server exposing Weave render tools for LLM agents.

> **Status:** B3 pre-release. Minimal HTTP/JSON interface (not full MCP protocol yet — planned for A6+).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/tools` | List available tools with JSON Schema inputs |
| GET | `/skill.md` | Serve the `@shepherd-creative/weave-skill` content |
| POST | `/invoke/:toolName` | Validate args and return a primitive spec |

## Tools

| Tool | Returns |
|---|---|
| `render_metric_band` | `{ type: "MetricBand", items: KPI[], density? }` |
| `render_chart_card` | `{ type: "ChartCard", title, chart, caption?, footer? }` |
| `render_table_card` | `{ type: "TableCard", title, headers, rows }` |
| `render_note_card` | `{ type: "NoteCard", body, title?, tone?, icon? }` |
| `render_dashboard` | Any full `Spec` tree (typically rooted in `Grid` or `Stack`) |

Input schemas are derived from `@shepherd-creative/weave-primitives/schemas` — single source of truth.

## Run (dev)

```bash
pnpm --filter @shepherd-creative/weave-mcp-server dev
# [weave-mcp-server] listening on http://localhost:8787
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `WEAVE_MCP_PORT` | `8787` | Server port |
| `WEAVE_MCP_CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin (dev only) |

## Example

```bash
curl -X POST http://localhost:8787/invoke/render_metric_band \
  -H 'content-type: application/json' \
  -d '{
    "items": [
      { "type": "KPI", "label": "Revenue", "value": 248500, "format": "currency", "currency": "USD", "size": "xl" }
    ]
  }'
# → { "spec": { "type": "MetricBand", "items": [...] } }
```

Invalid args return `400` with a Zod-issue array:

```json
{ "error": "Invalid tool arguments", "issues": [ ... ] }
```

## License

MIT. See [LICENSE](../../LICENSE) at the repository root.
