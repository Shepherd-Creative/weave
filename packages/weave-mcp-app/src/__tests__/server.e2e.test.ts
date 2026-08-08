import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIST = path.resolve(__dirname, "../../dist/index.js");

/**
 * Arguments valid for each fixed-organism tool, where adding `type` is the only
 * thing that makes them illegal — so a rejection below is about that key alone.
 *
 * Declared locally rather than imported: the mcp-server's copy lives in its
 * `src/__tests__/`, which is not part of that package's published exports, and
 * this suite drives the built `dist/` bundle across a package boundary.
 */
const VALID_FIXED_TOOL_ARGS: Record<string, Record<string, unknown>> = {
  render_metric_band: { items: [{ type: "KPI", label: "Revenue", value: 100 }] },
  render_chart_card: {
    title: "T",
    chart: {
      type: "Chart",
      variant: "line",
      categoryKey: "week",
      valueKeys: ["revenue"],
      data: [{ week: "W1", revenue: 1 }],
    },
  },
  render_table_card: {
    title: "T",
    headers: [{ text: "A" }],
    rows: [{ type: "DataRow", cells: [{ kind: "text", value: "x" }] }],
  },
  render_note_card: { body: "ok" },
};

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

  describe("a caller-supplied `type` is refused over stdio too", () => {
    // The blocker: this surface registers each tool with `inputSchema.shape`,
    // and the SDK rebuilds a raw shape as a plain `z.object(...)` — which
    // STRIPS unknown keys rather than refusing them. So `type` was deleted
    // before the handler ran, the tool stamped its own, and an otherwise-valid
    // `{ type: "Stack", body: "ok" }` came back as a NoteCard document.
    // Nothing downstream could catch it: the evidence was gone by then.
    const NOTE_CARD_ARGS = { body: "ok" };

    it("accepts the payload without a type (non-vacuity control)", async () => {
      const result = await client.callTool({
        name: "render_note_card",
        arguments: NOTE_CARD_ARGS,
      });
      expect(result.isError ?? false).toBe(false);
      const { document } = result.structuredContent as { document: { root: { type: string } } };
      expect(document.root.type).toBe("NoteCard");
    });

    it("refuses an otherwise-valid payload carrying a conflicting type", async () => {
      const result = await client.callTool({
        name: "render_note_card",
        arguments: { ...NOTE_CARD_ARGS, type: "Stack" },
      });
      expect(result.isError).toBe(true);
      // No document on any of the three delivery channels — the fault must not
      // reach the view.
      expect(result.structuredContent).toBeUndefined();
      expect(JSON.stringify(result.content)).toContain("type");
    });

    it("refuses a redundant matching type as well", async () => {
      const result = await client.callTool({
        name: "render_note_card",
        arguments: { ...NOTE_CARD_ARGS, type: "NoteCard" },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    });

    it("refuses a conflicting type on every fixed tool", async () => {
      for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
        const control = await client.callTool({ name, arguments: args });
        expect(control.isError ?? false, `${name} fixture is not otherwise valid`).toBe(false);

        const result = await client.callTool({ name, arguments: { ...args, type: "Stack" } });
        expect(result.isError, `${name} accepted a conflicting type`).toBe(true);
        expect(result.structuredContent).toBeUndefined();
      }
    });

    it("refuses a caller-supplied `id` on every fixed tool", async () => {
      // This surface reached the right answer for the wrong reason twice over:
      // it silently STRIPPED `id` until tools were registered by schema rather
      // than by `.shape`, at which point the strict schema began refusing it.
      // So this locks behaviour the previous commit produced rather than
      // driving new behaviour here — the genuine red for `id` is on REST.
      for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
        const result = await client.callTool({ name, arguments: { ...args, id: "caller-chosen" } });
        expect(result.isError, `${name} accepted a caller-supplied id`).toBe(true);
        expect(result.structuredContent).toBeUndefined();
      }
    });

    it("keeps ids working on the canonical document path", async () => {
      const result = await client.callTool({
        name: "render_dashboard",
        arguments: {
          root: {
            type: "Stack",
            id: "root-1",
            children: [{ type: "NoteCard", id: "n1", body: "x" }],
          },
        },
      });
      expect(result.isError ?? false).toBe(false);
      const { document } = result.structuredContent as {
        document: { root: { id?: string; children: Array<{ id?: string }> } };
      };
      expect(document.root.id).toBe("root-1");
      expect(document.root.children[0].id).toBe("n1");
    });
  });

  describe("render_dashboard's gateway takes `root` and nothing else", () => {
    // The gateway was the last place an unknown key was still dropped in
    // silence, and the widest: every other tool's args ARE a node, so the strict
    // node schemas caught undeclared keys downstream. `render_dashboard`'s args
    // are the gateway object, and a plain `z.object({ root })` STRIPS what it
    // does not declare — so the key was deleted before the handler ran and no
    // downstream guard could see it, exactly as `.shape` registration used to do
    // to `type`.
    //
    // Each payload is a valid document root plus ONE small undeclared key, so a
    // rejection is about that key alone. Small deliberately: a large one is
    // refused by the stdin framing budget, which would prove the budget instead.
    const VALID_ROOT = { type: "Stack", children: [{ type: "NoteCard", body: "ok" }] };

    it("accepts the bare gateway object (non-vacuity control)", async () => {
      const result = await client.callTool({
        name: "render_dashboard",
        arguments: { root: VALID_ROOT },
      });
      expect(result.isError ?? false).toBe(false);
      const { document } = result.structuredContent as { document: { root: { type: string } } };
      expect(document.root.type).toBe("Stack");
    });

    it("refuses a valid document carrying one small undeclared key", async () => {
      const result = await client.callTool({
        name: "render_dashboard",
        arguments: { root: VALID_ROOT, junk: 1 },
      });
      expect(result.isError, "the gateway silently discarded an undeclared key").toBe(true);
      // No document on any of the three delivery channels — the fault must not
      // reach the view.
      expect(result.structuredContent).toBeUndefined();
      expect(JSON.stringify(result.content)).toContain("junk");
    });

    it("refuses a caller-written envelope rather than silently downgrading it", async () => {
      // `{ weave: 2, root }` asks for a format this build does not implement and
      // used to come back a v1 document with `weave` deleted.
      const result = await client.callTool({
        name: "render_dashboard",
        arguments: { weave: 2, root: VALID_ROOT },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    });

    it("still carries a document's own ids through untouched", async () => {
      // `id` belongs to the root NODE, not to the gateway.
      const result = await client.callTool({
        name: "render_dashboard",
        arguments: {
          root: {
            type: "Stack",
            id: "g-1",
            children: [{ type: "NoteCard", id: "g-2", body: "x" }],
          },
        },
      });
      expect(result.isError ?? false).toBe(false);
      const { document } = result.structuredContent as {
        document: { root: { id?: string; children: Array<{ id?: string }> } };
      };
      expect(document.root.id).toBe("g-1");
      expect(document.root.children[0].id).toBe("g-2");
    });
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
