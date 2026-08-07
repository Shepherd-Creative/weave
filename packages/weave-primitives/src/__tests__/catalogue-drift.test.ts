import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as publicSurface from "../index.js";
import { SpecSchema } from "../schemas/index.js";

// F9 drift guard. The README catalogue, the shipped-primitive count and the
// public version constant are all claims about this package. Each one is
// checked against the thing it claims to describe (the Spec union and
// package.json), so a claim cannot rot silently between releases.

const PKG_DIR = path.resolve(__dirname, "..", "..");
const README = readFileSync(path.join(PKG_DIR, "README.md"), "utf-8");
const PKG = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf-8")) as {
  version: string;
};
const INDEX_SRC = readFileSync(path.join(PKG_DIR, "src", "index.ts"), "utf-8");

/**
 * Runtime discriminator keys of the Spec union — the single source of truth
 * for "which primitives exist".
 *
 * SpecSchema is `z.lazy(() => z.discriminatedUnion("type", [...]))`, so the
 * members live behind the lazy getter on Zod-internal `_def`. That is private
 * API: if a Zod upgrade moves it, this THROWS rather than returning an empty
 * set, so the guard can never pass by measuring nothing.
 */
function specUnionMembers(): string[] {
  const lazyDef = (SpecSchema as unknown as { _def?: { getter?: () => unknown } })._def;
  const inner = typeof lazyDef?.getter === "function" ? lazyDef.getter() : SpecSchema;
  const optionsMap = (inner as { _def?: { optionsMap?: Map<string, unknown> } })._def?.optionsMap;
  if (!optionsMap || optionsMap.size === 0) {
    throw new Error(
      "Could not enumerate the Spec union via Zod internals (_def.optionsMap). " +
        "Zod's internal shape changed — update this guard rather than deleting it.",
    );
  }
  return [...optionsMap.keys()];
}

/**
 * Backticked primitive names in the README's catalogue TABLE. Scoped to table
 * rows so surrounding prose (which may legitimately name a primitive while
 * explaining a composition) cannot inflate the catalogue.
 */
function readmeCatalogueNames(): string[] {
  const start = README.indexOf("## Primitives available");
  expect(start, "README must carry a '## Primitives available' catalogue section").toBeGreaterThan(
    -1,
  );
  const rest = README.slice(start + 1);
  const end = rest.indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, end);
  const tableRows = section
    .split("\n")
    .filter((l) => l.trimStart().startsWith("|"))
    .join("\n");
  expect(tableRows, "the catalogue section must contain a markdown table").not.toBe("");
  return [...tableRows.matchAll(/`([A-Z][A-Za-z]*)`/g)].map((m) => m[1] as string);
}

// Primitives the approved portfolio plan commits to building next (Wave 2).
// Divider and Spacer are REJECTED, not deferred: Grid/Stack gaps own
// whitespace and semantic sectioning becomes `Section` in Wave 3. Comparison
// and Funnel are deferred behind unmet entry criteria, so neither may be
// advertised here as forthcoming.
const APPROVED_NEXT = ["Sparkline", "ProgressBar", "Badge"];
const REJECTED_PRIMITIVES = ["Divider", "Spacer"];

describe("README catalogue matches the Spec union", () => {
  it("lists exactly the primitives the Spec union accepts", () => {
    expect(readmeCatalogueNames().slice().sort()).toEqual(specUnionMembers().slice().sort());
  });

  it("states a shipped count equal to the number of Spec union members", () => {
    const match = README.match(/(\d+)\s+primitives shipped/);
    expect(match, "README status line must state '<N> primitives shipped'").not.toBeNull();
    expect(Number((match as RegExpMatchArray)[1])).toBe(specUnionMembers().length);
  });

  it("does not promise rejected primitives", () => {
    for (const name of REJECTED_PRIMITIVES) {
      expect(README, `README still promises the rejected '${name}' primitive`).not.toContain(name);
    }
  });

  it("only names plan-approved primitives as forthcoming", () => {
    const start = README.indexOf("Planned next");
    expect(start, "README must carry a 'Planned next' line").toBeGreaterThan(-1);
    const line = README.slice(start).split("\n")[0] as string;
    const named = [...line.matchAll(/`([A-Z][A-Za-z]*)`/g)].map((m) => m[1] as string);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !APPROVED_NEXT.includes(n))).toEqual([]);
  });
});

describe("public version claims track package metadata", () => {
  it("hard-codes no version literal in the public entry point", () => {
    // Non-vacuity floor: prove we actually read the entry source.
    expect(INDEX_SRC).toContain("export * from ");
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
