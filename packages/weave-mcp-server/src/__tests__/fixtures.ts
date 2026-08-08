/**
 * Shared test fixtures. A plain module rather than a test file, because
 * importing one test file from another re-registers its `describe` blocks in
 * the importer and every suite runs twice.
 */

/**
 * Arguments that are valid for each fixed-organism tool and complete: every
 * required field present, nothing undeclared. Adding `type` is the ONLY thing
 * that makes any of them illegal.
 *
 * That is the whole point of the fixtures. The tests these replace used
 * payloads that were independently invalid — a NoteCard carrying `children`,
 * a MetricBand carrying `body` — so their rejections proved nothing about the
 * `type` key: erase the discriminator entirely and they still fail on a
 * missing required field. A guard that cannot tell the difference between the
 * fault it exists for and an unrelated fault is not a guard.
 */
export const VALID_FIXED_TOOL_ARGS: Record<string, Record<string, unknown>> = {
  render_metric_band: { items: [{ type: "KPI", label: "Revenue", value: 100 }] },
  render_chart_card: {
    title: "T",
    chart: {
      type: "Chart",
      variant: "line",
      categoryKey: "week",
      valueKeys: ["revenue"],
      data: [{ week: "W1", revenue: 1 }],
    },
  },
  render_table_card: {
    title: "T",
    headers: [{ text: "A" }],
    rows: [{ type: "DataRow", cells: [{ kind: "text", value: "x" }] }],
  },
  render_note_card: { body: "ok" },
};

/** The root type each fixed tool stamps — i.e. the `type` a caller might redundantly send. */
export const FIXED_TOOL_TYPES: Record<string, string> = {
  render_metric_band: "MetricBand",
  render_chart_card: "ChartCard",
  render_table_card: "TableCard",
  render_note_card: "NoteCard",
};
