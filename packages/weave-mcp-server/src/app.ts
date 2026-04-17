import { loadSkill } from "@shepherd-creative/weave-skill";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { handleMcpRequest } from "./mcp.js";
import { TOOLS_BY_NAME, invokeTool, toolsJsonManifest } from "./tools.js";

/**
 * Hono app factory. Separated from `server.ts` so tests can call
 * `app.request(...)` without starting a real listener.
 */
export function createApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      // Dev-only: allow the host app's local dev origin.
      origin: process.env.WEAVE_MCP_CORS_ORIGIN ?? "http://localhost:3000",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "authorization"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok", service: "weave-mcp-server" }));

  app.get("/tools", (c) => c.json({ tools: toolsJsonManifest() }));

  app.get("/skill.md", (c) => {
    const content = loadSkill();
    return c.body(content, 200, {
      "content-type": "text/markdown; charset=utf-8",
    });
  });

  // MCP JSON-RPC endpoint (Streamable HTTP transport). Same tools as
  // /invoke/:name, but wire-compatible with CopilotKit BuiltInAgent's
  // mcpServers config and any other MCP client. Accepts GET/POST/DELETE
  // per the Streamable HTTP spec; the transport routes internally.
  app.all("/mcp", async (c) => {
    return handleMcpRequest(c.req.raw);
  });

  app.post("/invoke/:name", async (c) => {
    const name = c.req.param("name");
    if (!TOOLS_BY_NAME[name]) {
      return c.json({ error: `Unknown tool: ${name}` }, 404);
    }

    let args: unknown;
    try {
      args = await c.req.json();
    } catch {
      return c.json({ error: "Request body must be valid JSON." }, 400);
    }

    try {
      const spec = invokeTool(name, args);
      return c.json({ spec });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            error: "Invalid tool arguments",
            issues: err.issues,
          },
          400,
        );
      }
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });

  return app;
}
