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
import { z } from "zod";
import { injectTheme } from "./theme.js";

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

export type CreateServerOptions = {
  // Validated, sanitised brand CSS to inject into the view (null → default theme).
  themeCss?: string | null;
  // Host-configured composition guidance appended to get_skill (null → skill only).
  guidance?: string | null;
};

// One sentence appended to each render tool's description when brand guidance is
// configured, nudging the model to read it before composing.
const GUIDANCE_TOOL_HINT =
  " Brand composition guidance is configured for this host; call get_skill before composing.";

// Every render tool returns { document } as structuredContent — the View
// renders from it. Declaring an outputSchema is LOAD-BEARING for Claude
// Desktop: the MCP spec couples structuredContent to outputSchema, and Desktop
// does not forward structuredContent to the app view for tools that advertise
// none (observed 2026-07-07: identical registration without outputSchema
// produced an invisible zero-height widget; the working mermaid-app reference
// differs only by declaring one). The recursive root union can't be expressed
// here, so the schema is deliberately loose — the document was already
// validated by invokeTool against the canonical contract before it is returned.
// Raw shape (not z.object) — registerAppTool's outputSchema takes
// ZodRawShapeCompat, mirroring its inputSchema parameter.
const RENDER_OUTPUT_SHAPE = {
  document: z
    .record(z.unknown())
    .describe("Validated WeaveDocumentV1: { weave: 1, root: <layout or organism> }."),
};

export function createServer(opts?: CreateServerOptions): McpServer {
  const server = new McpServer({ name: "Weave", version: "0.1.0" });
  const themeCss = opts?.themeCss ?? null;
  const guidance = opts?.guidance ?? null;

  for (const tool of TOOLS) {
    // Register the SCHEMA, not its `.shape`.
    //
    // registerAppTool's inputSchema accepts a raw Zod shape (ZodRawShapeCompat)
    // or a schema object, mirroring the base SDK's registerTool — but the two
    // are not equivalent. Handed a raw shape, the SDK rebuilds it with
    // `objectFromShape()`, i.e. a plain `z.object(...)`, and a plain object
    // STRIPS unknown keys instead of refusing them. Passing `.shape` therefore
    // silently discarded the `.strict()` these schemas are built with.
    //
    // That is what made this surface disagree with `/mcp`, which passes the
    // whole object: a caller-supplied `type` was deleted here before the
    // handler ever ran, so `{ type: "Stack", body: "ok" }` reached invokeTool
    // as `{ body: "ok" }` and came back a valid NoteCard. Nothing downstream
    // could have caught it — the key was gone, and with it the evidence that
    // it had ever been sent. A guard cannot run on input that was thrown away
    // upstream of it, which is the same lesson the unknown-key hole taught.
    //
    // F8 is fixed upstream of here. render_dashboard used to advertise
    // SpecSchema — a `z.lazy()` union with no `.shape` — and the SDK's
    // normalizeObjectSchema silently produced an EMPTY schema for it, leaving
    // the one tool that composes everything else undiscoverable. It is now a
    // bounded object gateway (`{ root }`), a real ZodObject like the rest, so
    // every tool can be registered by schema without a special case.
    //
    // The cast covers a typing gap, not a behavioural one. ext-apps 1.7.4
    // declares `inputSchema?: ZodRawShapeCompat | StandardSchemaWithJSON`,
    // which excludes a Zod 3 object (no `~standard.jsonSchema`), while the base
    // SDK method it forwards to — unchanged, `registerAppTool` only normalises
    // `_meta` — declares `ZodRawShapeCompat | AnySchema` and takes the schema
    // branch in `getZodSchemaObject`. The mcp-server's `/mcp` registration
    // passes the same objects through that same method today. What proves this
    // is the stdio e2e, which asks the built bundle over a real wire; the cast
    // itself proves nothing, which is why it is not the only thing here.
    const inputSchema = tool.inputSchema as unknown as z.ZodRawShape;

    // Append the guidance hint to a LOCAL copy of the description; never mutate
    // the shared TOOLS array (it is imported and reused across servers).
    const description = guidance ? tool.description + GUIDANCE_TOOL_HINT : tool.description;

    registerAppTool(
      server,
      tool.name,
      {
        title: tool.name,
        description,
        inputSchema,
        outputSchema: RENDER_OUTPUT_SHAPE,
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          const document = invokeTool(tool.name, args);
          // The document travels on THREE channels because hosts differ in what
          // they forward to the app view (Claude Desktop was observed on
          // 2026-07-07 stripping structuredContent from the tool-result
          // notification). The view tries them in order:
          //   1. structuredContent.document — the spec-compliant channel
          //   2. _meta["weave/document"]    — sidesteps structuredContent stripping
          //   3. the fenced ```json block in content — parsed as last resort
          // The content format is therefore LOAD-BEARING: keep the fenced
          // json block intact if editing this.
          return {
            content: [
              {
                type: "text",
                text: `Weave ${tool.name} document:\n\`\`\`json\n${JSON.stringify(document, null, 2)}\n\`\`\``,
              },
            ],
            structuredContent: { document },
            _meta: { "weave/document": document },
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
    async () => {
      const skill = await readSkillText();
      const text = guidance
        ? `${skill}\n\n---\n\n## Brand composition guidance (host-configured)\n\n${guidance}`
        : skill;
      return { content: [{ type: "text", text }] };
    },
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
            text: injectTheme(html, themeCss),
            _meta: { ui: { prefersBorder: true } },
          },
        ],
      };
    },
  );

  return server;
}
