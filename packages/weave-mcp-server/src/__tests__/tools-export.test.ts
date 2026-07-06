import { describe, expect, it } from "vitest";
import { TOOLS, TOOLS_BY_NAME, invokeTool } from "../tools.js";

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
