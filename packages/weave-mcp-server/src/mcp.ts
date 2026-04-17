/**
 * MCP JSON-RPC server wrapping the same 5 render tools the REST
 * `/invoke/:name` endpoint exposes.
 *
 * Why both: clients using the official MCP SDK (and platforms like
 * CopilotKit's BuiltInAgent that accept `mcpServers` config) need the
 * JSON-RPC protocol. The legacy `/invoke/:name` REST path stays for
 * backwards compatibility with anything still calling it — we'll drop
 * it in B6 once the MCP path is stable in prod.
 *
 * Transport: `WebStandardStreamableHTTPServerTransport` in stateless
 * mode (no session IDs). Each HTTP request gets its own transport +
 * server instance so concurrent requests don't race. The per-request
 * cost is cheap; tool definitions are reused from the shared `TOOLS`
 * list, so nothing heavy is rebuilt.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnyZodObject } from "zod";
import { TOOLS, invokeTool } from "./tools.js";

/**
 * Construct a fresh McpServer with all 5 render tools registered.
 * Called per-request because the Transport takes ownership of the
 * server — sharing one server across sessions is not supported by
 * the SDK.
 */
function buildServer(): McpServer {
  const mcp = new McpServer(
    { name: "weave-mcp-server", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  for (const tool of TOOLS) {
    mcp.registerTool(
      tool.name,
      {
        description: tool.description,
        // SDK accepts either a Zod shape (`{ k: z.string() }`) or an
        // AnySchema (`z.object({ … })`). Our TOOLS list uses full
        // object schemas, which match the AnySchema branch.
        inputSchema: tool.inputSchema as AnyZodObject,
      },
      async (args: Record<string, unknown>) => {
        try {
          const spec = invokeTool(tool.name, args);
          // MCP tool results are `{ content: Array<{ type, ... }> }`.
          // The spec is structured JSON; return it as stringified text
          // so any MCP client gets a string back. Also ship it as
          // `structuredContent` for clients that read that field
          // (CopilotKit's BuiltInAgent does — saves a parse step).
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(spec) },
            ],
            structuredContent: spec as Record<string, unknown>,
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: err instanceof Error ? err.message : String(err),
              },
            ],
          };
        }
      },
    );
  }

  return mcp;
}

/**
 * Fetch-style handler: take a Request, return a Response. Hono's
 * `c.req.raw` fits this directly.
 */
export async function handleMcpRequest(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: skip the session map, each request stands alone.
    sessionIdGenerator: undefined,
    // Return JSON responses instead of opening a long-lived SSE stream.
    // Our tools are request/response in shape (no streaming partials), so
    // JSON keeps the wire protocol simple and avoids a "close server while
    // stream is still writing" race when we tear down in `finally`.
    enableJsonResponse: true,
  });
  const server = buildServer();
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Response body has already been constructed (JSON mode is
    // non-streaming), so closing here is safe.
    await server.close();
  }
}
