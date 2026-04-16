import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Weave } from "../renderer/Weave.js";

describe("Weave renderer", () => {
  it("renders a single KPI spec without throwing", () => {
    render(
      <Weave
        spec={{
          type: "KPI",
          label: "Active campaigns",
          value: 12,
          size: "xl",
          caption: "3 awaiting approval",
        }}
      />,
    );
    expect(screen.getByText("Active campaigns")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3 awaiting approval")).toBeInTheDocument();
  });

  it("renders a MetricBand of KPIs inside a Stack", () => {
    render(
      <Weave
        spec={{
          type: "Stack",
          gap: "md",
          children: [
            {
              type: "MetricBand",
              items: [
                {
                  type: "KPI",
                  label: "Revenue",
                  value: 248500,
                  format: "currency",
                  currency: "USD",
                  size: "xl",
                },
                {
                  type: "KPI",
                  label: "Conversion rate",
                  value: 0.034,
                  format: "percent",
                  precision: 1,
                  size: "lg",
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Conversion rate")).toBeInTheDocument();
  });

  it("renders a TableCard with typed cells", () => {
    render(
      <Weave
        spec={{
          type: "TableCard",
          title: "Per-campaign breakdown",
          headers: [
            { text: "Campaign", align: "start" },
            { text: "Spend", align: "end" },
          ],
          rows: [
            {
              type: "DataRow",
              cells: [
                { kind: "text", value: "Campaign A" },
                { kind: "number", value: 34000, format: "currency", currency: "USD" },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Per-campaign breakdown")).toBeInTheDocument();
    expect(screen.getByText("Campaign A")).toBeInTheDocument();
  });

  it("renders a NoteCard with markdown-style bold", () => {
    render(
      <Weave
        spec={{
          type: "NoteCard",
          title: "Take",
          body: "Revenue is **up 14%** QoQ.",
          tone: "info",
        }}
      />,
    );
    expect(screen.getByText("Take")).toBeInTheDocument();
    expect(screen.getByText("up 14%")).toBeInTheDocument();
  });

  it("throws a ZodError on invalid spec", () => {
    expect(() =>
      render(
        <Weave
          spec={{
            type: "KPI",
            label: "bad",
            value: "not-a-number",
          }}
        />,
      ),
    ).toThrow();
  });
});
