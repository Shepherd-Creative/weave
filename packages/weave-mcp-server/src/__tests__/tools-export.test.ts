import {
  ChartCardSchema,
  MetricBandSchema,
  NoteCardSchema,
  TableCardSchema,
} from "@shepherd-creative/weave-primitives/schemas";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  DashboardGatewaySchema,
  FIXED_TOOL_RESERVED_KEYS,
  invokeTool,
  TOOLS,
  TOOLS_BY_NAME,
} from "../tools.js";
import { FIXED_TOOL_TYPES, VALID_FIXED_TOOL_ARGS } from "./fixtures.js";

describe("tools registry surface", () => {
  it("exposes exactly the five render tools", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "render_metric_band",
      "render_chart_card",
      "render_table_card",
      "render_note_card",
      "render_dashboard",
    ]);
    expect(Object.keys(TOOLS_BY_NAME)).toHaveLength(5);
    expect(typeof invokeTool).toBe("function");
  });
});

describe("a fixed tool's `type` and `id` are not caller arguments", () => {
  it("accepts every fixture unchanged (non-vacuity control)", () => {
    // Without this, every rejection below could be a rejection of the fixture.
    for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
      const document = invokeTool(name, args);
      expect(document.weave, `${name} fixture is not otherwise valid`).toBe(1);
      expect(document.root.type).toBe(FIXED_TOOL_TYPES[name]);
    }
  });

  it("rejects a conflicting `type` on an otherwise-valid payload", () => {
    for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
      expect(
        () => invokeTool(name, { ...args, type: "Stack" }),
        `${name} silently normalised a conflicting type`,
      ).toThrow(ZodError);
    }
  });

  it("rejects a redundant matching `type` too — the key is not advertised at all", () => {
    // `/mcp` runs the advertised schema, which is `…Schema.omit({ type, id })`.
    // There, `type` is an unrecognised key whether or not it agrees with the
    // tool's own discriminator (measured on the SDK: both raise
    // `unrecognized_keys: ["type"]`). Accepting the agreeing case here would
    // leave the surfaces disagreeing about the same request.
    for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
      expect(
        () => invokeTool(name, { ...args, type: FIXED_TOOL_TYPES[name] }),
        `${name} accepted a redundant matching type`,
      ).toThrow(ZodError);
    }
  });

  it("reports it as an unrecognised key on `type`, the issue /mcp already raises", () => {
    // Same code, same path, same key — so a client gets one answer regardless
    // of which surface it happened to reach.
    let caught: unknown;
    try {
      invokeTool("render_note_card", { ...VALID_FIXED_TOOL_ARGS.render_note_card, type: "Stack" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ZodError);
    const { issues } = caught as ZodError;
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("unrecognized_keys");
    expect((issues[0] as { keys?: string[] }).keys).toEqual(["type"]);
    expect(issues[0].path).toEqual([]);
  });

  it("still returns no document at all when the key is present", () => {
    // The defect was not a wrong error code, it was a document the caller was
    // never entitled to. Prove nothing comes back.
    let document: unknown = "unset";
    try {
      document = invokeTool("render_note_card", { type: "Stack", body: "ok" });
    } catch {
      document = undefined;
    }
    expect(document).toBeUndefined();
  });

  it("leaves render_dashboard alone — it has no fixed type to conflict with", () => {
    // `render_dashboard` carries its root under `root` and stamps nothing, so
    // there is no discriminator for a caller to contradict. Its behaviour is
    // unchanged by this rule, and this test says so out loud.
    const document = invokeTool("render_dashboard", {
      root: { type: "Stack", children: [{ type: "NoteCard", body: "ok" }] },
    });
    expect(document.root.type).toBe("Stack");
  });

  it("rejects a caller-supplied `id` on an otherwise-valid payload", () => {
    // Same rule, same reason: the advertised schema is `omit({ type, id })`, so
    // `id` is a key these tools do not take. It was accepted over REST (stamped
    // onto the root), refused by `/mcp`, and silently dropped by the MCP App —
    // three surfaces, three answers, for a field with no contract behind it.
    for (const [name, args] of Object.entries(VALID_FIXED_TOOL_ARGS)) {
      expect(
        () => invokeTool(name, { ...args, id: "caller-chosen" }),
        `${name} accepted a caller-supplied id`,
      ).toThrow(ZodError);
    }
  });

  it("reports `id` as an unrecognised key, exactly as it reports `type`", () => {
    let caught: unknown;
    try {
      invokeTool("render_note_card", { ...VALID_FIXED_TOOL_ARGS.render_note_card, id: "n1" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ZodError);
    const { issues } = caught as ZodError;
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("unrecognized_keys");
    expect((issues[0] as { keys?: string[] }).keys).toEqual(["id"]);
  });

  it("names both reserved keys in one issue, in the order the caller sent them", () => {
    // Measured on this tree: Zod reports unrecognised keys in INPUT order, not
    // schema order — `{ body, type, id }` gives `["type", "id"]` and
    // `{ body, id, type }` gives `["id", "type"]`, while the schema's own shape
    // order is `id, type`. So both orders are asserted: a guard that emitted a
    // fixed order would match one of these and silently diverge from the SDK on
    // the other, which is precisely the class of near-miss this whole thread of
    // work has been about.
    for (const args of [
      { body: "ok", type: "Stack", id: "n1" },
      { body: "ok", id: "n1", type: "Stack" },
    ]) {
      let caught: unknown;
      try {
        invokeTool("render_note_card", args);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ZodError);
      const { issues } = caught as ZodError;
      expect(issues).toHaveLength(1);
      expect((issues[0] as { keys?: string[] }).keys).toEqual(
        Object.keys(args).filter((k) => k !== "body"),
      );
    }
  });

  it("reserves exactly the keys each fixed tool omits from its advertised schema", () => {
    // The drift guard. `FIXED_TOOL_RESERVED_KEYS` is a hand-written list, and a
    // hand-written list goes stale the day someone changes an `.omit(...)`.
    // This derives the truth from the schemas themselves and fails if the two
    // ever disagree — in either direction.
    const NODE_SCHEMAS: Record<string, { shape: Record<string, unknown> }> = {
      render_metric_band: MetricBandSchema,
      render_chart_card: ChartCardSchema,
      render_table_card: TableCardSchema,
      render_note_card: NoteCardSchema,
    };
    for (const [name, schema] of Object.entries(NODE_SCHEMAS)) {
      const advertised = Object.keys(TOOLS_BY_NAME[name].inputSchema.shape);
      const omitted = Object.keys(schema.shape).filter((key) => !advertised.includes(key));
      expect(omitted.sort(), `${name} omits keys the guard does not reserve`).toEqual(
        [...FIXED_TOOL_RESERVED_KEYS].sort(),
      );
    }
  });

  it("still lets a document carry ids through render_dashboard", () => {
    // The reason refusing `id` on the fixed tools costs nothing: the canonical
    // document path is where ids belong, and it keeps them. If this ever goes
    // red, the rule above stopped being a scoping decision and became a
    // capability removal.
    const document = invokeTool("render_dashboard", {
      root: {
        type: "Stack",
        id: "root-1",
        children: [{ type: "NoteCard", id: "note-1", body: "ok" }],
      },
    });
    expect(document.root.id).toBe("root-1");
    expect((document.root as { children: Array<{ id?: string }> }).children[0].id).toBe("note-1");
  });
});

/**
 * The gateway is the last place an unknown key was still being dropped in
 * silence, and it was the widest: every other tool's args ARE a node, so the
 * strict node schemas caught undeclared keys downstream. `render_dashboard`'s
 * args are the gateway object, whose only declared key is `root` — and
 * `z.object()` without `.strict()` strips the rest, on the two surfaces that run
 * the advertised schema, while `invokeTool` simply read `record.root` and never
 * looked at the rest at all.
 *
 * Every payload below is a valid document root plus ONE small undeclared key, so
 * a rejection is about that key and nothing else — and small deliberately: the
 * ingress budget already refuses a large one, and a test that leaned on the
 * budget would prove the budget, not this.
 */
describe("render_dashboard's gateway takes `root` and nothing else", () => {
  const VALID_ROOT = { type: "Stack", children: [{ type: "NoteCard", body: "ok" }] };

  it("accepts the bare gateway object (non-vacuity control)", () => {
    // Without this, every rejection below could be a rejection of the root.
    const document = invokeTool("render_dashboard", { root: VALID_ROOT });
    expect(document.weave).toBe(1);
    expect(document.root.type).toBe("Stack");
  });

  it("refuses a valid document carrying one small undeclared key", () => {
    expect(
      () => invokeTool("render_dashboard", { root: VALID_ROOT, junk: 1 }),
      "the gateway silently discarded an undeclared key",
    ).toThrow(ZodError);
  });

  it("reports it as an unrecognised key on the gateway, the issue /mcp raises", () => {
    let caught: unknown;
    try {
      invokeTool("render_dashboard", { root: VALID_ROOT, junk: 1 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ZodError);
    const { issues } = caught as ZodError;
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("unrecognized_keys");
    expect((issues[0] as { keys?: string[] }).keys).toEqual(["junk"]);
    expect(issues[0].path).toEqual([]);
  });

  it("returns no document at all when an undeclared key is present", () => {
    // The defect was never a status code. It was a document built from a
    // request the server had quietly rewritten.
    let document: unknown = "unset";
    try {
      document = invokeTool("render_dashboard", { root: VALID_ROOT, junk: 1 });
    } catch {
      document = undefined;
    }
    expect(document).toBeUndefined();
  });

  it("refuses a caller-written envelope rather than silently downgrading it", () => {
    // The case that makes this more than tidiness. The gateway exists so the
    // SERVER stamps the version; a caller who writes the envelope themselves —
    // `{ weave: 2, root }`, asking for a format this build does not implement —
    // had `weave` deleted and got a v1 document back, which is the one answer a
    // version negotiation must never give.
    for (const weave of [1, 2]) {
      expect(
        () => invokeTool("render_dashboard", { weave, root: VALID_ROOT }),
        `weave: ${weave} was silently dropped`,
      ).toThrow(ZodError);
    }
  });

  it("names every undeclared key in one issue, in the order the caller sent them", () => {
    // Same reporting contract the fixed tools carry: Zod reports unrecognised
    // keys in INPUT order, so a guard emitting a fixed order would agree with
    // the SDK on one input and diverge on the other.
    for (const args of [
      { root: VALID_ROOT, alpha: 1, beta: 2 },
      { beta: 2, root: VALID_ROOT, alpha: 1 },
    ]) {
      let caught: unknown;
      try {
        invokeTool("render_dashboard", args);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ZodError);
      const { issues } = caught as ZodError;
      expect(issues).toHaveLength(1);
      expect((issues[0] as { keys?: string[] }).keys).toEqual(
        Object.keys(args).filter((k) => k !== "root"),
      );
    }
  });

  it("refuses the same key in the ADVERTISED schema too, not only in invokeTool", () => {
    // The second layer, and it is not redundant: `/mcp` and the MCP App run this
    // schema and hand `invokeTool` whatever survives it. A non-strict gateway
    // deletes the key upstream of the shared guard, so the guard cannot see it
    // — the same "a guard cannot run on input thrown away above it" shape the
    // `.shape`-vs-schema registration bug had.
    expect(DashboardGatewaySchema.safeParse({ root: VALID_ROOT }).success).toBe(true);

    const rejected = DashboardGatewaySchema.safeParse({ root: VALID_ROOT, junk: 1 });
    expect(rejected.success).toBe(false);
    if (rejected.success) return;
    expect(rejected.error.issues[0].code).toBe("unrecognized_keys");
    expect((rejected.error.issues[0] as { keys?: string[] }).keys).toEqual(["junk"]);
  });

  it("refuses a key that only the prototype chain would call declared", () => {
    // `key in shape` walks the prototype chain, so `toString` and `constructor`
    // read as declared keys and get discarded in silence — the original defect,
    // surviving in the two places nobody would think to test. The guard uses
    // `Object.hasOwn`, and this is what says so.
    for (const key of ["toString", "constructor", "hasOwnProperty"]) {
      expect(
        () => invokeTool("render_dashboard", { root: VALID_ROOT, [key]: 1 }),
        `\`${key}\` was accepted as a declared gateway key`,
      ).toThrow(ZodError);
    }
  });

  it("derives the allowed keys from the advertised schema, not a hand-written list", () => {
    // A second copy of "the gateway takes root" would go stale the day the
    // gateway grows a key. The guard reads the schema's own shape, so this test
    // pins the two together rather than mirroring one in the other.
    expect(Object.keys(TOOLS_BY_NAME.render_dashboard.inputSchema.shape)).toEqual(["root"]);
  });

  it("still carries a document's own ids through untouched", () => {
    // `id` is a key of the ROOT NODE, not of the gateway. A guard that confused
    // the two would refuse every document that names anything — so this is the
    // line between "the gateway is closed" and "documents lost their ids".
    const document = invokeTool("render_dashboard", {
      root: { type: "Stack", id: "root-1", children: [{ type: "NoteCard", id: "n1", body: "ok" }] },
    });
    expect(document.root.id).toBe("root-1");
    expect((document.root as { children: Array<{ id?: string }> }).children[0].id).toBe("n1");
  });
});
