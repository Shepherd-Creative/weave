import { describe, expect, it } from "vitest";
import {
  ChartSchema,
  DataRowSchema,
  KPISchema,
  LIMITS,
  NoteCardSchema,
  NumberSchema,
  SpecSchema,
  StackSchema,
  TableCardSchema,
} from "../schemas/index.js";

/**
 * Wave 1 task 5: every array, string and numeric field a generated document
 * can grow on is bounded, and every bound is a measured one.
 *
 * The numbers are written as LITERALS here on purpose. A test that imports the
 * constant it is checking passes for any value of that constant, including a
 * wrong one — it pins the code to itself rather than to the contract. The one
 * test that reads LIMITS is the cross-check at the bottom, which exists to
 * catch the constants and these literals drifting apart.
 *
 * Evidence for each number: packages/weave-primitives/bench/document-limits.bench.mjs,
 * recorded in docs/specs/weave-document-v1.md.
 */

const kpi = (over: Record<string, unknown> = {}) => ({
  type: "KPI",
  label: "Revenue",
  value: 1,
  ...over,
});

const chart = (over: Record<string, unknown> = {}) => ({
  type: "Chart",
  variant: "line",
  data: [],
  ...over,
});

const table = (headerCount: number, cellCount: number, rowCount = 1) => ({
  type: "TableCard",
  title: "Breakdown",
  headers: Array.from({ length: headerCount }, (_, i) => ({ text: `H${i}` })),
  rows: Array.from({ length: rowCount }, () => ({
    type: "DataRow",
    cells: Array.from({ length: cellCount }, () => ({ kind: "text", value: "x" })),
  })),
});

describe("non-finite numbers", () => {
  // JSON cannot carry Infinity, but the direct <Weave> path takes in-memory
  // objects, where it renders as the string "Infinity" in every numeric slot.
  it("rejects Infinity as a KPI value", () => {
    expect(() => KPISchema.parse(kpi({ value: Number.POSITIVE_INFINITY }))).toThrow();
  });

  it("rejects -Infinity as a Number value", () => {
    expect(() => NumberSchema.parse({ type: "Number", value: Number.NEGATIVE_INFINITY })).toThrow();
  });

  it("rejects NaN as a KPI value", () => {
    expect(() => KPISchema.parse(kpi({ value: Number.NaN }))).toThrow();
  });

  it("rejects Infinity inside a delta", () => {
    expect(() => KPISchema.parse(kpi({ delta: { value: Number.POSITIVE_INFINITY } }))).toThrow();
  });

  it("rejects Infinity inside chart data", () => {
    expect(() =>
      ChartSchema.parse(chart({ data: [{ revenue: Number.POSITIVE_INFINITY }] })),
    ).toThrow();
  });

  it("rejects Infinity inside a sparkline", () => {
    expect(() =>
      DataRowSchema.parse({
        type: "DataRow",
        cells: [{ kind: "sparkline", data: [1, Number.POSITIVE_INFINITY] }],
      }),
    ).toThrow();
  });

  it("still accepts ordinary finite values", () => {
    expect(KPISchema.parse(kpi({ value: -12.5 })).value).toBe(-12.5);
  });
});

describe("bounded strings", () => {
  it("rejects a label longer than 200 characters", () => {
    expect(() => KPISchema.parse(kpi({ label: "x".repeat(201) }))).toThrow();
  });

  it("accepts a label at exactly 200 characters", () => {
    expect(KPISchema.parse(kpi({ label: "x".repeat(200) })).label).toHaveLength(200);
  });

  it("rejects a NoteCard body longer than 4000 characters", () => {
    expect(() => NoteCardSchema.parse({ type: "NoteCard", body: "x".repeat(4001) })).toThrow();
  });

  it("accepts a NoteCard body at exactly 4000 characters", () => {
    const parsed = NoteCardSchema.parse({ type: "NoteCard", body: "x".repeat(4000) });
    expect(parsed.body).toHaveLength(4000);
  });

  it("rejects an unbounded locale string", () => {
    expect(() =>
      NumberSchema.parse({ type: "Number", value: 1, locale: "x".repeat(100_000) }),
    ).toThrow();
  });

  it("rejects an over-long table cell value", () => {
    expect(() =>
      DataRowSchema.parse({
        type: "DataRow",
        cells: [{ kind: "text", value: "x".repeat(201) }],
      }),
    ).toThrow();
  });
});

describe("bounded chart data", () => {
  const points = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ week: `W${i}`, revenue: i }));

  it("rejects more than 200 data points", () => {
    expect(() =>
      ChartSchema.parse(chart({ data: points(201), categoryKey: "week", valueKeys: ["revenue"] })),
    ).toThrow();
  });

  it("accepts exactly 200 data points", () => {
    const parsed = ChartSchema.parse(
      chart({ data: points(200), categoryKey: "week", valueKeys: ["revenue"] }),
    );
    expect(parsed.data).toHaveLength(200);
  });

  it("rejects more than 8 series", () => {
    expect(() =>
      ChartSchema.parse(chart({ valueKeys: Array.from({ length: 9 }, (_, i) => `s${i}`) })),
    ).toThrow();
  });

  it("rejects more than 8 series tones", () => {
    expect(() =>
      ChartSchema.parse(chart({ seriesTones: Array.from({ length: 9 }, () => "default") })),
    ).toThrow();
  });

  it("rejects a record carrying more keys than one category plus 8 series", () => {
    const wide = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, i]));
    expect(() => ChartSchema.parse(chart({ data: [wide] }))).toThrow();
  });

  // Whether those keys are the ones the chart DECLARED is a cross-field rule,
  // enforced by the canonical validator — see document.test.ts.

  it("accepts data whose keys are exactly the declared fields", () => {
    const parsed = ChartSchema.parse(
      chart({
        data: [{ week: "W1", revenue: 1 }],
        categoryKey: "week",
        valueKeys: ["revenue"],
      }),
    );
    expect(parsed.data).toHaveLength(1);
  });

  it("rejects an over-long data key", () => {
    expect(() => ChartSchema.parse(chart({ data: [{ ["k".repeat(65)]: 1 }] }))).toThrow();
  });

  it("rejects an over-long data string value", () => {
    expect(() => ChartSchema.parse(chart({ data: [{ week: "x".repeat(201) }] }))).toThrow();
  });
});

describe("bounded sparklines", () => {
  it("rejects more than 100 sparkline points in a table cell", () => {
    expect(() =>
      DataRowSchema.parse({
        type: "DataRow",
        cells: [{ kind: "sparkline", data: Array.from({ length: 101 }, (_, i) => i) }],
      }),
    ).toThrow();
  });

  it("rejects more than 100 sparkline points on a KPI", () => {
    expect(() =>
      KPISchema.parse(kpi({ sparkline: { data: Array.from({ length: 101 }, (_, i) => i) } })),
    ).toThrow();
  });
});

describe("table cardinality", () => {
  it("rejects a table with no headers", () => {
    expect(() => TableCardSchema.parse(table(0, 0, 0))).toThrow();
  });

  it("rejects a table with more than 7 headers", () => {
    expect(() => TableCardSchema.parse(table(8, 8))).toThrow();
  });

  it("accepts a table with exactly 7 headers", () => {
    expect(TableCardSchema.parse(table(7, 7)).headers).toHaveLength(7);
  });

  it("rejects a row with more cells than a table may have columns", () => {
    expect(() => TableCardSchema.parse(table(7, 8))).toThrow();
  });

  // "Exactly one cell per header" is a cross-field rule Zod cannot express on
  // a discriminatedUnion member — enforced by the canonical validator, see
  // document.test.ts.

  it("rejects more than 40 rows", () => {
    expect(() => TableCardSchema.parse(table(2, 2, 41))).toThrow();
  });

  it("accepts exactly 40 rows", () => {
    expect(TableCardSchema.parse(table(2, 2, 40)).rows).toHaveLength(40);
  });
});

describe("bounded layout children", () => {
  const children = (n: number) =>
    Array.from({ length: n }, () => ({ type: "NoteCard", body: "n" }));

  it("rejects more than 12 children in one container", () => {
    expect(() => StackSchema.parse({ type: "Stack", children: children(13) })).toThrow();
  });

  it("accepts exactly 12 children", () => {
    expect(StackSchema.parse({ type: "Stack", children: children(12) }).children).toHaveLength(12);
  });
});

describe("DataRow is table-internal, not a Spec union member", () => {
  it("rejects a bare DataRow as a Spec", () => {
    // F2: the renderer could otherwise emit a <tr> with no enclosing <table>.
    expect(() => SpecSchema.parse({ type: "DataRow", cells: [] })).toThrow();
  });

  it("rejects a DataRow as a layout child", () => {
    expect(() =>
      SpecSchema.parse({
        type: "Stack",
        children: [{ type: "DataRow", cells: [{ kind: "text", value: "x" }] }],
      }),
    ).toThrow();
  });

  it("still accepts DataRow inside a TableCard", () => {
    expect(TableCardSchema.parse(table(2, 2)).rows).toHaveLength(1);
  });
});

describe("LIMITS matches the literals asserted above", () => {
  // The only test that reads the constants. It exists so the numbers in this
  // file and the numbers the schemas enforce cannot drift apart silently.
  it("exposes the measured caps", () => {
    expect(LIMITS).toMatchObject({
      text: 200,
      body: 4000,
      chartPoints: 200,
      chartSeries: 8,
      chartKeyText: 64,
      sparklinePoints: 100,
      tableHeaders: 7,
      tableRows: 40,
      layoutChildren: 12,
      metricBandItems: 8,
    });
  });
});
