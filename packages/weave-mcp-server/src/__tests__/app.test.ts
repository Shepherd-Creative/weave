import { LIMITS } from "@shepherd-creative/weave-primitives/schemas";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { VALID_FIXED_TOOL_ARGS } from "./fixtures.js";

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

  describe("a fixed tool's root cannot be overridden by the request body", () => {
    /**
     * `render_note_card` advertises a NoteCard. It used to build its root as
     * `{ type: tool.specType, ...record }`, so a caller-supplied `type` won the
     * spread and the tool rendered whatever root it was handed — over REST,
     * which never parses `inputSchema` at all.
     *
     * Stamping `type` LAST stopped the retyping but replaced it with a quieter
     * fault: the conflicting key was silently overwritten, so an otherwise-valid
     * `{ type: "Stack", body: "ok" }` came back **200** as a NoteCard while the
     * identical call to `/mcp` was refused. Every payload below is valid but for
     * the `type` key, so each rejection is about that key and nothing else.
     */
    it("refuses an otherwise-valid payload carrying a conflicting type", async () => {
      const res = await post("render_note_card", { type: "Stack", body: "ok" });
      expect(res.status).toBe(400);
      const body = await res.json();
      // No document at all — the defect was never a status code, it was a
      // document the caller was not entitled to.
      expect(body.document).toBeUndefined();
      expect(
        (body.issues as Array<{ code: string; keys?: string[] }>).some(
          (issue) => issue.code === "unrecognized_keys" && issue.keys?.includes("type"),
        ),
      ).toBe(true);
    });

    it("accepts the same payload with the type removed (non-vacuity control)", async () => {
      // Without this, the 400 above could be a rejection of `body`.
      const res = await post("render_note_card", { body: "ok" });
      expect(res.status).toBe(200);
      expect((await res.json()).document.root.type).toBe("NoteCard");
    });

    it("refuses a conflicting type on every other fixed tool, and only for that key", async () => {
      for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
        const control = await post(name, args);
        expect(control.status, `${name} fixture is not otherwise valid`).toBe(200);

        const res = await post(name, { ...args, type: "Stack" });
        expect(res.status, `${name} accepted a conflicting type`).toBe(400);
        expect((await res.json()).document).toBeUndefined();
      }
    });

    it("refuses a caller-supplied `id`, and only for that key", async () => {
      // REST used to stamp a caller's `id` straight onto the root while `/mcp`
      // refused the same request. `id` is omitted from the advertised schema
      // alongside `type`, so it gets the same answer as `type` everywhere.
      for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
        const control = await post(name, args);
        expect(control.status, `${name} fixture is not otherwise valid`).toBe(200);

        const res = await post(name, { ...args, id: "caller-chosen" });
        expect(res.status, `${name} accepted a caller-supplied id`).toBe(400);
        const body = await res.json();
        expect(body.document).toBeUndefined();
        expect(
          (body.issues as Array<{ code: string; keys?: string[] }>).some(
            (issue) => issue.code === "unrecognized_keys" && issue.keys?.includes("id"),
          ),
        ).toBe(true);
      }
    });

    it("keeps ids working on the canonical document path", async () => {
      // Refusing `id` on the fixed tools is a scoping decision, not a removal:
      // `render_dashboard` takes whole documents and preserves their ids.
      const res = await post("render_dashboard", {
        root: {
          type: "Stack",
          id: "root-1",
          children: [{ type: "NoteCard", id: "n1", body: "x" }],
        },
      });
      expect(res.status).toBe(200);
      const { root } = (await res.json()).document;
      expect(root.id).toBe("root-1");
      expect(root.children[0].id).toBe("n1");
    });

    it("refuses a redundant matching type as well — `type` is not an advertised argument", async () => {
      // The tool's advertised schema is `…Schema.omit({ type, id })`, so `type`
      // is unrecognised on `/mcp` whether it agrees with the discriminator or
      // not. REST accepting the agreeing case would leave the two surfaces
      // answering the same request differently, which is the defect this
      // remediation exists to close.
      const res = await post("render_note_card", { type: "NoteCard", body: "ok" });
      expect(res.status).toBe(400);
      expect((await res.json()).document).toBeUndefined();
    });
  });

  describe("unknown keys over REST", () => {
    it("rejects an undeclared key on a node", async () => {
      const res = await post("render_note_card", { body: "ok", onLoad: "alert(1)" });
      expect(res.status).toBe(400);
    });

    it("rejects an undeclared array field on a nested node", async () => {
      const res = await post("render_dashboard", {
        root: { type: "Stack", children: [{ type: "NoteCard", body: "ok", junk: [1, 2, 3] }] },
      });
      expect(res.status).toBe(400);
    });

    it("refuses a large discarded argument at ingress, before building a candidate", async () => {
      // The gateway now refuses `junk` on its own, but this asserts something
      // the key check cannot: that the refusal happens at INGRESS, on the raw
      // bytes, before anything materialises them. The status is the whole point
      // — 413, not the 400 the key check returns — so a budget quietly moved
      // downstream of the parse would go red here rather than pass as a 400.
      const res = await app.request("/invoke/render_dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root: { type: "NoteCard", body: "ok" },
          junk: "x".repeat(LIMITS.payloadBytes),
        }),
      });
      expect(res.status).toBe(413);
    });
  });

  /**
   * The gateway was the last place an unknown key was still dropped in silence,
   * and the widest: every other tool's args ARE a node, so the strict node
   * schemas caught undeclared keys downstream. `render_dashboard`'s args are the
   * gateway object, and REST never runs the advertised schema at all — it read
   * `record.root` and ignored everything else.
   *
   * Each payload is a valid document root plus ONE small undeclared key.
   * Small deliberately: a large one is refused by the ingress budget above, so a
   * test using one would prove the budget rather than this.
   */
  describe("render_dashboard's gateway takes `root` and nothing else (REST)", () => {
    const VALID_ROOT = { type: "Stack", children: [{ type: "NoteCard", body: "ok" }] };

    it("accepts the bare gateway object (non-vacuity control)", async () => {
      const res = await post("render_dashboard", { root: VALID_ROOT });
      expect(res.status).toBe(200);
      expect((await res.json()).document.root.type).toBe("Stack");
    });

    it("refuses a valid document carrying one small undeclared key", async () => {
      const res = await post("render_dashboard", { root: VALID_ROOT, junk: 1 });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.document).toBeUndefined();
      expect(
        (body.issues as Array<{ code: string; keys?: string[] }>).some(
          (issue) => issue.code === "unrecognized_keys" && issue.keys?.includes("junk"),
        ),
      ).toBe(true);
    });

    it("refuses a caller-written envelope rather than silently downgrading it", async () => {
      // `{ weave: 2, root }` asks for a format this build does not implement.
      // It used to have `weave` deleted and come back a v1 document — the one
      // answer a version negotiation must never give.
      const res = await post("render_dashboard", { weave: 2, root: VALID_ROOT });
      expect(res.status).toBe(400);
      expect((await res.json()).document).toBeUndefined();
    });

    it("still carries a document's own ids through untouched", async () => {
      // `id` belongs to the root NODE, not to the gateway. This is the line
      // between "the gateway is closed" and "documents lost their ids".
      const res = await post("render_dashboard", {
        root: {
          type: "Stack",
          id: "root-1",
          children: [{ type: "NoteCard", id: "n1", body: "x" }],
        },
      });
      expect(res.status).toBe(200);
      const { root } = (await res.json()).document;
      expect(root.id).toBe("root-1");
      expect(root.children[0].id).toBe("n1");
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
    /**
     * Post an already-serialised JSON-RPC body.
     *
     * Exists because `JSON.stringify` recurses: a payload deep enough to
     * exercise the server's nesting defences cannot be built as a JS graph and
     * serialised here without the TEST process running out of stack first —
     * which is a property of the runner's architecture, not of the server.
     */
    const jsonRpcRaw = (body: string) =>
      app.request("/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body,
      });

    const jsonRpc = (body: Record<string, unknown>) => jsonRpcRaw(JSON.stringify(body));

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

    it("answers a conflicting `type` the same way REST does (surface parity)", async () => {
      // The blocker this locks: `/mcp` refused this exact payload because the
      // SDK runs the advertised `…omit({ type, id })` schema strictly, while
      // REST — which never parses that schema — returned 200 and a document.
      // One request, one answer, whichever door it came through.
      const args = { ...VALID_FIXED_TOOL_ARGS.render_note_card, type: "Stack" };

      const overMcp = await (
        await jsonRpc({
          jsonrpc: "2.0",
          id: 30,
          method: "tools/call",
          params: { name: "render_note_card", arguments: args },
        })
      ).json();
      const overRest = await post("render_note_card", args);

      expect(overMcp.result.isError).toBe(true);
      expect(JSON.stringify(overMcp.result.content)).toContain("unrecognized_keys");
      expect(overMcp.result.structuredContent).toBeUndefined();
      expect(overRest.status).toBe(400);
      expect((await overRest.json()).document).toBeUndefined();
    });

    it("answers a caller-supplied `id` the same way REST does (surface parity)", async () => {
      // `/mcp` already refused this — it runs the advertised schema. REST
      // stamped the id onto the root and returned 200. The point of the test is
      // the pair: one request, one answer, whichever door it came through.
      const args = { ...VALID_FIXED_TOOL_ARGS.render_note_card, id: "caller-chosen" };

      const overMcp = await (
        await jsonRpc({
          jsonrpc: "2.0",
          id: 31,
          method: "tools/call",
          params: { name: "render_note_card", arguments: args },
        })
      ).json();
      const overRest = await post("render_note_card", args);

      expect(overMcp.result.isError).toBe(true);
      expect(JSON.stringify(overMcp.result.content)).toContain("unrecognized_keys");
      expect(overMcp.result.structuredContent).toBeUndefined();
      expect(overRest.status).toBe(400);
      expect((await overRest.json()).document).toBeUndefined();
    });

    it("answers an undeclared gateway key the same way REST does (surface parity)", async () => {
      // Both surfaces accepted this. `/mcp` accepted it for its own reason: the
      // SDK runs the advertised gateway schema, and a non-strict `z.object()`
      // STRIPS what it does not declare — so `junk` was deleted before
      // `invokeTool` ran and no shared guard could ever have seen it.
      const args = { root: { type: "NoteCard", body: "ok" }, junk: 1 };

      const overMcp = await (
        await jsonRpc({
          jsonrpc: "2.0",
          id: 37,
          method: "tools/call",
          params: { name: "render_dashboard", arguments: args },
        })
      ).json();
      const overRest = await post("render_dashboard", args);

      expect(overMcp.result.isError).toBe(true);
      expect(JSON.stringify(overMcp.result.content)).toContain("unrecognized_keys");
      expect(overMcp.result.structuredContent).toBeUndefined();
      expect(overRest.status).toBe(400);
      expect((await overRest.json()).document).toBeUndefined();
    });

    it("accepts the bare gateway object over /mcp (non-vacuity control)", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 38,
        method: "tools/call",
        params: {
          name: "render_dashboard",
          arguments: { root: { type: "NoteCard", body: "ok" } },
        },
      });
      const body = await res.json();
      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent.root.type).toBe("NoteCard");
    });

    it("refuses a caller-written envelope over /mcp too", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 39,
        method: "tools/call",
        params: {
          name: "render_dashboard",
          arguments: { weave: 2, root: { type: "NoteCard", body: "ok" } },
        },
      });
      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent).toBeUndefined();
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

    /**
     * A chain of `depth` legally-shaped Stacks, as TEXT.
     *
     * Text because `JSON.stringify` recurses: a chain deep enough to exercise
     * the SDK's own parse cannot be built as a JS graph and serialised here
     * without the TEST process running out of stack first, which is a property
     * of the runner's architecture rather than of the server.
     *
     * Legally-shaped because the root is a discriminated union: an array chain
     * or a `{nested:…}` chain is refused at depth 1 on the discriminator alone
     * and says nothing about depth.
     */
    const stackChain = (depth: number) =>
      `${'{"type":"Stack","children":['.repeat(depth)}{"type":"NoteCard","body":"x"}${"]}".repeat(depth)}`;

    it("tools/call rejects container nesting past the depth cap", async () => {
      // The load-bearing depth test on this surface. It sits just past the cap
      // (7 containers against a limit of 6) for one reason: the payload has to
      // survive everything standing in front of the structural walk so that the
      // WALK is what refuses it.
      //
      // The 2,000-level case below cannot do this job, measured: the MCP SDK
      // validates `arguments` against the advertised `DashboardGatewaySchema`
      // BEFORE the handler runs, that parse recurses per level, and at 2,000 it
      // raises a `RangeError` the SDK catches and reports as `isError: true` —
      // the same answer a real rejection gives. With the whole structural walk
      // disabled, the 2,000-level case still passed and only the REST depth
      // test went red; this one goes red with it.
      const res = await jsonRpcRaw(
        `{"jsonrpc":"2.0","id":33,"method":"tools/call","params":{"name":"render_dashboard","arguments":{"root":${stackChain(LIMITS.depth + 1)}}}}`,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.isError).toBe(true);
      // The reason, not merely a refusal: `isError` is also what a shape failure
      // and a caught stack overflow produce, so asserting it alone is satisfied
      // by mechanisms that have nothing to do with the cap under test.
      expect(String(body.result.content[0].text)).toMatch(/depth exceeds/i);
    });

    it("tools/call survives a payload too deep for the SDK's own parse", async () => {
      // Resilience, NOT proof of a Weave cap — see the test above for that.
      // Measured on this tree: at 2,000 levels the refusal comes from a
      // `RangeError` inside the SDK's pre-handler Zod parse, caught and
      // reported as a tool error. The structural walk never runs. What is worth
      // pinning is that the failure stays inside the request: a controlled
      // answer, and a server that still serves the next caller.
      const depth = 2_000;
      const body = `{"jsonrpc":"2.0","id":31,"method":"tools/call","params":{"name":"render_dashboard","arguments":{"root":${stackChain(depth)}}}}`;

      // Non-vacuity: the refusal must come from depth, not from the ingress byte
      // budget standing in front of it. 2,000 levels is ~60 KB of a 262,144-byte
      // allowance, so a 413 here would mean the fixture had drifted.
      expect(body.length).toBeLessThan(LIMITS.payloadBytes);

      const res = await jsonRpcRaw(body);

      // Deliberately does not pin WHICH mechanism refuses it. Where the stack
      // gives out is a property of the runner, and pinning it is what made the
      // previous version of this test architecture-dependent: the fixture was a
      // 5,000-deep JS graph, and `JSON.stringify` overflowed here in the test
      // process — never reaching the server — on CI's x64 stack while clearing
      // arm64's.
      expect(res.status).toBe(200);
      expect((await res.json()).result.isError).toBe(true);

      // The property that actually matters, and the one a crash would break:
      // a hostile payload must not poison the server for the next caller.
      const after = await jsonRpc({
        jsonrpc: "2.0",
        id: 32,
        method: "tools/call",
        params: { name: "render_note_card", arguments: { body: "ok" } },
      });
      expect(after.status).toBe(200);
      expect((await after.json()).result.isError).toBeUndefined();
    });

    it("refuses an oversized JSON-RPC request before the SDK parses it", async () => {
      // The hole this closes: `/mcp` handed the raw request straight to the SDK,
      // and the only size check ran on the CONSTRUCTED candidate — after the SDK
      // had parsed the body and stripped everything the tool did not declare.
      // `render_dashboard` reads only `root`, so `junk` is discarded and the
      // candidate is tiny: no downstream check can ever see this payload.
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 33,
        method: "tools/call",
        params: {
          name: "render_dashboard",
          arguments: {
            root: { type: "NoteCard", body: "ok" },
            junk: "x".repeat(LIMITS.payloadBytes),
          },
        },
      });
      expect(res.status).toBe(413);
      const body = await res.json();
      // Non-vacuity: prove nothing was rendered, not merely that a status came back.
      expect(JSON.stringify(body)).not.toContain('"weave"');
    });

    it("counts UTF-8 bytes at ingress, not UTF-16 code units", () => {
      // Guards the same trap the payload tests carry: a `.length` check would
      // admit three times the cap for multibyte content.
      const filler = "€".repeat(LIMITS.payloadBytes / 2);
      expect(filler.length).toBeLessThan(LIMITS.payloadBytes);
      expect(new TextEncoder().encode(filler).length).toBeGreaterThan(LIMITS.payloadBytes);
      return jsonRpc({
        jsonrpc: "2.0",
        id: 34,
        method: "tools/call",
        params: {
          name: "render_dashboard",
          arguments: { root: { type: "NoteCard", body: "ok" }, junk: filler },
        },
      }).then((res) => {
        expect(res.status).toBe(413);
      });
    });

    it("accepts a JSON-RPC request comfortably inside the ingress budget", async () => {
      // Non-vacuity for the budget: it must not refuse ordinary traffic.
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 35,
        method: "tools/call",
        params: { name: "render_note_card", arguments: { body: "ok" } },
      });
      expect(res.status).toBe(200);
      expect((await res.json()).result.isError).toBeUndefined();
    });

    it("tools/call rejects an undeclared key on a node", async () => {
      const res = await jsonRpc({
        jsonrpc: "2.0",
        id: 36,
        method: "tools/call",
        params: {
          name: "render_dashboard",
          arguments: { root: { type: "NoteCard", body: "ok", onLoad: "alert(1)" } },
        },
      });
      const body = await res.json();
      expect(body.result?.isError ?? body.error !== undefined).toBe(true);
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
