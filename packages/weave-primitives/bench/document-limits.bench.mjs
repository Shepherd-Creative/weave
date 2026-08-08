/**
 * Scaling benchmark behind the WeaveDocumentV1 limits.
 *
 * Wave 1 task 5 requires the bounds to be "set after benchmark tests, not
 * intuition". This measures how validation cost and payload size scale along
 * every axis a generated document can grow on, so `LIMITS` in
 * src/schemas/bounds.ts can cite a number instead of a hunch.
 *
 *   node packages/weave-primitives/bench/document-limits.bench.mjs
 *
 * ## Why it builds its own schemas
 *
 * The whole point is to measure what happens PAST each cap — that is the
 * evidence for where the cap belongs. Run against the shipped schemas, every
 * over-cap row would short-circuit into a rejection and time nothing. So the
 * shapes below are unbounded mirrors of the real ones: same field types, same
 * nesting, no `.max()`. Bounding an axis does not change how it scales, it only
 * decides where to stop, which makes the unbounded mirror the right subject.
 *
 * The last two sections are the exception and use the REAL shipped validator,
 * because those documents are meant to be legal and the question is whether
 * the caps actually admit them.
 *
 * Numbers are machine-specific. Re-run and re-record in
 * docs/specs/weave-document-v1.md if the limits are ever revisited.
 */

import path from "node:path";
import { z } from "zod";

const REPEATS = 9;
const WARMUP = 3;

/**
 * Median wall-clock ms of `fn`.
 *
 * Median rather than mean because GC lands on individual samples, and a warm-up
 * because the first parse of a shape pays JIT cost that the caps have no
 * opinion about — without it a mid-table row can read 5× its neighbours and
 * invert the very ordering the numbers are being read for.
 */
function timeMs(fn) {
  for (let i = 0; i < WARMUP; i++) fn();
  const samples = [];
  for (let i = 0; i < REPEATS; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

function report(title, rows) {
  console.log(`\n### ${title}`);
  console.log("| n | parse ms | payload bytes |");
  console.log("|---|---|---|");
  for (const { n, ms, size } of rows) {
    console.log(`| ${n} | ${ms.toFixed(3)} | ${size.toLocaleString("en-US")} |`);
  }
}

// --- unbounded mirrors of the shipped shapes ---------------------------

const Tone = z.enum(["default", "muted", "positive", "negative", "warning", "info"]);
const NumberFormat = z.enum(["int", "decimal", "currency", "percent", "compact"]);

const UnboundedChart = z.object({
  type: z.literal("Chart"),
  variant: z.enum(["line", "bar", "horizontal-bar", "area", "pie", "donut"]),
  data: z.array(z.record(z.string(), z.union([z.number(), z.string()]))),
  categoryKey: z.string().optional(),
  valueKeys: z.array(z.string()).optional(),
});

const UnboundedCell = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string(), tone: Tone.optional() }),
  z.object({
    kind: z.literal("number"),
    value: z.number(),
    format: NumberFormat.optional(),
    precision: z.number().int().optional(),
    currency: z.string().optional(),
  }),
  z.object({
    kind: z.literal("delta"),
    value: z.number(),
    format: z.enum(["percent", "int"]).optional(),
    tone: Tone.optional(),
  }),
  z.object({ kind: z.literal("sparkline"), data: z.array(z.number()) }),
]);

const UnboundedRow = z.object({
  type: z.literal("DataRow"),
  cells: z.array(UnboundedCell),
});

const UnboundedTable = z.object({
  type: z.literal("TableCard"),
  title: z.string(),
  headers: z.array(
    z.object({ text: z.string(), align: z.enum(["start", "center", "end"]).optional() }),
  ),
  rows: z.array(UnboundedRow),
});

const UnboundedNote = z.object({
  type: z.literal("NoteCard"),
  title: z.string().optional(),
  body: z.string(),
  tone: z.enum(["default", "info", "warning", "muted"]).optional(),
});

const UnboundedKpi = z.object({
  type: z.literal("KPI"),
  label: z.string(),
  value: z.number(),
  format: NumberFormat.optional(),
  size: z.enum(["lg", "xl"]).optional(),
  tone: Tone.optional(),
});

const UnboundedMetricBand = z.object({
  type: z.literal("MetricBand"),
  items: z.array(UnboundedKpi),
});

const UnboundedChartCard = z.object({
  type: z.literal("ChartCard"),
  title: z.string(),
  caption: z.string().optional(),
  chart: UnboundedChart,
});

/**
 * Recursive layout union, discriminated exactly as the shipped one is.
 *
 * The union is built ONCE and cached. A `z.lazy(() => z.discriminatedUnion(…))`
 * whose body constructs the union inline rebuilds it on every child parse, and
 * that construction cost then dominates the measurement it is supposed to be
 * making — measured here at roughly 7× on a 5,000-node tree.
 */
let unionCache;
const UnboundedSpec = z.lazy(
  () =>
    (unionCache ??= z.discriminatedUnion("type", [
      UnboundedNote,
      UnboundedTable,
      UnboundedChart,
      UnboundedChartCard,
      UnboundedMetricBand,
      UnboundedKpi,
      z.object({
        type: z.literal("Grid"),
        cols: z
          .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal("auto")])
          .optional(),
        gap: z.enum(["sm", "md", "lg"]).optional(),
        children: z.array(UnboundedSpec),
      }),
      z.object({
        type: z.literal("Stack"),
        gap: z.enum(["sm", "md", "lg"]).optional(),
        children: z.array(UnboundedSpec),
      }),
    ])),
);

// --- axis: chart data points ------------------------------------------

const chartWithPoints = (n) => ({
  type: "Chart",
  variant: "line",
  categoryKey: "week",
  valueKeys: ["revenue"],
  data: Array.from({ length: n }, (_, i) => ({ week: `W${i}`, revenue: i * 1000 })),
});

report(
  "Chart data points (1 series)",
  [10, 50, 100, 200, 500, 1000, 5000].map((n) => {
    const spec = chartWithPoints(n);
    return { n, ms: timeMs(() => UnboundedChart.parse(spec)), size: bytes(spec) };
  }),
);

// --- axis: chart series (keys per record) ------------------------------

const chartWithSeries = (series, points = 100) => ({
  type: "Chart",
  variant: "line",
  categoryKey: "week",
  valueKeys: Array.from({ length: series }, (_, s) => `s${s}`),
  data: Array.from({ length: points }, (_, i) => {
    const row = { week: `W${i}` };
    for (let s = 0; s < series; s++) row[`s${s}`] = i * s;
    return row;
  }),
});

report(
  "Chart series at 100 points",
  [1, 4, 8, 16, 32, 64].map((n) => {
    const spec = chartWithSeries(n);
    return { n, ms: timeMs(() => UnboundedChart.parse(spec)), size: bytes(spec) };
  }),
);

// --- axis: table rows (4 cells each) -----------------------------------

const tableWithRows = (n) => ({
  type: "TableCard",
  title: "Breakdown",
  headers: [
    { text: "Account", align: "start" },
    { text: "Spend", align: "end" },
    { text: "ROAS", align: "end" },
    { text: "Δ WoW", align: "end" },
  ],
  rows: Array.from({ length: n }, (_, i) => ({
    type: "DataRow",
    cells: [
      { kind: "text", value: `Account ${i}` },
      { kind: "number", value: i * 1000, format: "currency", currency: "USD" },
      { kind: "number", value: 4.18, format: "decimal", precision: 2 },
      { kind: "delta", value: 0.08, format: "percent", tone: "positive" },
    ],
  })),
});

report(
  "Table rows (4 cells each)",
  [10, 40, 100, 500, 1000, 5000].map((n) => {
    const spec = tableWithRows(n);
    return { n, ms: timeMs(() => UnboundedTable.parse(spec)), size: bytes(spec) };
  }),
);

// --- axis: single string field length ----------------------------------

report(
  "NoteCard body length (chars)",
  [200, 1000, 4000, 20000, 100000, 1000000].map((n) => {
    const spec = { type: "NoteCard", body: "x".repeat(n) };
    return { n, ms: timeMs(() => UnboundedNote.parse(spec)), size: bytes(spec) };
  }),
);

// --- axis: sparkline points (bare number array) ------------------------

report(
  "Sparkline data points (number[])",
  [10, 50, 100, 500, 1000, 10000].map((n) => {
    const spec = {
      type: "DataRow",
      cells: [{ kind: "sparkline", data: Array.from({ length: n }, (_, i) => i) }],
    };
    return { n, ms: timeMs(() => UnboundedRow.parse(spec)), size: bytes(spec) };
  }),
);

// --- axis: total node count (flat) -------------------------------------

const flatStack = (n) => ({
  type: "Stack",
  gap: "md",
  children: Array.from({ length: n }, (_, i) => ({
    type: "NoteCard",
    body: `note ${i}`,
    tone: "info",
  })),
});

report(
  "Total nodes (flat Stack of NoteCards)",
  [10, 50, 100, 250, 500, 1000, 5000].map((n) => {
    const spec = flatStack(n);
    return { n, ms: timeMs(() => UnboundedSpec.parse(spec)), size: bytes(spec) };
  }),
);

// --- axis: nesting depth ------------------------------------------------

const nested = (depth) => {
  let node = { type: "NoteCard", body: "leaf" };
  for (let i = 0; i < depth; i++) node = { type: "Grid", cols: 1, children: [node] };
  return node;
};

report(
  "Nesting depth (single chain)",
  [4, 6, 10, 20, 50, 100].map((n) => {
    const spec = nested(n);
    return { n, ms: timeMs(() => UnboundedSpec.parse(spec)), size: bytes(spec) };
  }),
);

// --- what the caps admit, measured against the SHIPPED validator --------

const distEntry = path.join(import.meta.dirname, "..", "dist", "schemas", "index.js");
let shipped;
try {
  shipped = await import(distEntry);
} catch {
  console.log("\n(dist/ not built — skipping the shipped-validator sections)");
  console.log("run: pnpm --filter @shepherd-creative/weave-primitives build");
  process.exit(0);
}
const { LIMITS, validateWeaveDocument } = shipped;

/** Every plain object in the tree — the unit the `nodes` cap counts. */
const countObjects = (node) => {
  if (!node || typeof node !== "object") return 0;
  let n = Array.isArray(node) ? 0 : 1;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const item of value) n += countObjects(item);
    else if (value && typeof value === "object") n += countObjects(value);
  }
  return n;
};

function measure(label, root) {
  const document = { weave: 1, root };
  let verdict;
  try {
    validateWeaveDocument(document);
    verdict = "ACCEPTED";
  } catch (err) {
    verdict = `REJECTED (${err.code ?? "schema"})`;
  }
  console.log(`\n### ${label}`);
  console.log(`objects: ${countObjects(document).toLocaleString("en-US")}`);
  console.log(`payload bytes: ${bytes(document).toLocaleString("en-US")}`);
  console.log(`parse ms (unbounded mirror): ${timeMs(() => UnboundedSpec.parse(root)).toFixed(3)}`);
  console.log(`shipped validator: ${verdict}`);
}

// Every per-axis cap at its maximum, simultaneously. This is what the GLOBAL
// caps have to have an opinion about: the per-axis caps are about legibility,
// so their product is far larger than any document worth rendering.
measure("Every per-axis cap at its maximum, simultaneously", {
  type: "Stack",
  children: Array.from({ length: LIMITS.layoutChildren }, (_, i) =>
    i % 3 === 0
      ? {
          type: "TableCard",
          title: "T".repeat(LIMITS.text),
          headers: Array.from({ length: LIMITS.tableHeaders }, () => ({
            text: "H".repeat(LIMITS.text),
            align: "end",
          })),
          rows: Array.from({ length: LIMITS.tableRows }, () => ({
            type: "DataRow",
            cells: Array.from({ length: LIMITS.tableHeaders }, () => ({
              kind: "number",
              value: 1234.5,
            })),
          })),
        }
      : i % 3 === 1
        ? {
            type: "ChartCard",
            title: "C".repeat(LIMITS.text),
            chart: chartWithSeries(LIMITS.chartSeries, LIMITS.chartPoints),
          }
        : {
            type: "MetricBand",
            items: Array.from({ length: LIMITS.metricBandItems }, () => ({
              type: "KPI",
              label: "L".repeat(LIMITS.text),
              value: 1,
              size: "lg",
            })),
          },
  ),
});

// The headroom question: how far below the global caps does the busiest
// dashboard anyone would actually compose sit? SKILL.md §5.2 already calls 6+
// widgets a "data-dense view", so 8 widgets with every chart at the full point
// cap is past realistic.
measure("Busiest realistic dashboard (8 widgets, charts at the point cap)", {
  type: "Stack",
  gap: "md",
  children: [
    {
      type: "MetricBand",
      items: Array.from({ length: 5 }, (_, i) => ({
        type: "KPI",
        label: `KPI ${i}`,
        value: i * 1000,
        size: "lg",
      })),
    },
    ...Array.from({ length: 4 }, (_, i) => ({
      type: "ChartCard",
      title: `Chart ${i}`,
      chart: chartWithPoints(LIMITS.chartPoints),
    })),
    ...Array.from({ length: 2 }, () => ({
      type: "TableCard",
      title: "Breakdown",
      headers: Array.from({ length: LIMITS.tableHeaders }, (_, i) => ({ text: `H${i}` })),
      rows: Array.from({ length: LIMITS.tableRows }, () => ({
        type: "DataRow",
        cells: Array.from({ length: LIMITS.tableHeaders }, () => ({
          kind: "number",
          value: 1234.5,
        })),
      })),
    })),
    { type: "NoteCard", body: "Context for the numbers above." },
  ],
});

console.log(`\nnode version: ${process.version}`);
