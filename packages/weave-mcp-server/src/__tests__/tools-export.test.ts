import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { invokeTool, TOOLS, TOOLS_BY_NAME } from "../tools.js";
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

describe("a fixed tool's `type` is not a caller argument", () => {
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
});
