import { assertPayloadWithinLimit } from "@shepherd-creative/weave-primitives/schemas";
import { loadSkill } from "@shepherd-creative/weave-skill";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { readBoundedBody, withBufferedBody } from "./ingress.js";
import { handleMcpRequest } from "./mcp.js";
import { invokeTool, TOOLS_BY_NAME, toolsJsonManifest, WeaveDocumentError } from "./tools.js";

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
  //
  // The body is weighed BEFORE the SDK sees it. Everything the SDK does —
  // parsing the envelope, validating arguments, dropping undeclared keys — is
  // work performed on an unbounded input, and it destroys the evidence that the
  // input was unbounded. See ingress.ts.
  app.all("/mcp", async (c) => {
    let buffered: Uint8Array | null;
    try {
      buffered = await readBoundedBody(c.req.raw);
    } catch (err) {
      if (err instanceof WeaveDocumentError) {
        return c.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: err.message },
          },
          413,
        );
      }
      throw err;
    }
    return handleMcpRequest(withBufferedBody(c.req.raw, buffered));
  });

  app.post("/invoke/:name", async (c) => {
    const name = c.req.param("name");
    if (!TOOLS_BY_NAME[name]) {
      return c.json({ error: `Unknown tool: ${name}` }, 404);
    }

    // Read the body as text so its size is known BEFORE it is parsed: an
    // oversized payload is refused without ever being materialised as objects.
    let args: unknown;
    try {
      const raw = await c.req.text();
      assertPayloadWithinLimit(raw);
      args = JSON.parse(raw);
    } catch (err) {
      if (err instanceof WeaveDocumentError) {
        return c.json({ error: err.message }, 413);
      }
      return c.json({ error: "Request body must be valid JSON." }, 400);
    }

    try {
      const document = invokeTool(name, args);
      return c.json({ document });
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
      if (err instanceof WeaveDocumentError) {
        // `payload` is the one policy breach with a status of its own; every
        // other is a malformed request, not an oversized one.
        return c.json({ error: err.message }, err.code === "payload" ? 413 : 400);
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return app;
}
