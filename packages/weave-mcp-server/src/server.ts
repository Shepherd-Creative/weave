import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.WEAVE_MCP_PORT ?? 8787);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  const origin = process.env.WEAVE_MCP_CORS_ORIGIN ?? "http://localhost:3000";
  // eslint-disable-next-line no-console
  console.log(
    `[weave-mcp-server] listening on http://localhost:${info.port} (CORS origin: ${origin})`,
  );
});

export const WEAVE_MCP_SERVER_VERSION = "0.0.0";
