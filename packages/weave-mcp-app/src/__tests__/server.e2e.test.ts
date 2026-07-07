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

  it("returns the validated spec as structuredContent", async () => {
    // MetricBandSchema.omit({type}) => { items: KPI[]; density? }.
    // Each KPI item requires type:"KPI", label:string, value:number (numeric).
    const result = await client.callTool({
      name: "render_metric_band",
      arguments: {
        items: [{ type: "KPI", label: "Revenue", value: 10000, tone: "positive" }],
      },
    });
    const spec = (result.structuredContent as { spec: { type: string } }).spec;
    expect(spec.type).toBe("MetricBand");
  });

  it("renders a nested Grid dashboard through the full SpecSchema (no key stripping)", async () => {
    const dashboard = {
      type: "Grid",
      cols: 2,
      gap: "md",
      children: [
        {
          type: "MetricBand",
          items: [{ type: "KPI", label: "Revenue", value: 10000, tone: "positive" }],
        },
      ],
    };
    const result = await client.callTool({
      name: "render_dashboard",
      arguments: dashboard,
    });
    expect(result.isError ?? false).toBe(false);
    const spec = (result.structuredContent as { spec: Record<string, unknown> }).spec;
    expect(spec.type).toBe("Grid");
    // The organism-specific `items` field must survive validation — proves the
    // dashboard input is parsed by the real SpecSchema, not a stripping shape.
    const child = (spec.children as Array<Record<string, unknown>>)[0];
    expect(child.type).toBe("MetricBand");
    expect(Array.isArray(child.items)).toBe(true);
    expect((child.items as unknown[]).length).toBe(1);
  });

  it("serves the composition skill via get_skill", async () => {
    const result = await client.callTool({ name: "get_skill", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(500); // real SKILL.md, not an ENOENT fallback
    expect(result.isError ?? false).toBe(false);
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
