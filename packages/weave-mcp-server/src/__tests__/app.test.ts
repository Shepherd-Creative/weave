import { LIMITS } from "@shepherd-creative/weave-primitives/schemas";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const app = createApp();

const post = (name: string, args: unknown) =>
  app.request(`/invoke/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });

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
    expect(body.document.root.type).toBe("MetricBand");
    expect(body.document.root.items).toHaveLength(2);
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
        root: {
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
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.root.type).toBe("Stack");
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
    expect(body.document.root.type).toBe("TableCard");
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

  it("render_dashboard parses depth-20 specs fast via discriminatedUnion", async () => {
    // Depth 20 would OOM pre-F1 (14s at depth 14, OOM at depth 20).
    // The depth cap would reject it, so drop the cap indirectly: reach into
    // the raw SpecSchema and parse directly to measure perf.
    const { SpecSchema } = await import("@shepherd-creative/weave-primitives/schemas");
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

  /**
   * Wave 1 exit gate: every transport rejects the same documents, for the same
   * reasons, as the React renderer does. The renderer proves these against
   * React with no transport (packages/weave-primitives/src/__tests__/renderer.test.tsx);
   * this proves REST does not have its own, weaker, opinion.
   */
  describe("canonical document validation over REST", () => {
    it("returns a versioned document, not a bare spec", async () => {
      const res = await post("render_note_card", { body: "hello" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.document).toEqual({
        weave: 1,
        root: { type: "NoteCard", body: "hello" },
      });
    });

    it("rejects an atom as a dashboard root", async () => {
      const res = await post("render_dashboard", { root: { type: "Label", text: "hi" } });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid tool arguments");
    });

    it("rejects a bare DataRow as a dashboard root", async () => {
      const res = await post("render_dashboard", {
        root: { type: "DataRow", cells: [{ kind: "text", value: "x" }] },
      });
      expect(res.status).toBe(400);
    });

    it("rejects a ragged table", async () => {
      const res = await post("render_table_card", {
        title: "T",
        headers: [{ text: "A" }, { text: "B" }],
        rows: [{ type: "DataRow", cells: [{ kind: "text", value: "only one" }] }],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify((await res.json()).issues)).toMatch(/one cell per header/);
    });

    it("rejects duplicate node ids", async () => {
      const res = await post("render_dashboard", {
        root: {
          type: "Stack",
          children: [
            { type: "NoteCard", id: "dup", body: "a" },
            { type: "NoteCard", id: "dup", body: "b" },
          ],
        },
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify((await res.json()).issues)).toMatch(/Duplicate node id/);
    });

    it("rejects an undeclared chart data key", async () => {
      const res = await post("render_chart_card", {
        title: "T",
        chart: {
          type: "Chart",
          variant: "line",
          categoryKey: "week",
          valueKeys: ["revenue"],
          data: [{ week: "W1", revenue: 1, smuggled: "arbitrary" }],
        },
      });
      expect(res.status).toBe(400);
    });

    it("rejects a table with more than 40 rows", async () => {
      const res = await post("render_table_card", {
        title: "T",
        headers: [{ text: "A" }],
        rows: Array.from({ length: 41 }, () => ({
          type: "DataRow",
          cells: [{ kind: "text", value: "x" }],
        })),
      });
      expect(res.status).toBe(400);
    });

    it("rejects an oversized payload with 413 before parsing it", async () => {
      const res = await app.request("/invoke/render_note_card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `{"body":"${"x".repeat(LIMITS.payloadBytes)}"}`,
      });
      expect(res.status).toBe(413);
      expect(String((await res.json()).error)).toMatch(/exceeds the \d+-byte limit/);
    });

    it("still rejects nested depth beyond the cap", async () => {
      let root: unknown = { type: "NoteCard", body: "hello" };
      for (let i = 0; i < 7; i++) root = { type: "Grid", cols: 1, children: [root] };
      const res = await post("render_dashboard", { root });
      expect(res.status).toBe(400);
      expect(String((await res.json()).error)).toMatch(/depth.*exceeds/i);
    });

    it("accepts a dashboard at the depth cap", async () => {
      let root: unknown = { type: "NoteCard", body: "hello" };
      for (let i = 0; i < 6; i++) root = { type: "Grid", cols: 1, children: [root] };
      expect((await post("render_dashboard", { root })).status).toBe(200);
    });
  });

  describe("render_dashboard discoverability (F8)", () => {
    it("advertises an object schema naming its root property", async () => {
      // Before Wave 1 this tool's schema was the lazy Spec union, which the MCP
      // App SDK could not normalise — it advertised {} and the tool was
      // undiscoverable. A bounded object gateway has a `.shape`, so every
      // surface can project it.
      const res = await app.request("/tools");
      const { tools } = await res.json();
      const dashboard = tools.find((t: { name: string }) => t.name === "render_dashboard");
      expect(dashboard.inputSchema.type).toBe("object");
      expect(Object.keys(dashboard.inputSchema.properties)).toEqual(["root"]);
      expect(dashboard.inputSchema.required).toEqual(["root"]);
    });

    it("names every legal root type in the advertised schema", async () => {
      const res = await app.request("/tools");
      const { tools } = await res.json();
      const dashboard = tools.find((t: { name: string }) => t.name === "render_dashboard");
      const projected = JSON.stringify(dashboard.inputSchema);
      for (const type of ["Grid", "Stack", "MetricBand", "ChartCard", "TableCard", "NoteCard"]) {
        expect(projected, `${type} missing from the projection`).toContain(type);
      }
    });

    it("does not advertise a root type the document contract rejects", async () => {
      const res = await app.request("/tools");
      const { tools } = await res.json();
      const dashboard = tools.find((t: { name: string }) => t.name === "render_dashboard");
      const schema = dashboard.inputSchema;

      // zod-to-json-schema de-duplicates: every root except the first is a
      // $ref back to its first occurrence inside Grid.children. Resolving them
      // is what makes this assert the advertised CONTRACT rather than the
      // particular shape the converter happened to emit.
      const resolve = (node: Record<string, unknown>): Record<string, unknown> => {
        const ref = node.$ref as string | undefined;
        if (!ref) return node;
        return ref
          .replace(/^#\//, "")
          .split("/")
          .reduce<Record<string, unknown>>(
            (acc, segment) =>
              (Array.isArray(acc) ? (acc as unknown[])[Number(segment)] : acc[segment]) as Record<
                string,
                unknown
              >,
            schema,
          );
      };

      const advertised = (schema.properties.root.anyOf as Array<Record<string, unknown>>).map(
        (member) => {
          const properties = resolve(member).properties as { type: { const?: string } };
          return properties.type.const;
        },
      );
      expect(advertised.slice().sort()).toEqual(
        ["ChartCard", "Grid", "MetricBand", "NoteCard", "Stack", "TableCard"].sort(),
      );
    });
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

    it("advertises the resources capability", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 20,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      });
      const body = await res.json();
      expect(body.result.capabilities.resources).toBeDefined();
    });

    it("lists the composition skill as a readable MCP resource", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 21,
        method: "resources/list",
        params: {},
      });
      const body = await res.json();
      const uris = body.result.resources.map((r: { uri: string }) => r.uri);
      expect(uris).toContain("weave://skill.md");
    });

    it("serves the same skill over resources/read as over GET /skill.md", async () => {
      // An MCP client has no HTTP route to follow, so the guidance has to be
      // reachable through the protocol it speaks.
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 22,
        method: "resources/read",
        params: { uri: "weave://skill.md" },
      });
      const body = await res.json();
      const text = body.result.contents[0].text;
      const overHttp = await (await app.request("/skill.md")).text();

      // Non-vacuity: two empty strings are also equal.
      expect(text.length).toBeGreaterThan(100);
      expect(text).toBe(overHttp);
    });

    it("points MCP clients at a handle they can act on", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 23,
        method: "tools/list",
        params: {},
      });
      const body = await res.json();
      const dashboard = body.result.tools.find(
        (t: { name: string }) => t.name === "render_dashboard",
      );
      // A bare `GET /skill.md` is not actionable for a client that only speaks
      // JSON-RPC and was never told this server's base URL.
      expect(dashboard.description).toContain("weave://skill.md");
    });

    it("tools/call render_metric_band returns structuredContent + text", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "render_metric_band",
          arguments: {
            items: [{ type: "KPI", label: "Revenue", value: 100, size: "lg" }],
          },
        },
      });
      const body = await res.json();
      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent).toEqual({
        weave: 1,
        root: {
          type: "MetricBand",
          items: [{ type: "KPI", label: "Revenue", value: 100, size: "lg" }],
        },
      });
      const text = body.result.content[0].text;
      expect(JSON.parse(text).root.type).toBe("MetricBand");
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

    /**
     * The exit gate for this surface: the same documents REST rejects, JSON-RPC
     * rejects, because both go through `invokeTool` → `validateWeaveDocument`.
     */
    const rejected: Array<[string, string, Record<string, unknown>]> = [
      ["an atom root", "render_dashboard", { root: { type: "Label", text: "hi" } }],
      ["a bare DataRow root", "render_dashboard", { root: { type: "DataRow", cells: [] } }],
      [
        "a ragged table",
        "render_table_card",
        {
          title: "T",
          headers: [{ text: "A" }, { text: "B" }],
          rows: [{ type: "DataRow", cells: [{ kind: "text", value: "one" }] }],
        },
      ],
      [
        "duplicate node ids",
        "render_dashboard",
        {
          root: {
            type: "Stack",
            children: [
              { type: "NoteCard", id: "dup", body: "a" },
              { type: "NoteCard", id: "dup", body: "b" },
            ],
          },
        },
      ],
      [
        "an undeclared chart key",
        "render_chart_card",
        {
          title: "T",
          chart: {
            type: "Chart",
            variant: "line",
            categoryKey: "week",
            valueKeys: ["revenue"],
            data: [{ week: "W1", revenue: 1, smuggled: "x" }],
          },
        },
      ],
      ["an over-long note body", "render_note_card", { body: "x".repeat(LIMITS.body + 1) }],
    ];

    for (const [label, name, args] of rejected) {
      it(`tools/call rejects ${label}`, async () => {
        const res = await jsonRpc({
          jsonrpc: "2.0",
          id: 30,
          method: "tools/call",
          params: { name, arguments: args },
        });
        const body = await res.json();
        expect(body.result.isError, `${label} was accepted`).toBe(true);
      });
    }

    it("tools/call rejects nesting deep enough to overflow the walk", async () => {
      let root: Record<string, unknown> = { type: "NoteCard", body: "x" };
      for (let i = 0; i < 5_000; i++) root = { nested: root };
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: { name: "render_dashboard", arguments: { root } },
      });
      const body = await res.json();
      expect(body.result.isError).toBe(true);
    });

    it("advertises render_dashboard with a usable object schema", async () => {
      const res = await jsonRpc({ jsonrpc: "2.0", id: 32, method: "tools/list", params: {} });
      const body = await res.json();
      const dashboard = body.result.tools.find(
        (t: { name: string }) => t.name === "render_dashboard",
      );
      expect(dashboard.inputSchema.type).toBe("object");
      expect(dashboard.inputSchema.properties).toHaveProperty("root");
    });
  });
});
