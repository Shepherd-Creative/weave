import { describe, expect, it } from "vitest";
import { levenshtein, suggestNearest } from "../levenshtein.js";

describe("levenshtein", () => {
  it("distance to itself is 0", () => {
    expect(levenshtein("--background", "--background")).toBe(0);
  });

  it("empty string distance equals the other string's length", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "")).toBe(0);
  });

  it("single substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("single insertion / deletion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("is symmetric", () => {
    expect(levenshtein("kitten", "sitting")).toBe(levenshtein("sitting", "kitten"));
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("--tone-postive -> --tone-positive is a single-edit typo", () => {
    expect(levenshtein("--tone-postive", "--tone-positive")).toBe(1);
  });
});

describe("suggestNearest", () => {
  const KNOWN = [
    "--tone-positive",
    "--tone-negative",
    "--tone-warning",
    "--tone-info",
    "--background",
    "--foreground",
  ];

  it("suggests the nearest known variable within the default distance cap", () => {
    expect(suggestNearest("--tone-postive", KNOWN)).toBe("--tone-positive");
  });

  it("returns undefined when nothing is within the distance cap", () => {
    expect(suggestNearest("--completely-unrelated-name-xyz", KNOWN)).toBeUndefined();
  });

  it("returns undefined for an empty candidate list", () => {
    expect(suggestNearest("--background", [])).toBeUndefined();
  });

  it("respects a custom maxDistance", () => {
    // "--tone-x" is 8 edits from "--tone-positive" (roughly) — comfortably
    // outside a tight cap even though it shares the "--tone-" prefix.
    expect(suggestNearest("--tone-x", KNOWN, 1)).toBeUndefined();
  });
});
