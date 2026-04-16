import { describe, expect, it } from "vitest";
import {
  ChartCardSchema,
  DataRowSchema,
  KPISchema,
  MetricBandSchema,
  NoteCardSchema,
  SpecSchema,
  StackSchema,
  TableCardSchema,
} from "../schemas/index.js";

// Canonical examples from dashboard-composition-skill.md §7.

describe("KPISchema", () => {
  it("accepts a valid KPI with delta", () => {
    const parsed = KPISchema.parse({
      type: "KPI",
      label: "Revenue",
      value: 248500,
      format: "currency",
      currency: "USD",
      size: "xl",
      delta: { value: 0.142, format: "percent", tone: "positive", showSign: true },
    });
    expect(parsed.label).toBe("Revenue");
    expect(parsed.delta?.tone).toBe("positive");
  });

  it("rejects size outside lg|xl", () => {
    expect(() =>
      KPISchema.parse({ type: "KPI", label: "x", value: 1, size: "sm" }),
    ).toThrow();
  });

  it("rejects wrong type literal", () => {
    expect(() =>
      KPISchema.parse({ type: "Stat", label: "x", value: 1 }),
    ).toThrow();
  });
});

describe("MetricBandSchema", () => {
  it("accepts 3 KPIs", () => {
    const parsed = MetricBandSchema.parse({
      type: "MetricBand",
      items: [
        { type: "KPI", label: "A", value: 1, size: "lg" },
        { type: "KPI", label: "B", value: 2, size: "lg" },
        { type: "KPI", label: "C", value: 3, size: "lg" },
      ],
    });
    expect(parsed.items).toHaveLength(3);
  });

  it("rejects empty items", () => {
    expect(() => MetricBandSchema.parse({ type: "MetricBand", items: [] })).toThrow();
  });

  it("rejects more than 8 items", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({
      type: "KPI" as const,
      label: `K${i}`,
      value: i,
    }));
    expect(() => MetricBandSchema.parse({ type: "MetricBand", items })).toThrow();
  });
});

describe("ChartCardSchema", () => {
  it("accepts a full ChartCard from SKILL.md §7.1", () => {
    const parsed = ChartCardSchema.parse({
      type: "ChartCard",
      title: "Revenue by week",
      caption: "Up 14% QoQ; dip week 9 tracked to holiday shift",
      chart: {
        type: "Chart",
        variant: "line",
        data: [
          { week: "W1", revenue: 48000 },
          { week: "W2", revenue: 52000 },
        ],
        categoryKey: "week",
        valueKeys: ["revenue"],
        height: "md",
      },
    });
    expect(parsed.chart.variant).toBe("line");
  });

  it("rejects a ChartCard without title", () => {
    expect(() =>
      ChartCardSchema.parse({
        type: "ChartCard",
        chart: { type: "Chart", variant: "line", data: [] },
      }),
    ).toThrow();
  });
});

describe("TableCardSchema", () => {
  it("accepts the §7.2 TableCard with typed cells", () => {
    const parsed = TableCardSchema.parse({
      type: "TableCard",
      title: "Per-campaign breakdown",
      headers: [
        { text: "Campaign", align: "start" },
        { text: "Spend", align: "end" },
        { text: "ROAS", align: "end" },
        { text: "Δ WoW", align: "end" },
      ],
      rows: [
        {
          type: "DataRow",
          cells: [
            { kind: "text", value: "Campaign A" },
            { kind: "number", value: 34000, format: "currency", currency: "USD" },
            { kind: "number", value: 4.18, format: "decimal", precision: 2 },
            { kind: "delta", value: 0.08, format: "percent", tone: "positive" },
          ],
        },
      ],
    });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.cells).toHaveLength(4);
  });
});

describe("DataRowSchema", () => {
  it("accepts a sparkline cell", () => {
    const parsed = DataRowSchema.parse({
      type: "DataRow",
      cells: [{ kind: "sparkline", data: [1, 2, 3], variant: "line" }],
    });
    expect(parsed.cells[0]?.kind).toBe("sparkline");
  });

  it("rejects an unknown cell kind", () => {
    expect(() =>
      DataRowSchema.parse({
        type: "DataRow",
        cells: [{ kind: "mystery", value: "nope" }],
      }),
    ).toThrow();
  });
});

describe("NoteCardSchema", () => {
  it("accepts a note with tone=info", () => {
    const parsed = NoteCardSchema.parse({
      type: "NoteCard",
      title: "Heads up",
      body: "Week 9 data is partial.",
      tone: "info",
    });
    expect(parsed.tone).toBe("info");
  });

  it("rejects tone outside the allowed 4", () => {
    expect(() =>
      NoteCardSchema.parse({
        type: "NoteCard",
        body: "x",
        tone: "positive",
      }),
    ).toThrow();
  });
});

describe("SpecSchema (recursive)", () => {
  it("accepts a Stack containing a MetricBand and a Grid of ChartCards", () => {
    const parsed = SpecSchema.parse({
      type: "Stack",
      gap: "md",
      children: [
        {
          type: "MetricBand",
          items: [
            {
              type: "KPI",
              label: "Revenue",
              value: 100,
              size: "xl",
            },
          ],
        },
        {
          type: "Grid",
          cols: 2,
          children: [
            {
              type: "ChartCard",
              title: "A",
              chart: { type: "Chart", variant: "line", data: [] },
            },
            {
              type: "ChartCard",
              title: "B",
              chart: { type: "Chart", variant: "bar", data: [] },
            },
          ],
        },
      ],
    });
    expect(parsed.type).toBe("Stack");
  });

  it("rejects a Grid with invalid cols", () => {
    expect(() =>
      StackSchema.parse({
        type: "Stack",
        children: [
          {
            type: "Grid",
            cols: 5, // invalid — 1 | 2 | 3 | 4 | "auto" only
            children: [],
          },
        ],
      }),
    ).toThrow();
  });
});
