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
});
