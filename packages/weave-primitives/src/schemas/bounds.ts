import { z } from "zod";

/**
 * Every axis a generated document can grow on, and the cap it grows to.
 *
 * **These numbers are measured, not chosen.** `bench/document-limits.bench.mjs`
 * walks each axis and reports validation cost and payload size; the recorded
 * run and the reasoning for each cap are in `docs/specs/weave-document-v1.md`.
 * If a cap is ever revisited, re-run the benchmark and re-record it — a limit
 * without a measurement behind it is a guess with a number on it.
 *
 * Two kinds of cap live here and they are justified differently:
 *
 * - **Legibility caps** (`chartPoints`, `chartSeries`, `tableRows`, `text`, …)
 *   cut an axis off where the output stops being readable. A 5,000-point line
 *   chart in a dashboard card is sub-pixel per point; a 40-row table is
 *   already the documented maximum in the composition skill's §5.7.
 * - **Cost caps** (`payloadBytes`, `depth`, `nodes`) bound what a hostile or
 *   runaway caller can make validation do. The per-axis caps alone do not:
 *   nesting multiplies them, and a depth-6 tree of 12-child containers can
 *   carry tens of thousands of objects while every individual axis stays
 *   legal. The cost caps are what stop that.
 *
 * Two measurements anchor the cost caps (see the benchmark for both):
 *
 * | Document | objects | bytes | verdict |
 * |---|---|---|---|
 * | Busiest dashboard anyone would compose (8 widgets, charts at the point cap) | 1,473 | 47,596 | accepted |
 * | Every per-axis cap at its maximum, simultaneously | 2,158 | 126,048 | accepted |
 *
 * Both are accepted deliberately: a cap that rejects the largest document its
 * own sibling caps permit is not a cost cap, it is a bug waiting to be
 * reported. `nodes` sits above both and bites only on the multiplicative case.
 */
export const LIMITS = {
  /** Max UTF-8 bytes of a raw document payload. 5.5× the busiest realistic dashboard (47,596), 2.1× the all-axes-maxed one (126,048). */
  payloadBytes: 262_144,
  /** Max nested Grid/Stack containers. Unchanged from the shipped render_dashboard cap; the composition skill's worked examples reach 3. */
  depth: 6,
  /** Max objects in one document. Above the all-axes-maxed shape (2,158) so the per-axis caps stay honest; costs ~1.7 ms to reach (flat-node curve: 1,000 → 0.50 ms, 5,000 → 2.91 ms). */
  nodes: 3_000,
  /**
   * Max values the structural walk may visit — every array element and every
   * object property, scalars included.
   *
   * `nodes` counts objects only, so it says nothing about an array of scalars:
   * a single undeclared field holding a million zeros was walked in full before
   * anything rejected it. This is the cap that bounds the walk itself.
   *
   * Measured, above the values-maximising LEGAL document rather than above a
   * typical one. Sparkline cells carry 100 scalar leaves per object, so the
   * worst legal shape is tables of them: nine sparkline tables measure 2,954
   * objects / **260,816 values** and are the largest the `nodes` cap admits
   * (ten are refused at 3,282 objects). See the benchmark's "values-maximising
   * legal document" section.
   */
  values: 300_000,
  /** Max characters in a label, title, caption, header or table cell. */
  text: 200,
  /** Max characters of prose in a NoteCard body — roughly two pages. */
  body: 4_000,
  /** Max characters of a BCP-47 locale tag. */
  localeText: 35,
  /** Max characters of a node id. */
  nodeId: 64,
  /** Max raw object/array nesting levels. A stack-overflow guard, not a contract cap — the contract cap is `depth`. A depth-6 document nests about 20. */
  nesting: 40,
  /** Max children in one Grid or Stack. The composition skill's §5.2 already calls 6+ widgets a data-dense view. */
  layoutChildren: 12,
  /** Max KPIs in a MetricBand. Unchanged. */
  metricBandItems: 8,
  /** Max table columns. The composition skill's §5.7 and §8.4 already state 7. */
  tableHeaders: 7,
  /** Max table rows. The composition skill's §5.7 already states 40; 5,000 rows costs 14.2 ms and 1.3 MB. */
  tableRows: 40,
  /** Max points in one chart. 200 points costs 0.39 ms and 6.5 KB; 5,000 costs 4.4 ms and 173 KB, and is sub-pixel at dashboard width. */
  chartPoints: 200,
  /** Max series in one chart. The composition skill's §6 already forbids more than 8; 8 series costs 0.19 ms, 64 costs 1.39 ms. */
  chartSeries: 8,
  /** Max characters of a chart data key. */
  chartKeyText: 64,
  /** Max points in a sparkline. A sparkline is ~100px wide, so more than one point per pixel is not drawable. */
  sparklinePoints: 100,
} as const;

/**
 * ## The unknown-key policy
 *
 * **Every node schema and every nested input object is `.strict()`.** An
 * undeclared key is a rejection, never a silent removal.
 *
 * Stripping was not a smaller version of rejecting; it was a hole. Zod's
 * default `z.object()` drops unknown keys *after* they have been received, so
 * an undeclared field carried whatever the caller liked — 300 KB of string, a
 * million-element array — and was then dropped without ever being weighed
 * against a limit. The document looked bounded because the evidence of it not
 * being bounded had been deleted. Closing the objects means the same input is
 * an `unrecognized_keys` issue on every surface, and `LIMITS.values` bounds
 * what the structural walk spends discovering that.
 *
 * **One shape stays open, deliberately:** `ChartDatumSchema` is a `z.record()`,
 * because a chart series is named by the caller — "gross margin %" is data, not
 * schema. Its keys are bounded in count and length and its values must be
 * finite numbers or bounded strings, and the canonical validator additionally
 * requires them to match the chart's declared `categoryKey`/`valueKeys`. It is
 * the only open record in the contract; anything else added later should be
 * closed unless it can make the same argument.
 */

/**
 * A number that can actually be rendered.
 *
 * `z.number()` rejects NaN but ACCEPTS Infinity (measured on zod 3.25.76), and
 * an infinite value reaches the DOM as the literal string "Infinity" in every
 * numeric slot. JSON cannot carry it, but the direct `<Weave>` path takes
 * in-memory objects, so the transports are not a backstop here.
 */
export const FiniteNumberSchema = z.number().finite();

/** Short display text: labels, titles, captions, headers, table cells. */
export const TextSchema = z.string().max(LIMITS.text);

/** Long-form prose. Only NoteCard bodies are this long. */
export const BodyTextSchema = z.string().max(LIMITS.body);

/** A BCP-47 locale tag, bounded. */
export const LocaleSchema = z.string().max(LIMITS.localeText);

/** Points of a sparkline: bounded, finite. */
export const SparklineDataSchema = z.array(FiniteNumberSchema).max(LIMITS.sparklinePoints);

/**
 * Stable identity for a node, unique across one document.
 *
 * Optional in Wave 1 and used by nothing yet; the interactive controls of
 * Wave 4 (Tabs) and Wave 5 (the action registry) need a handle that survives
 * a re-render, and retrofitting identity onto a shipped document format is
 * far more expensive than reserving it now. Uniqueness is a document-wide
 * property, so it is enforced by the canonical validator, not here.
 *
 * The character class is deliberately narrow: an id may end up in a DOM `id`,
 * a URL fragment or an ARIA relationship, and each of those has its own
 * opinion about punctuation.
 */
export const NodeIdSchema = z
  .string()
  .min(1)
  .max(LIMITS.nodeId)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "id must be alphanumeric with - or _, starting alphanumeric",
  );

/** The `id` field every node carries. Spread into each node schema's shape. */
export const NodeIdentity = { id: NodeIdSchema.optional() };
