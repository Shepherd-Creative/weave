import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIST = path.resolve(__dirname, "../../dist/index.js");

function makeClient(env: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST, "--stdio"],
    env: { ...process.env, ...env } as Record<string, string>,
  });
  const client = new Client({ name: "weave-e2e", version: "0.0.0" });
  return { client, transport };
}

describe("weave-mcp-app stdio server", () => {
  const { client, transport } = makeClient();
  beforeAll(async () => {
    await client.connect(transport);
  }, 20_000);
  afterAll(async () => {
    await client.close();
  });

  it("lists the five render tools linked to the view resource", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of [
      "render_metric_band",
      "render_chart_card",
      "render_table_card",
      "render_note_card",
      "render_dashboard",
    ]) {
      expect(names).toContain(expected);
    }
    const metricBand = tools.find((t) => t.name === "render_metric_band");
    // ext-apps normalises the nested config to a namespaced key on the wire:
    // _meta["ui/resourceUri"] (per the ext-apps d.ts). registerAppTool
    // populates both the nested `_meta.ui.resourceUri` and the legacy flat key.
    const meta = metricBand?._meta as Record<string, unknown> | undefined;
    expect(meta?.["ui/resourceUri"] ?? (meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
      "ui://weave/mcp-app.html",
    );
  });

  it("percent-fraction hint reaches the advertised inputSchema (the model's only guidance without get_skill)", async () => {
    const { tools } = await client.listTools();
    const metricBand = tools.find((t) => t.name === "render_metric_band");
    expect(JSON.stringify(metricBand?.inputSchema)).toContain("fraction of 1");
  });

  it("every render tool advertises an outputSchema (Desktop gates structuredContent on it)", async () => {
    // Claude Desktop only forwards structuredContent to the app view for tools
    // that declare an outputSchema in tools/list. Without this, the View gets
    // no spec and collapses to an invisible zero-height widget (2026-07-07).
    const { tools } = await client.listTools();
    for (const tool of tools.filter((t) => t.name.startsWith("render_"))) {
      expect(tool.outputSchema, `${tool.name} missing outputSchema`).toBeDefined();
      expect((tool.outputSchema as { properties?: object }).properties).toHaveProperty("document");
    }
  });

  it("returns the validated document as structuredContent", async () => {
    // MetricBandSchema.omit({type}) => { items: KPI[]; density? }.
    // Each KPI item requires type:"KPI", label:string, value:number (numeric).
    const result = await client.callTool({
      name: "render_metric_band",
      arguments: {
        items: [{ type: "KPI", label: "Revenue", value: 10000, tone: "positive" }],
      },
    });
    const document = (
      result.structuredContent as { document: { weave: number; root: { type: string } } }
    ).document;
    expect(document.weave).toBe(1);
    expect(document.root.type).toBe("MetricBand");
  });

  it("renders a nested Grid dashboard with no key stripping", async () => {
    const result = await client.callTool({
      name: "render_dashboard",
      arguments: {
        root: {
          type: "Grid",
          cols: 2,
          gap: "md",
          children: [
            {
              type: "MetricBand",
              items: [{ type: "KPI", label: "Revenue", value: 10000, tone: "positive" }],
            },
          ],
        },
      },
    });
    expect(result.isError ?? false).toBe(false);
    const { root } = (result.structuredContent as { document: { root: Record<string, unknown> } })
      .document;
    expect(root.type).toBe("Grid");
    // The organism-specific `items` field must survive validation — proves the
    // dashboard input is parsed by the real root union, not a stripping shape.
    const child = (root.children as Array<Record<string, unknown>>)[0];
    expect(child.type).toBe("MetricBand");
    expect(Array.isArray(child.items)).toBe(true);
    expect((child.items as unknown[]).length).toBe(1);
  });

  it("advertises a usable render_dashboard input schema (F8)", async () => {
    // The defect this replaces: render_dashboard's schema was the lazy Spec
    // union, which has no `.shape`. The SDK's normalizeObjectSchema returned
    // undefined and the tool shipped an EMPTY schema — so the one tool that
    // composes every other primitive told the model nothing about its input.
    const { tools } = await client.listTools();
    const dashboard = tools.find((t) => t.name === "render_dashboard");
    const schema = dashboard?.inputSchema as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties ?? {})).toEqual(["root"]);
    expect(schema.required).toContain("root");
    // Non-vacuity: an object schema with a `root` key would satisfy the lines
    // above even if the union behind it were empty. The legal root types have
    // to actually reach the model.
    for (const type of ["Grid", "Stack", "MetricBand", "ChartCard", "TableCard", "NoteCard"]) {
      expect(JSON.stringify(schema), `${type} missing from the advertised schema`).toContain(type);
    }
  });

  it("rejects an atom root over stdio, exactly as the other surfaces do", async () => {
    const result = await client.callTool({
      name: "render_dashboard",
      arguments: { root: { type: "Label", text: "hi" } },
    });
    expect(result.isError).toBe(true);
  });

  it("rejects a ragged table over stdio", async () => {
    const result = await client.callTool({
      name: "render_table_card",
      arguments: {
        title: "T",
        headers: [{ text: "A" }, { text: "B" }],
        rows: [{ type: "DataRow", cells: [{ kind: "text", value: "one" }] }],
      },
    });
    expect(result.isError).toBe(true);
  });

  it("serves the composition skill via get_skill", async () => {
    const result = await client.callTool({ name: "get_skill", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(500); // real SKILL.md, not an ENOENT fallback
    expect(result.isError ?? false).toBe(false);
    // Stage E: the proactive-visuals section ships in the skill...
    expect(text).toContain("When to visualise unprompted");
    // ...and it must never silently displace the §2 contract forbidding
    // CSS/colours/px. These substrings live only in that contract line, so
    // asserting them guards the contract against being crowded out.
    expect(text).toContain("emit pixel values");
    expect(text).toContain("write HTML or CSS");
  });

  it("advertises the proactive-visuals cue on a render tool description", async () => {
    const { tools } = await client.listTools();
    const tableCard = tools.find((t) => t.name === "render_table_card");
    expect(tableCard?.description).toContain("instead of writing a markdown table");
  });

  it("serves the view HTML with an empty theme placeholder by default", async () => {
    const res = await client.readResource({ uri: "ui://weave/mcp-app.html" });
    const html = (res.contents[0] as { text: string }).text;
    expect(html).toContain('id="weave-brand-theme"');
    expect(html).toContain('<style id="weave-brand-theme"></style>');
  });
});

describe("weave-mcp-app stdio server with host design sources", () => {
  const themePath = path.resolve(__dirname, "fixtures/brand/weave-theme.css");
  const guidancePath = path.resolve(__dirname, "fixtures/brand/DESIGN.md");
  const { client, transport } = makeClient({
    WEAVE_THEME_CSS_PATH: themePath,
    WEAVE_DESIGN_GUIDANCE_PATH: guidancePath,
  });
  beforeAll(async () => {
    await client.connect(transport);
  }, 20_000);
  afterAll(async () => {
    await client.close();
  });

  it("injects the brand theme into the (now non-empty) placeholder", async () => {
    const res = await client.readResource({ uri: "ui://weave/mcp-app.html" });
    const html = (res.contents[0] as { text: string }).text;
    // The empty placeholder must be gone, replaced by a populated <style> block.
    expect(html).not.toContain('<style id="weave-brand-theme"></style>');
    const block = html.slice(
      html.indexOf('<style id="weave-brand-theme">'),
      html.indexOf("</style>", html.indexOf('<style id="weave-brand-theme">')),
    );
    expect(block).toContain("--background: #ffffff");
  });

  it("appends the host guidance to the composition skill", async () => {
    const result = await client.callTool({ name: "get_skill", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("## Brand composition guidance (host-configured)");
    expect(text).toContain("Acme brand composition guidance");
  });

  it("hints on render tool descriptions to read the skill first", async () => {
    const { tools } = await client.listTools();
    const withHint = tools.filter((t) => (t.description ?? "").includes("call get_skill"));
    expect(withHint.length).toBeGreaterThan(0);
  });
});
