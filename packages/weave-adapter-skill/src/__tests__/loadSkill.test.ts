import { describe, expect, it } from "vitest";
import { loadSkill, skillPath } from "../loadSkill.js";

// The eight method-step headings, in order. loadSkill() must surface every
// one: the SKILL.md is only useful to an agent if the whole method survives
// bundling. Assert the stable, greppable heading text (kept in lockstep with
// the SKILL.md section headings) rather than the exact `## N.` prefix.
const STEP_HEADINGS = [
  "Inventory the design source",
  "Map structural colours",
  "Derive semantic tones",
  "Synthesise the chart ramp",
  "Emit font stacks, never font files",
  "Record drops and gaps",
  "Write the composition brief",
  "Gate and review",
];

describe("loadSkill", () => {
  it("returns the SKILL.md content", () => {
    const content = loadSkill();
    expect(content).toContain("DESIGN-SOURCE ADAPTER SKILL");
    expect(content).toContain("END OF SKILL CONTENT");
  });

  it("includes every method-step heading", () => {
    const content = loadSkill();
    for (const heading of STEP_HEADINGS) {
      expect(content).toContain(heading);
    }
  });

  it("documents the top matter: the LLM/CSS split and the drop-report schema", () => {
    const content = loadSkill();
    expect(content).toContain("offline authoring tool");
    expect(content).toContain("The drop-report schema (version 1)");
  });

  it("skill content is non-trivial", () => {
    const content = loadSkill();
    expect(content.length).toBeGreaterThan(3000);
  });

  it("skillPath returns absolute path ending in SKILL.md", () => {
    const path = skillPath();
    expect(path.endsWith("SKILL.md")).toBe(true);
    expect(path.startsWith("/")).toBe(true);
  });
});
