import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const app = createApp();

describe("weave-mcp-server", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /tools returns 5 tool descriptors", async () => {
    const res = await app.request("/tools");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tools).toHaveLength(5);
    const names = body.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual([
      "render_metric_band",
      "render_chart_card",
      "render_table_card",
      "render_note_card",
      "render_dashboard",
    ]);
    for (const tool of body.tools) {
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("GET /skill.md returns the skill content", async () => {
    const res = await app.request("/skill.md");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("DASHBOARD COMPOSITION — SKILL");
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
  });

  it("POST /invoke/render_metric_band validates and returns a spec with type", async () => {
    const res = await app.request("/invoke/render_metric_band", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          { type: "KPI", label: "Revenue", value: 100, size: "xl" },
          { type: "KPI", label: "Conv", value: 0.02, format: "percent", size: "lg" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spec.type).toBe("MetricBand");
    expect(body.spec.items).toHaveLength(2);
  });

  it("POST /invoke/render_metric_band returns 400 on invalid args", async () => {
    const res = await app.request("/invoke/render_metric_band", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [] }), // violates min(1)
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid tool arguments");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("POST /invoke/render_dashboard accepts a full recursive Spec", async () => {
    const res = await app.request("/invoke/render_dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "Stack",
        gap: "md",
        children: [
          {
            type: "MetricBand",
            items: [{ type: "KPI", label: "X", value: 1, size: "lg" }],
          },
          {
            type: "NoteCard",
            body: "Context note.",
            tone: "info",
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spec.type).toBe("Stack");
  });

  it("POST /invoke/render_chart_card returns 400 when title is missing", async () => {
    const res = await app.request("/invoke/render_chart_card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chart: { type: "Chart", variant: "line", data: [] },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /invoke/render_table_card accepts typed cells", async () => {
    const res = await app.request("/invoke/render_table_card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Breakdown",
        headers: [
          { text: "Name", align: "start" },
          { text: "Value", align: "end" },
        ],
        rows: [
          {
            type: "DataRow",
            cells: [
              { kind: "text", value: "alpha" },
              { kind: "number", value: 42 },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spec.type).toBe("TableCard");
  });

  it("POST /invoke/render_note_card returns 400 on invalid tone", async () => {
    const res = await app.request("/invoke/render_note_card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hi", tone: "positive" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /invoke/unknown returns 404", async () => {
    const res = await app.request("/invoke/not_a_tool", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("rejects non-JSON body with 400", async () => {
    const res = await app.request("/invoke/render_note_card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  it("render_dashboard rejects nested depth > 6 (F1 depth cap)", async () => {
    // Build a Grid tree 7 containers deep wrapping a terminal NoteCard.
    let node: unknown = {
      type: "NoteCard",
      body: "hello",
    };
    for (let i = 0; i < 7; i++) {
      node = { type: "Grid", cols: 1, children: [node] };
    }
    const res = await app.request("/invoke/render_dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(node),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/depth.*exceeds/i);
  });

  it("render_dashboard still accepts depth 6 (at the cap)", async () => {
    let node: unknown = {
      type: "NoteCard",
      body: "hello",
    };
    for (let i = 0; i < 6; i++) {
      node = { type: "Grid", cols: 1, children: [node] };
    }
    const res = await app.request("/invoke/render_dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(node),
    });
    expect(res.status).toBe(200);
  });

  it("render_dashboard parses depth-20 specs fast via discriminatedUnion", async () => {
    // Depth 20 would OOM pre-F1 (14s at depth 14, OOM at depth 20).
    // The depth cap would reject it, so drop the cap indirectly: reach into
    // the raw SpecSchema and parse directly to measure perf.
    const { SpecSchema } = await import(
      "@shepherd-creative/weave-primitives/schemas"
    );
    let node: unknown = {
      type: "NoteCard",
      body: "hello",
    };
    for (let i = 0; i < 20; i++) {
      node = { type: "Grid", cols: 1, children: [node] };
    }
    const start = performance.now();
    const parsed = SpecSchema.parse(node);
    const elapsed = performance.now() - start;
    expect(parsed).toBeDefined();
    expect(elapsed).toBeLessThan(200);
  });

  describe("MCP endpoint (/mcp)", () => {
    const jsonRpc = (body: Record<string, unknown>) =>
      app.request("/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
      });

    it("handles MCP initialize handshake", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jsonrpc).toBe("2.0");
      expect(body.result.serverInfo.name).toBe("weave-mcp-server");
      expect(body.result.capabilities.tools).toBeDefined();
    });

    it("lists the same 5 tools as /tools", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });
      const body = await res.json();
      const names = body.result.tools.map((t: { name: string }) => t.name);
      expect(names).toEqual([
        "render_metric_band",
        "render_chart_card",
        "render_table_card",
        "render_note_card",
        "render_dashboard",
      ]);
    });

    it("tools/call render_metric_band returns structuredContent + text", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "render_metric_band",
          arguments: {
            items: [
              { type: "KPI", label: "Revenue", value: 100, size: "lg" },
            ],
          },
        },
      });
      const body = await res.json();
      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent).toEqual({
        type: "MetricBand",
        items: [{ type: "KPI", label: "Revenue", value: 100, size: "lg" }],
      });
      const text = body.result.content[0].text;
      expect(JSON.parse(text).type).toBe("MetricBand");
    });

    it("tools/call with invalid args returns isError", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "render_metric_band",
          arguments: { items: "not-an-array" },
        },
      });
      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toMatch(/Invalid/);
    });
  });
});
