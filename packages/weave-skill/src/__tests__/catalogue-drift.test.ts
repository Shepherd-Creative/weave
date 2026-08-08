import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as publicSurface from "../index.js";
import { loadSkill } from "../loadSkill.js";

// F6/F9 drift guard for the model-facing skill. SKILL.md is a system prompt:
// every primitive it names is a primitive the model will try to emit, so a
// name here that the Spec union cannot accept becomes a rejected tool call.
//
// This file guards the skill's INTERNAL consistency (no dependency on
// weave-primitives). The catalogue is cross-checked against the actual Spec
// union in weave-mcp-server's catalogue-drift test, which already depends on
// both packages.

const SKILL = loadSkill("skill");

// Wave 2 of the approved portfolio plan builds these. Divider and Spacer are
// REJECTED (Grid/Stack gaps own whitespace; semantic sectioning becomes
// `Section` in Wave 3). Comparison is deferred behind unmet entry criteria —
// two KPIs in a Stack cover the current need — so it must not be recommended
// or promised while it is unavailable.
const APPROVED_NEXT = ["Sparkline", "ProgressBar", "Badge"];
const UNAVAILABLE_PRIMITIVES = ["Comparison", "Divider", "Spacer"];

/** The `## 9. Catalogue reference` section body. */
function catalogueSection(): string {
  const start = SKILL.indexOf("## 9. Catalogue reference");
  expect(start, "SKILL.md must carry a numbered catalogue section").toBeGreaterThan(-1);
  const rest = SKILL.slice(start + 1);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Backticked CapitalCase names inside a markdown span. */
function backtickedNames(markdown: string): string[] {
  return [...markdown.matchAll(/`([A-Z][A-Za-z]*)`/g)].map((m) => m[1] as string);
}

describe("SKILL.md names only available primitives", () => {
  it("recommends no primitive that does not exist yet", () => {
    for (const name of UNAVAILABLE_PRIMITIVES) {
      // Backticked: `Comparison` is a primitive reference, whereas the prose
      // word "Comparisons" in §1 is ordinary English and stays legal.
      expect(SKILL, `SKILL.md still references the unavailable '${name}' primitive`).not.toContain(
        `\`${name}\``,
      );
    }
  });

  it("answers the two-KPI case with a Stack composition", () => {
    const line = SKILL.split("\n").find((l) => l.includes("2 KPIs"));
    expect(line, "SKILL.md must give explicit two-KPI guidance").toBeDefined();
    expect(line as string).toContain("`Stack`");
    expect(line as string).toContain("`KPI`");
    // The Stack composition is the whole answer while Comparison is deferred —
    // offering it as an alternative is what made the guidance unusable.
    expect(line as string).not.toContain("Comparison");
  });

  it("only names plan-approved primitives as forthcoming", () => {
    const section = catalogueSection();
    const plannedLine = section.split("\n").find((l) => /planned|not yet available/i.test(l));
    expect(plannedLine, "catalogue must state what is coming next").toBeDefined();
    const named = backtickedNames(plannedLine as string);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !APPROVED_NEXT.includes(n))).toEqual([]);
  });
});

/**
 * `DataRow` carries a `type` and appears in worked examples, but it is NOT a
 * catalogue primitive — Wave 1 demoted it to `TableCard` internals, because on
 * its own it renders a `<tr>` with no table around it (F2). It is the only
 * shape with that status, so it is named explicitly rather than the guard being
 * relaxed to "anything the catalogue omits is probably fine".
 */
const TABLE_INTERNAL_SHAPES = ["DataRow"];

describe("SKILL.md is internally consistent", () => {
  it("uses no primitive type in its worked examples that the catalogue omits", () => {
    const section = catalogueSection();
    const shippedLine = section
      .split("\n")
      .filter((l) => /Atoms:|Molecules:|Organisms:|Layouts:/.test(l))
      .join("\n");
    const catalogue = new Set(backtickedNames(shippedLine));
    expect(catalogue.size, "catalogue section must list the shipped primitives").toBeGreaterThan(0);

    const usedInExamples = new Set(
      [...SKILL.matchAll(/"type":\s*"([A-Za-z]+)"/g)].map((m) => m[1] as string),
    );
    expect(usedInExamples.size, "SKILL.md must carry worked JSON examples").toBeGreaterThan(0);

    const unexplained = [...usedInExamples].filter(
      (t) => !catalogue.has(t) && !TABLE_INTERNAL_SHAPES.includes(t),
    );
    expect(unexplained).toEqual([]);
  });

  it("keeps the catalogue omitting the table-internal shapes", () => {
    // The exemption above is only safe while the catalogue really does omit
    // them. Without this, adding `DataRow` back to the catalogue would go
    // unnoticed and the model would be told it can place one anywhere.
    const catalogue = new Set(
      backtickedNames(
        catalogueSection()
          .split("\n")
          .filter((l) => /Atoms:|Molecules:|Organisms:|Layouts:/.test(l))
          .join("\n"),
      ),
    );
    for (const shape of TABLE_INTERNAL_SHAPES) {
      expect(catalogue.has(shape), `${shape} is table-internal and must not be catalogued`).toBe(
        false,
      );
    }
  });

  it("explains where a table-internal shape may appear", () => {
    // An exempted shape the skill never explains is worse than one it forbids:
    // the model sees it in an example and infers it is a general primitive.
    const section = catalogueSection();
    for (const shape of TABLE_INTERNAL_SHAPES) {
      expect(section, `catalogue must say where ${shape} is allowed`).toContain(shape);
      expect(section).toContain("TableCard.rows");
    }
  });

  it("never shows a table-internal shape as a root or a layout child", () => {
    // The rule Wave 1 enforces in code, checked against the prose that teaches
    // it: in every worked example a DataRow must sit inside a `rows` array.
    for (const shape of TABLE_INTERNAL_SHAPES) {
      const occurrences = [...SKILL.matchAll(new RegExp(`"type":\\s*"${shape}"`, "g"))];
      expect(occurrences.length, `no worked example uses ${shape}`).toBeGreaterThan(0);
      for (const occurrence of occurrences) {
        const preceding = SKILL.slice(0, occurrence.index);
        const nearestRows = preceding.lastIndexOf('"rows"');
        const nearestChildren = preceding.lastIndexOf('"children"');
        expect(
          nearestRows > nearestChildren,
          `a ${shape} in a worked example is not inside a rows array`,
        ).toBe(true);
      }
    }
  });
});

describe("public version claims track package metadata", () => {
  const PKG_DIR = path.resolve(__dirname, "..", "..");
  const PKG = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf-8")) as {
    version: string;
  };
  const INDEX_SRC = readFileSync(path.join(PKG_DIR, "src", "index.ts"), "utf-8");

  it("hard-codes no version literal in the public entry point", () => {
    // Non-vacuity floor: prove we actually read the entry source.
    expect(INDEX_SRC).toContain("loadSkill");
    expect(INDEX_SRC).not.toMatch(/_VERSION\s*(?::[^=]+)?=\s*["'`]/);
  });

  it("exports no version constant that disagrees with package.json", () => {
    const exported = Object.entries(publicSurface as Record<string, unknown>).filter(([k]) =>
      k.endsWith("_VERSION"),
    );
    for (const [key, value] of exported) {
      expect(value, `${key} must equal the published package version`).toBe(PKG.version);
    }
  });
});
