import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  LIMITS,
  legacySpecToDocumentV1,
  parseWeaveDocumentJson,
  validateWeaveDocument,
  WEAVE_DOCUMENT_VERSION,
  WeaveDocumentError,
  WeaveDocumentV1Schema,
} from "../schemas/index.js";

/**
 * Wave 1: the versioned document boundary.
 *
 * `validateWeaveDocument` is the single gate every path goes through — the
 * React renderer, HTTP REST, MCP JSON-RPC and the MCP App. Everything asserted
 * here is therefore asserted once for all four; the transport tests prove they
 * route through it rather than re-implementing it.
 */

const noteCard = (over: Record<string, unknown> = {}) => ({
  type: "NoteCard",
  body: "Context.",
  ...over,
});

const doc = (root: unknown) => ({ weave: WEAVE_DOCUMENT_VERSION, root });

/** A Grid chain `depth` containers deep wrapping a terminal NoteCard. */
const nestedContainers = (depth: number) => {
  let node: unknown = noteCard();
  for (let i = 0; i < depth; i++) node = { type: "Grid", cols: 1, children: [node] };
  return node;
};

describe("harness sanity", () => {
  // Every rejection below asserts an error TYPE, not merely "it threw". Without
  // this check that discipline is still not enough: if an import is missing,
  // the call throws TypeError and `.toThrow(SomeUndefined)` degrades to a bare
  // `.toThrow()`, so a whole broken suite reports green. Observed exactly that
  // on this file's first run — 31 "passes" against a module that did not exist.
  it("imported the entry points it is about to test", () => {
    expect(typeof validateWeaveDocument).toBe("function");
    expect(typeof legacySpecToDocumentV1).toBe("function");
    expect(typeof parseWeaveDocumentJson).toBe("function");
    expect(typeof WeaveDocumentV1Schema?.safeParse).toBe("function");
    expect(WeaveDocumentError?.prototype).toBeInstanceOf(Error);
    expect(WEAVE_DOCUMENT_VERSION).toBe(1);
  });
});

describe("the envelope", () => {
  it("accepts a versioned document with a layout root", () => {
    const parsed = validateWeaveDocument(doc({ type: "Stack", children: [noteCard()] }));
    expect(parsed.weave).toBe(1);
    expect(parsed.root.type).toBe("Stack");
  });

  it("rejects a bare spec with no envelope", () => {
    expect(() => validateWeaveDocument({ type: "Stack", children: [] })).toThrow(z.ZodError);
  });

  it("rejects a document with no version", () => {
    expect(() => validateWeaveDocument({ root: noteCard() })).toThrow(z.ZodError);
  });

  it("rejects a document declaring a version this build does not implement", () => {
    expect(() => validateWeaveDocument({ weave: 2, root: noteCard() })).toThrow(z.ZodError);
  });

  it("rejects a document with no root", () => {
    expect(() => validateWeaveDocument({ weave: 1 })).toThrow(z.ZodError);
  });

  it("rejects unknown envelope keys rather than ignoring them", () => {
    expect(() => validateWeaveDocument({ weave: 1, root: noteCard(), onLoad: "alert(1)" })).toThrow(
      z.ZodError,
    );
  });
});

describe("root membership", () => {
  const accepted: Array<[string, unknown]> = [
    ["Grid", { type: "Grid", cols: 2, children: [noteCard()] }],
    ["Stack", { type: "Stack", children: [noteCard()] }],
    ["MetricBand", { type: "MetricBand", items: [{ type: "KPI", label: "A", value: 1 }] }],
    [
      "ChartCard",
      { type: "ChartCard", title: "T", chart: { type: "Chart", variant: "line", data: [] } },
    ],
    [
      "TableCard",
      {
        type: "TableCard",
        title: "T",
        headers: [{ text: "H" }],
        rows: [{ type: "DataRow", cells: [{ kind: "text", value: "x" }] }],
      },
    ],
    ["NoteCard", noteCard()],
  ];

  for (const [name, root] of accepted) {
    it(`accepts ${name} as a root`, () => {
      expect(validateWeaveDocument(doc(root)).root.type).toBe(name);
    });
  }

  const rejected: Array<[string, unknown]> = [
    ["Number", { type: "Number", value: 1 }],
    ["Label", { type: "Label", text: "hi" }],
    ["Icon", { type: "Icon", name: "check" }],
    ["DataRow", { type: "DataRow", cells: [{ kind: "text", value: "x" }] }],
    ["KPI", { type: "KPI", label: "A", value: 1 }],
    ["Stat", { type: "Stat", label: "A", value: 1 }],
    ["Chart", { type: "Chart", variant: "line", data: [] }],
  ];

  for (const [name, root] of rejected) {
    it(`rejects ${name} as a root`, () => {
      expect(() => validateWeaveDocument(doc(root))).toThrow(z.ZodError);
    });
  }

  it("still accepts an atom as a layout child", () => {
    // The composition skill's §5.1 and §6 both prescribe a Label between
    // organisms; only the ROOT is restricted, never the composition.
    const parsed = validateWeaveDocument(
      doc({ type: "Stack", children: [{ type: "Label", text: "Q1" }, noteCard()] }),
    );
    expect(parsed.root.type).toBe("Stack");
  });

  it("rejects a DataRow as a layout child", () => {
    expect(() =>
      validateWeaveDocument(doc({ type: "Stack", children: [{ type: "DataRow", cells: [] }] })),
    ).toThrow(z.ZodError);
  });
});

describe("depth policy", () => {
  it(`accepts exactly ${LIMITS.depth} nested containers`, () => {
    expect(validateWeaveDocument(doc(nestedContainers(LIMITS.depth)))).toBeDefined();
  });

  it(`rejects ${LIMITS.depth + 1} nested containers`, () => {
    expect(() => validateWeaveDocument(doc(nestedContainers(LIMITS.depth + 1)))).toThrow(
      WeaveDocumentError,
    );
  });

  it("names depth as the reason", () => {
    try {
      validateWeaveDocument(doc(nestedContainers(LIMITS.depth + 1)));
      throw new Error("expected a rejection");
    } catch (err) {
      expect((err as WeaveDocumentError).code).toBe("depth");
    }
  });

  it("rejects raw object nesting deep enough to overflow the stack", () => {
    // Not container nesting — a chain of ordinary objects. Without its own
    // guard the structural walk recurses until the JS stack dies, which is a
    // RangeError escaping as a 500 rather than a clean rejection.
    let hostile: Record<string, unknown> = { type: "NoteCard", body: "x" };
    for (let i = 0; i < 20_000; i++) hostile = { nested: hostile };
    expect(() => validateWeaveDocument(doc(hostile))).toThrow(WeaveDocumentError);
  });
});

describe("node-count policy", () => {
  it("rejects a document with more objects than the cap", () => {
    // Reached by breadth, within the depth and per-container caps.
    const bigTable = {
      type: "TableCard",
      title: "T",
      headers: Array.from({ length: 7 }, (_, i) => ({ text: `H${i}` })),
      rows: Array.from({ length: 40 }, () => ({
        type: "DataRow",
        cells: Array.from({ length: 7 }, () => ({ kind: "number", value: 1 })),
      })),
    };
    const root = {
      type: "Stack",
      children: Array.from({ length: 12 }, () => ({
        type: "Grid",
        children: Array.from({ length: 12 }, () => bigTable),
      })),
    };
    expect(() => validateWeaveDocument(doc(root))).toThrow(WeaveDocumentError);
  });

  it("accepts the busiest realistic dashboard", () => {
    // Measured at 1,473 objects / 47,596 bytes by
    // bench/document-limits.bench.mjs — the cap has to leave room for a
    // document anyone would actually compose.
    const root = {
      type: "Stack",
      gap: "md",
      children: [
        {
          type: "MetricBand",
          items: Array.from({ length: 5 }, (_, i) => ({
            type: "KPI",
            label: `KPI ${i}`,
            value: i,
            size: "lg",
          })),
        },
        ...Array.from({ length: 4 }, (_, c) => ({
          type: "ChartCard",
          title: `Chart ${c}`,
          chart: {
            type: "Chart",
            variant: "line",
            categoryKey: "week",
            valueKeys: ["revenue"],
            data: Array.from({ length: LIMITS.chartPoints }, (_, i) => ({
              week: `W${i}`,
              revenue: i,
            })),
          },
        })),
        ...Array.from({ length: 2 }, () => ({
          type: "TableCard",
          title: "Breakdown",
          headers: Array.from({ length: 7 }, (_, i) => ({ text: `H${i}` })),
          rows: Array.from({ length: 40 }, () => ({
            type: "DataRow",
            cells: Array.from({ length: 7 }, () => ({ kind: "number", value: 1 })),
          })),
        })),
        noteCard(),
      ],
    };
    expect(validateWeaveDocument(doc(root))).toBeDefined();
  });
});

describe("unknown-key policy", () => {
  /**
   * Report the REASON, never "it threw".
   *
   * Stripping and rejecting are both silent from the caller's side unless the
   * assertion names the issue: an unknown key that is dropped produces a
   * *successful* parse, and an unknown key that is rejected produces an
   * `unrecognized_keys` issue. Naming the code is also what distinguishes "the
   * traversal budget refused this" from "Zod refused it after walking it all",
   * which is the whole point of the budget.
   */
  const rejection = (fn: () => unknown): string[] => {
    try {
      fn();
    } catch (err) {
      if (err instanceof z.ZodError) return [...new Set(err.issues.map((i) => i.code))];
      if (err instanceof WeaveDocumentError) return [`weave:${err.code}`];
      return [`unexpected:${(err as Error).name}`];
    }
    return ["accepted"];
  };

  it("rejects an unknown key on the root node rather than stripping it", () => {
    // Stripping is what made the bounded-document claim false: a key nobody
    // declared was walked, silently dropped, and never counted against a limit.
    expect(rejection(() => validateWeaveDocument(doc(noteCard({ onLoad: "alert(1)" }))))).toEqual([
      "unrecognized_keys",
    ]);
  });

  it("rejects an unknown key carrying a large scalar", () => {
    // Direct React has no payload guard by design, so on that path an unknown
    // string field was unbounded: 300 KB of it validated and returned clean.
    expect(
      rejection(() => validateWeaveDocument(doc(noteCard({ onLoad: "x".repeat(300_000) })))),
    ).toEqual(["unrecognized_keys"]);
  });

  it("rejects an unknown key on a node nested inside an organism", () => {
    expect(
      rejection(() =>
        validateWeaveDocument(
          doc({
            type: "MetricBand",
            items: [{ type: "KPI", label: "A", value: 1, onClick: "steal()" }],
          }),
        ),
      ),
    ).toEqual(["unrecognized_keys"]);
  });

  it("rejects an unknown key on a layout container", () => {
    expect(
      rejection(() =>
        validateWeaveDocument(doc({ type: "Stack", children: [noteCard()], onScroll: "x" })),
      ),
    ).toEqual(["unrecognized_keys"]);
  });

  it("rejects an unknown key on a bare nested object that is not a node", () => {
    // Table headers, cells and deltas carry no `type`, so "make the node
    // schemas strict" is not enough on its own — every nested input object has
    // to close.
    expect(
      rejection(() =>
        validateWeaveDocument(
          doc({
            type: "TableCard",
            title: "T",
            headers: [{ text: "H", href: "javascript:alert(1)" }],
            rows: [{ type: "DataRow", cells: [{ kind: "text", value: "x" }] }],
          }),
        ),
      ),
    ).toEqual(["unrecognized_keys"]);
  });

  it("rejects an unknown key on a KPI delta", () => {
    expect(
      rejection(() =>
        validateWeaveDocument(
          doc({
            type: "MetricBand",
            items: [{ type: "KPI", label: "A", value: 1, delta: { value: 0.1, onTap: "x" } }],
          }),
        ),
      ),
    ).toEqual(["unrecognized_keys"]);
  });

  it("rejects an unknown key on a table cell", () => {
    expect(
      rejection(() =>
        validateWeaveDocument(
          doc({
            type: "TableCard",
            title: "T",
            headers: [{ text: "H" }],
            rows: [{ type: "DataRow", cells: [{ kind: "text", value: "x", onClick: "x" }] }],
          }),
        ),
      ),
    ).toEqual(["unrecognized_keys"]);
  });

  it("refuses a huge unknown array BEFORE walking all of it", () => {
    // The reason matters more than the rejection here. Strict schemas alone
    // would reject this too — but only after the structural walk had visited
    // every element, which is the unbounded traversal the budget exists to
    // stop. `weave:values` is the walk refusing; `unrecognized_keys` would mean
    // it walked the lot first.
    expect(
      rejection(() =>
        validateWeaveDocument(doc(noteCard({ junk: new Array(LIMITS.values + 1).fill(0) }))),
      ),
    ).toEqual(["weave:values"]);
  });

  it("admits the largest legal document the other caps permit", () => {
    // Non-vacuity for the traversal budget. Sparkline cells carry 100 scalar
    // leaves per object, so a table of them is the values-maximising legal
    // shape: nine of them measure 2,954 objects / 260,816 values, just under
    // the `nodes` cap. A budget that refused this would be a bug, not a guard.
    const sparklineTable = () => ({
      type: "TableCard",
      title: "T",
      headers: Array.from({ length: LIMITS.tableHeaders }, (_, i) => ({ text: `H${i}` })),
      rows: Array.from({ length: LIMITS.tableRows }, () => ({
        type: "DataRow",
        cells: Array.from({ length: LIMITS.tableHeaders }, () => ({
          kind: "sparkline",
          data: Array.from({ length: LIMITS.sparklinePoints }, (_, i) => i),
        })),
      })),
    });
    const root = { type: "Stack", children: Array.from({ length: 9 }, sparklineTable) };
    expect(rejection(() => validateWeaveDocument(doc(root)))).toEqual(["accepted"]);
  });

  it("keeps chart data records open, because their keys are the caller's", () => {
    // The one permitted open shape. A chart series is named by the caller, so
    // its record cannot be a closed object — the constraint on it is that the
    // keys match what the chart declared, which is a different rule.
    expect(
      rejection(() =>
        validateWeaveDocument(
          doc({
            type: "ChartCard",
            title: "T",
            chart: {
              type: "Chart",
              variant: "bar",
              categoryKey: "region name",
              valueKeys: ["gross margin %"],
              data: [{ "region name": "EMEA", "gross margin %": 0.42 }],
            },
          }),
        ),
      ),
    ).toEqual(["accepted"]);
  });
});

describe("payload-size policy", () => {
  /**
   * Assert the REASON, never just the class.
   *
   * `parseWeaveDocumentJson` throws `WeaveDocumentError` for an oversized
   * payload AND for malformed JSON, so `.toThrow(WeaveDocumentError)` is
   * satisfied by either. Measured: with the UTF-8 check replaced by a
   * `raw.length` check, the multibyte case below sailed past the size guard and
   * then died in `JSON.parse` — the class-only assertion stayed green through a
   * sabotage of the very rule it exists to protect.
   */
  const rejectionCode = (raw: string): string => {
    try {
      parseWeaveDocumentJson(raw);
    } catch (err) {
      if (err instanceof WeaveDocumentError) return err.code;
      return `unexpected: ${(err as Error).name}`;
    }
    return "accepted";
  };

  it("rejects a raw payload larger than the cap before parsing it", () => {
    const oversized = `{"weave":1,"root":{"type":"NoteCard","body":"${"x".repeat(LIMITS.payloadBytes)}"}}`;
    expect(rejectionCode(oversized)).toBe("payload");
  });

  it("names payload as the reason", () => {
    expect(rejectionCode("x".repeat(LIMITS.payloadBytes + 1))).toBe("payload");
  });

  it("counts UTF-8 bytes, not UTF-16 code units", () => {
    // "€" is 1 UTF-16 code unit but 3 UTF-8 bytes, so a `.length` check would
    // admit three times the cap. The string is deliberately BELOW the cap in
    // code units and above it in bytes, and the assertion is on the code:
    // this same string is also invalid JSON, so "it threw" proves nothing.
    const filler = "€".repeat(LIMITS.payloadBytes / 2);
    expect(filler.length).toBeLessThan(LIMITS.payloadBytes);
    expect(new TextEncoder().encode(filler).length).toBeGreaterThan(LIMITS.payloadBytes);
    expect(rejectionCode(filler)).toBe("payload");
  });

  it("accepts and parses a document inside the cap", () => {
    const parsed = parseWeaveDocumentJson(JSON.stringify(doc(noteCard())));
    expect(parsed.root.type).toBe("NoteCard");
  });

  it("rejects malformed JSON without leaking a parser stack", () => {
    expect(rejectionCode("{not json")).toBe("malformed");
  });
});

describe("document-wide id uniqueness", () => {
  it("accepts distinct ids across the whole tree", () => {
    const parsed = validateWeaveDocument(
      doc({
        type: "Stack",
        id: "root",
        children: [noteCard({ id: "a" }), noteCard({ id: "b" })],
      }),
    );
    expect(parsed.root.id).toBe("root");
  });

  it("rejects the same id on two siblings", () => {
    expect(() =>
      validateWeaveDocument(
        doc({ type: "Stack", children: [noteCard({ id: "dup" }), noteCard({ id: "dup" })] }),
      ),
    ).toThrow(z.ZodError);
  });

  it("rejects an id reused at a different depth", () => {
    expect(() =>
      validateWeaveDocument(
        doc({
          type: "Stack",
          id: "dup",
          children: [{ type: "Grid", children: [noteCard({ id: "dup" })] }],
        }),
      ),
    ).toThrow(z.ZodError);
  });

  it("rejects an id reused on a table row", () => {
    // Rows are not Spec nodes, but they carry ids and share the namespace.
    expect(() =>
      validateWeaveDocument(
        doc({
          type: "TableCard",
          id: "dup",
          title: "T",
          headers: [{ text: "H" }],
          rows: [{ type: "DataRow", id: "dup", cells: [{ kind: "text", value: "x" }] }],
        }),
      ),
    ).toThrow(z.ZodError);
  });

  it("names the duplicated id in the error", () => {
    const result = WeaveDocumentV1Schema.safeParse(
      doc({ type: "Stack", children: [noteCard({ id: "twice" }), noteCard({ id: "twice" })] }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(JSON.stringify(result.error.issues)).toContain("twice");
  });

  it("accepts a document with no ids at all", () => {
    expect(validateWeaveDocument(doc({ type: "Stack", children: [noteCard()] }))).toBeDefined();
  });
});

describe("cross-field table rules", () => {
  const tableRoot = (headerCount: number, cellCount: number) => ({
    type: "TableCard",
    title: "T",
    headers: Array.from({ length: headerCount }, (_, i) => ({ text: `H${i}` })),
    rows: [
      {
        type: "DataRow",
        cells: Array.from({ length: cellCount }, () => ({ kind: "text", value: "x" })),
      },
    ],
  });

  it("rejects a row with more cells than headers", () => {
    expect(() => validateWeaveDocument(doc(tableRoot(2, 3)))).toThrow(z.ZodError);
  });

  it("rejects a row with fewer cells than headers", () => {
    expect(() => validateWeaveDocument(doc(tableRoot(3, 2)))).toThrow(z.ZodError);
  });

  it("accepts exactly one cell per header", () => {
    expect(validateWeaveDocument(doc(tableRoot(3, 3)))).toBeDefined();
  });

  it("points the issue at the offending row", () => {
    const result = WeaveDocumentV1Schema.safeParse(doc(tableRoot(3, 2)));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["root", "rows", 0, "cells"]);
  });

  it("catches a ragged table nested inside a layout", () => {
    expect(() =>
      validateWeaveDocument(doc({ type: "Stack", children: [tableRoot(3, 2)] })),
    ).toThrow(z.ZodError);
  });
});

describe("cross-field chart rules", () => {
  const chartCard = (chart: Record<string, unknown>) => ({
    type: "ChartCard",
    title: "T",
    chart: { type: "Chart", variant: "line", ...chart },
  });

  it("rejects a data key that is neither the category nor a declared series", () => {
    // An undeclared key is payload the chart will never plot, so it has no
    // legitimate reason to be in the document.
    expect(() =>
      validateWeaveDocument(
        doc(
          chartCard({
            data: [{ week: "W1", revenue: 1, smuggled: "arbitrary" }],
            categoryKey: "week",
            valueKeys: ["revenue"],
          }),
        ),
      ),
    ).toThrow(z.ZodError);
  });

  it("accepts data whose keys are exactly the declared fields", () => {
    expect(
      validateWeaveDocument(
        doc(
          chartCard({
            data: [{ week: "W1", revenue: 1 }],
            categoryKey: "week",
            valueKeys: ["revenue"],
          }),
        ),
      ),
    ).toBeDefined();
  });

  it("leaves data unconstrained when the chart declares no fields", () => {
    expect(validateWeaveDocument(doc(chartCard({ data: [{ anything: 1 }] })))).toBeDefined();
  });

  it("catches an undeclared key on a chart nested inside a layout", () => {
    expect(() =>
      validateWeaveDocument(
        doc({
          type: "Stack",
          children: [chartCard({ data: [{ a: 1, b: 2 }], categoryKey: "a", valueKeys: [] })],
        }),
      ),
    ).toThrow(z.ZodError);
  });
});

describe("the legacy adapter", () => {
  it("wraps a valid bare spec into a v1 document", () => {
    const document = legacySpecToDocumentV1({ type: "Stack", children: [noteCard()] });
    expect(document.weave).toBe(1);
    expect(document.root.type).toBe("Stack");
  });

  it("returns a document that is already canonically valid", () => {
    const document = legacySpecToDocumentV1(noteCard());
    expect(validateWeaveDocument(document)).toEqual(document);
  });

  it("rejects a legacy spec whose root is an atom", () => {
    // Do not silently reinterpret: wrapping is not repairing. A bare Label was
    // accepted by the old SpecSchema and is not a document.
    expect(() => legacySpecToDocumentV1({ type: "Label", text: "hi" })).toThrow(z.ZodError);
  });

  it("rejects a legacy bare DataRow", () => {
    expect(() => legacySpecToDocumentV1({ type: "DataRow", cells: [] })).toThrow(z.ZodError);
  });

  it("rejects a malformed legacy node rather than coercing it", () => {
    expect(() => legacySpecToDocumentV1({ type: "NoteCard" })).toThrow(z.ZodError);
  });

  it("refuses to double-wrap a document that is already v1", () => {
    // Wrapping a document as if it were a spec would produce {root:{weave:1,…}},
    // which is not a root at all. Saying so beats a discriminator error about
    // a shape the caller never intended to build.
    expect(() => legacySpecToDocumentV1(doc(noteCard()))).toThrow(WeaveDocumentError);
  });

  it("applies the same limits as the canonical path", () => {
    expect(() => legacySpecToDocumentV1(nestedContainers(LIMITS.depth + 1))).toThrow(
      WeaveDocumentError,
    );
  });
});
