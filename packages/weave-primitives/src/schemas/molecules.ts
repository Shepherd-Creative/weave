import { z } from "zod";
import {
  FiniteNumberSchema,
  LIMITS,
  NodeIdentity,
  SparklineDataSchema,
  TextSchema,
} from "./bounds.js";
import {
  AlignSchema,
  ChartVariantSchema,
  IconNameSchema,
  NumberFormatSchema,
  SizeSchema,
  ToneSchema,
} from "./tokens.js";

// --- Delta sub-schema (used by KPI / Stat / DataRow.cell[delta]) -----

const DeltaToneSchema = z.enum(["positive", "negative", "muted"]);

// Percent formatting treats values as fractions of 1 (Intl semantics):
// 0.142 renders as "14.2%". The .describe() strings are LOAD-BEARING — they
// flow into the tools' JSON schemas, which is often the ONLY guidance an LLM
// sees when composing a call (observed 2026-07-07: a model passing 3.4 for
// 3.4% rendered "340%").
const PERCENT_VALUE_HINT =
  'With format "percent" this is a fraction of 1: 0.034 renders as "3.4%".';

export const KpiDeltaSchema = z
  .object({
    value: FiniteNumberSchema.describe(PERCENT_VALUE_HINT),
    format: z
      .enum(["percent", "int", "decimal"])
      .optional()
      .describe('"percent" renders value×100 with a % sign — pass fractions (0.142 → "14.2%").'),
    tone: DeltaToneSchema.optional(),
    showSign: z.boolean().optional(),
  })
  .strict();

export const StatDeltaSchema = z
  .object({
    value: FiniteNumberSchema.describe(PERCENT_VALUE_HINT),
    format: z
      .enum(["percent", "int"])
      .optional()
      .describe('"percent" renders value×100 with a % sign — pass fractions (0.142 → "14.2%").'),
    tone: ToneSchema.optional(),
  })
  .strict();

// --- Sparkline sub-shape (not rendered until B5 — schema exists so the
// LLM can emit it; B3's KPI component ignores the prop with a TODO.) ----

const SparklineVariantSchema = z.enum(["line", "bar", "area"]);

export const KpiSparklineSchema = z
  .object({
    data: SparklineDataSchema,
    variant: SparklineVariantSchema.optional(),
  })
  .strict();

// --- KPI -------------------------------------------------------------

export const KPISchema = z
  .object({
    ...NodeIdentity,
    type: z.literal("KPI"),
    label: TextSchema,
    value: FiniteNumberSchema.describe(PERCENT_VALUE_HINT),
    format: NumberFormatSchema.optional(),
    precision: z.number().int().min(0).max(10).optional(),
    currency: z.string().length(3).optional(),
    size: z.enum(["lg", "xl"]).optional(),
    tone: ToneSchema.optional(),
    delta: KpiDeltaSchema.optional(),
    icon: IconNameSchema.optional(),
    sparkline: KpiSparklineSchema.optional(),
    caption: TextSchema.optional(),
  })
  .strict();
export type KPISpec = z.infer<typeof KPISchema>;

// --- Stat ------------------------------------------------------------

export const StatSchema = z
  .object({
    ...NodeIdentity,
    type: z.literal("Stat"),
    label: TextSchema,
    value: FiniteNumberSchema,
    format: NumberFormatSchema.optional(),
    precision: z.number().int().min(0).max(10).optional(),
    size: z.enum(["sm", "md"]).optional(),
    tone: ToneSchema.optional(),
    delta: StatDeltaSchema.optional(),
  })
  .strict();
export type StatSpec = z.infer<typeof StatSchema>;

// --- DataRow ---------------------------------------------------------

export const DataCellSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text"),
      value: TextSchema,
      tone: ToneSchema.optional(),
      align: AlignSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("number"),
      value: FiniteNumberSchema,
      format: NumberFormatSchema.optional(),
      precision: z.number().int().min(0).max(10).optional(),
      currency: z.string().length(3).optional(),
      tone: ToneSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("badge"),
      value: TextSchema,
      tone: ToneSchema.optional(),
      variant: z.enum(["solid", "soft", "outline"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("delta"),
      value: FiniteNumberSchema.describe(PERCENT_VALUE_HINT),
      format: z
        .enum(["percent", "int"])
        .optional()
        .describe('"percent" renders value×100 with a % sign — pass fractions (0.142 → "14.2%").'),
      tone: ToneSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sparkline"),
      data: SparklineDataSchema,
      variant: SparklineVariantSchema.optional(),
    })
    .strict(),
]);
export type DataCell = z.infer<typeof DataCellSchema>;

/**
 * A table row.
 *
 * NOT a member of the Spec union: a `DataRow` renders a bare `<tr>`, which is
 * invalid outside a `<table>` (F2). It reaches the renderer only through
 * `TableCard.rows`, and the canonical validator is what enforces that each row
 * carries exactly one cell per header — a cross-field rule Zod cannot express
 * inside a `discriminatedUnion` member. See packages/weave-primitives/src/schemas/document.ts.
 */
export const DataRowSchema = z
  .object({
    ...NodeIdentity,
    type: z.literal("DataRow"),
    cells: z.array(DataCellSchema).max(LIMITS.tableHeaders),
  })
  .strict();
export type DataRowSpec = z.infer<typeof DataRowSchema>;

// --- Chart -----------------------------------------------------------

/** A chart data key: bounded, non-empty. */
export const ChartKeySchema = z.string().min(1).max(LIMITS.chartKeyText);

/**
 * One plotted record. Keys are bounded in count and length, values are
 * finite numbers or bounded strings.
 *
 * Whether the keys are the ones the chart actually declared (`categoryKey` /
 * `valueKeys`) is a cross-field rule, enforced by the canonical validator.
 */
export const ChartDatumSchema = z
  .record(ChartKeySchema, z.union([FiniteNumberSchema, TextSchema]))
  .refine((row) => Object.keys(row).length <= LIMITS.chartSeries + 1, {
    message: `A chart record may carry at most ${LIMITS.chartSeries + 1} keys (one category plus ${LIMITS.chartSeries} series).`,
  });

export const ChartSchema = z
  .object({
    ...NodeIdentity,
    type: z.literal("Chart"),
    variant: ChartVariantSchema,
    data: z.array(ChartDatumSchema).max(LIMITS.chartPoints),
    categoryKey: ChartKeySchema.optional(),
    valueKeys: z.array(ChartKeySchema).max(LIMITS.chartSeries).optional(),
    seriesTones: z.array(ToneSchema).max(LIMITS.chartSeries).optional(),
    showLegend: z.boolean().optional(),
    showGrid: z.boolean().optional(),
    showTooltip: z.boolean().optional(),
    height: z.enum(["sm", "md", "lg"]).optional(),
  })
  .strict();
export type ChartSpec = z.infer<typeof ChartSchema>;

// Size schema re-export used by size-constrained props elsewhere.
export { SizeSchema };
