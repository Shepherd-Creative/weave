import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Weave } from "../renderer/Weave.js";
import { LIMITS, WeaveDocumentError } from "../schemas/index.js";

describe("Weave renderer", () => {
  it("renders a standalone headline KPI wrapped in a Stack", () => {
    // A lone KPI is still the right answer to a single-scalar question
    // (the composition skill's §5.3), but a document is rooted in a layout
    // or an organism, so
    // the KPI travels inside a one-child Stack. `size: "xl"` stays legal:
    // that skill's §6 forbids it only in a container WITH siblings.
    render(
      <Weave
        spec={{
          type: "Stack",
          children: [
            {
              type: "KPI",
              label: "Active campaigns",
              value: 12,
              size: "xl",
              caption: "3 awaiting approval",
            },
          ],
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
            type: "Stack",
            children: [{ type: "KPI", label: "bad", value: "not-a-number" }],
          }}
        />,
      ),
    ).toThrow(z.ZodError);
  });
});

/**
 * "A renderer must not assume a transport protected it" (Wave 1 task 7). Every
 * rule below is proved here against React directly, with no transport in the
 * picture — the same rules the REST, MCP JSON-RPC and MCP App tests prove on
 * their own surfaces.
 */
describe("Weave document API", () => {
  const document = (root: unknown) => ({ weave: 1 as const, root });

  it("renders a canonical document", () => {
    render(<Weave document={document({ type: "NoteCard", body: "From a document." })} />);
    expect(screen.getByText("From a document.")).toBeInTheDocument();
  });

  it("renders the same output through the document and legacy props", () => {
    const root = { type: "NoteCard", title: "Take", body: "Same either way." };
    const viaDocument = render(<Weave document={document(root)} />).container.innerHTML;
    const viaSpec = render(<Weave spec={root} />).container.innerHTML;
    expect(viaSpec).toBe(viaDocument);
  });

  it("requires exactly one of document and spec", () => {
    // @ts-expect-error — neither prop supplied; the runtime guard is the point
    expect(() => render(<Weave />)).toThrow(WeaveDocumentError);
  });

  it("rejects an atom root arriving through the legacy prop", () => {
    // The adapter wraps; it does not repair. A bare Label was legal before
    // Wave 1 and is not a document.
    expect(() => render(<Weave spec={{ type: "Label", text: "hi" }} />)).toThrow(z.ZodError);
  });

  it("rejects a bare DataRow, which would render a <tr> with no table (F2)", () => {
    expect(() =>
      render(<Weave spec={{ type: "DataRow", cells: [{ kind: "text", value: "x" }] }} />),
    ).toThrow(z.ZodError);
  });

  it("enforces the container depth cap with no transport involved", () => {
    let root: unknown = { type: "NoteCard", body: "leaf" };
    for (let i = 0; i < 7; i++) root = { type: "Grid", cols: 1, children: [root] };
    expect(() => render(<Weave document={document(root)} />)).toThrow(WeaveDocumentError);
  });

  it("enforces the node-count cap with no transport involved", () => {
    const table = {
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
        children: Array.from({ length: 12 }, () => table),
      })),
    };
    expect(() => render(<Weave document={document(root)} />)).toThrow(WeaveDocumentError);
  });

  it("rejects a ragged table before it can render a short row", () => {
    expect(() =>
      render(
        <Weave
          document={document({
            type: "TableCard",
            title: "T",
            headers: [{ text: "A" }, { text: "B" }, { text: "C" }],
            rows: [{ type: "DataRow", cells: [{ kind: "text", value: "only one" }] }],
          })}
        />,
      ),
    ).toThrow(z.ZodError);
  });

  it("rejects duplicate node ids", () => {
    expect(() =>
      render(
        <Weave
          document={document({
            type: "Stack",
            children: [
              { type: "NoteCard", id: "dup", body: "a" },
              { type: "NoteCard", id: "dup", body: "b" },
            ],
          })}
        />,
      ),
    ).toThrow(z.ZodError);
  });

  it("rejects a large unknown scalar field with no transport involved", () => {
    // The direct React path has no payload guard by design, so an undeclared
    // field was the one place a document could carry unbounded content: 300 KB
    // on a NoteCard validated clean and was silently dropped.
    expect(() =>
      render(
        <Weave
          document={document({
            type: "NoteCard",
            body: "ok",
            onLoad: "x".repeat(300_000),
          })}
        />,
      ),
    ).toThrow(z.ZodError);
  });

  it("refuses a large unknown array before walking all of it", () => {
    // WeaveDocumentError, not ZodError: the traversal budget has to refuse this
    // during the structural walk. A ZodError here would mean the walk visited
    // every element first and only then discovered the key was undeclared.
    let thrown: unknown;
    try {
      render(
        <Weave
          document={document({
            type: "NoteCard",
            body: "ok",
            junk: new Array(LIMITS.values + 1).fill(0),
          })}
        />,
      );
    } catch (err) {
      thrown = err;
    }
    expect((thrown as WeaveDocumentError)?.code).toBe("values");
  });

  it("rejects a non-finite value that no transport could have carried", () => {
    // JSON cannot express Infinity, so this path is reachable ONLY in-memory.
    expect(() =>
      render(
        <Weave
          document={document({
            type: "MetricBand",
            items: [{ type: "KPI", label: "x", value: Number.POSITIVE_INFINITY }],
          })}
        />,
      ),
    ).toThrow(z.ZodError);
  });
});
