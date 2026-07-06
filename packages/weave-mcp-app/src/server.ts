import fs from "node:fs/promises";
import path from "node:path";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { invokeTool, TOOLS } from "@shepherd-creative/weave-mcp-server/tools";
import type { z } from "zod";

// When esbuild bundles src/main.ts to dist/index.js, import.meta.filename ends
// in ".js" and its dirname IS dist/. Running unbundled under tsx (dev) the
// filename ends in ".ts" under src/, so dist is one level up.
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname;

const RESOURCE_URI = "ui://weave/mcp-app.html";

// Do NOT use weave-skill's loadSkill() here: it resolves SKILL.md relative to
// import.meta.url, which points at THIS bundle after esbuild inlines it
// (ENOENT at runtime). The build copies SKILL.md into dist/ instead
// (build:assets) and we read it from DIST_DIR, keeping the bundle
// self-contained.
async function readSkillText(): Promise<string> {
  return fs.readFile(path.join(DIST_DIR, "weave-skill.md"), "utf-8");
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "Weave", version: "0.1.0" });

  for (const tool of TOOLS) {
    // registerAppTool's inputSchema accepts a raw Zod shape (ZodRawShapeCompat)
    // or a StandardSchemaWithJSON, mirroring the base SDK's registerTool. The
    // four organism tools carry an object schema (a `.omit({type})` result),
    // whose `.shape` is a genuine ZodRawShapeCompat — pass it directly.
    //
    // render_dashboard's schema is SpecSchema, a discriminated union (no
    // `.shape`). We pass the whole schema: the SDK's normalizeObjectSchema
    // returns undefined for a non-object schema and falls back to parsing the
    // schema itself, so the real recursive union validates the dashboard with
    // NO key stripping. A raw passthrough shape would instead be wrapped in a
    // plain z.object() that strips organism fields before invokeTool sees them.
    // The cast satisfies the parameter type (SpecSchema isn't statically a raw
    // shape); it is runtime-correct — verified by the nested-Grid e2e case.
    const shape =
      tool.name === "render_dashboard"
        ? (tool.inputSchema as unknown as Record<string, z.ZodTypeAny>)
        : (tool.inputSchema as z.AnyZodObject).shape;

    registerAppTool(
      server,
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: shape,
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          const spec = invokeTool(tool.name, args);
          return {
            content: [
              {
                type: "text",
                text: `Weave ${tool.name} spec:\n\`\`\`json\n${JSON.stringify(spec, null, 2)}\n\`\`\``,
              },
            ],
            structuredContent: { spec },
          };
        } catch (err) {
          return {
            content: [
              { type: "text", text: `Invalid ${tool.name} input: ${(err as Error).message}` },
            ],
            isError: true,
          };
        }
      },
    );
  }

  server.registerTool(
    "get_skill",
    {
      description:
        "Returns the Weave composition skill: how to choose and compose the render_* tools. Call before composing a dashboard.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: await readSkillText() }] }),
  );

  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: { ui: { prefersBorder: true } },
          },
        ],
      };
    },
  );

  return server;
}
