import { z } from "zod";
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

export const KpiDeltaSchema = z.object({
  value: z.number(),
  format: z.enum(["percent", "int", "decimal"]).optional(),
  tone: DeltaToneSchema.optional(),
  showSign: z.boolean().optional(),
});

export const StatDeltaSchema = z.object({
  value: z.number(),
  format: z.enum(["percent", "int"]).optional(),
  tone: ToneSchema.optional(),
});

// --- Sparkline sub-shape (not rendered until B5 — schema exists so the
// LLM can emit it; B3's KPI component ignores the prop with a TODO.) ----

const SparklineVariantSchema = z.enum(["line", "bar", "area"]);

export const KpiSparklineSchema = z.object({
  data: z.array(z.number()),
  variant: SparklineVariantSchema.optional(),
});

// --- KPI -------------------------------------------------------------

export const KPISchema = z.object({
  type: z.literal("KPI"),
  label: z.string(),
  value: z.number(),
  format: NumberFormatSchema.optional(),
  precision: z.number().int().min(0).max(10).optional(),
  currency: z.string().length(3).optional(),
  size: z.enum(["lg", "xl"]).optional(),
  tone: ToneSchema.optional(),
  delta: KpiDeltaSchema.optional(),
  icon: IconNameSchema.optional(),
  sparkline: KpiSparklineSchema.optional(),
  caption: z.string().optional(),
});
export type KPISpec = z.infer<typeof KPISchema>;

// --- Stat ------------------------------------------------------------

export const StatSchema = z.object({
  type: z.literal("Stat"),
  label: z.string(),
  value: z.number(),
  format: NumberFormatSchema.optional(),
  precision: z.number().int().min(0).max(10).optional(),
  size: z.enum(["sm", "md"]).optional(),
  tone: ToneSchema.optional(),
  delta: StatDeltaSchema.optional(),
});
export type StatSpec = z.infer<typeof StatSchema>;

// --- DataRow ---------------------------------------------------------

export const DataCellSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    value: z.string(),
    tone: ToneSchema.optional(),
    align: AlignSchema.optional(),
  }),
  z.object({
    kind: z.literal("number"),
    value: z.number(),
    format: NumberFormatSchema.optional(),
    precision: z.number().int().min(0).max(10).optional(),
    currency: z.string().length(3).optional(),
    tone: ToneSchema.optional(),
  }),
  z.object({
    kind: z.literal("badge"),
    value: z.string(),
    tone: ToneSchema.optional(),
    variant: z.enum(["solid", "soft", "outline"]).optional(),
  }),
  z.object({
    kind: z.literal("delta"),
    value: z.number(),
    format: z.enum(["percent", "int"]).optional(),
    tone: ToneSchema.optional(),
  }),
  z.object({
    kind: z.literal("sparkline"),
    data: z.array(z.number()),
    variant: SparklineVariantSchema.optional(),
  }),
]);
export type DataCell = z.infer<typeof DataCellSchema>;

export const DataRowSchema = z.object({
  type: z.literal("DataRow"),
  cells: z.array(DataCellSchema),
});
export type DataRowSpec = z.infer<typeof DataRowSchema>;

// --- Chart -----------------------------------------------------------

export const ChartSchema = z.object({
  type: z.literal("Chart"),
  variant: ChartVariantSchema,
  data: z.array(z.record(z.string(), z.union([z.number(), z.string()]))),
  categoryKey: z.string().optional(),
  valueKeys: z.array(z.string()).optional(),
  seriesTones: z.array(ToneSchema).optional(),
  showLegend: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  showTooltip: z.boolean().optional(),
  height: z.enum(["sm", "md", "lg"]).optional(),
});
export type ChartSpec = z.infer<typeof ChartSchema>;

// Size schema re-export used by size-constrained props elsewhere.
export { SizeSchema };
