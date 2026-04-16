import { describe, expect, it } from "vitest";
import { loadSkill, skillPath } from "../loadSkill.js";

describe("loadSkill", () => {
  it("returns the SKILL.md content by default", () => {
    const content = loadSkill();
    expect(content).toContain("DASHBOARD COMPOSITION — SKILL");
    expect(content).toContain("END OF SKILL CONTENT");
  });

  it("returns NOTES.md when variant='notes'", () => {
    const content = loadSkill("notes");
    expect(content).toContain("SKILL — design notes");
  });

  it("skill content does not include design notes", () => {
    const skill = loadSkill("skill");
    expect(skill).not.toContain("SKILL — design notes");
    expect(skill).not.toContain("10.1 SKILL.md loading decision");
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
