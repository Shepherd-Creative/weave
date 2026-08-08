import { z } from "zod";
import { BodyTextSchema, LIMITS, NodeIdentity, TextSchema } from "./bounds.js";
import { ChartSchema, DataRowSchema, KPISchema } from "./molecules.js";
import { AlignSchema, DensitySchema, IconNameSchema, ToneSchema } from "./tokens.js";

// --- MetricBand ------------------------------------------------------

export const MetricBandSchema = z.object({
  ...NodeIdentity,
  type: z.literal("MetricBand"),
  items: z.array(KPISchema).min(1).max(LIMITS.metricBandItems),
  density: DensitySchema.optional(),
});
export type MetricBandSpec = z.infer<typeof MetricBandSchema>;

// --- NoteCard --------------------------------------------------------

export const NoteCardSchema = z.object({
  ...NodeIdentity,
  type: z.literal("NoteCard"),
  title: TextSchema.optional(),
  body: BodyTextSchema,
  tone: z.enum(["default", "info", "warning", "muted"]).optional(),
  icon: IconNameSchema.optional(),
});
export type NoteCardSpec = z.infer<typeof NoteCardSchema>;

// --- ChartCard -------------------------------------------------------

// footer may be a Label or a NoteCard; define a narrow union here to avoid
// pulling in the full SpecSchema (the Label atom is imported here lazily).
import { LabelSchema } from "./atoms.js";

export const ChartCardFooterSchema = z.union([LabelSchema, NoteCardSchema]);

export const ChartCardSchema = z.object({
  ...NodeIdentity,
  type: z.literal("ChartCard"),
  title: TextSchema,
  caption: TextSchema.optional(),
  chart: ChartSchema,
  footer: ChartCardFooterSchema.optional(),
});
export type ChartCardSpec = z.infer<typeof ChartCardSchema>;

// --- TableCard -------------------------------------------------------

export const TableHeaderSchema = z.object({
  text: TextSchema,
  align: AlignSchema.optional(),
  tone: ToneSchema.optional(),
});

/**
 * A table.
 *
 * Header and row counts are bounded here. "Exactly one cell per header" is a
 * cross-field rule and lives in the canonical validator instead: Zod 3's
 * `discriminatedUnion` requires every member to be a `ZodObject`, and
 * `.superRefine()` produces a `ZodEffects`, which the union rejects at
 * construction time (measured on zod 3.25.76). See packages/weave-primitives/src/schemas/document.ts.
 */
export const TableCardSchema = z.object({
  ...NodeIdentity,
  type: z.literal("TableCard"),
  title: TextSchema,
  caption: TextSchema.optional(),
  headers: z.array(TableHeaderSchema).min(1).max(LIMITS.tableHeaders),
  rows: z.array(DataRowSchema).max(LIMITS.tableRows),
  density: z.enum(["compact", "comfortable"]).optional(),
});
export type TableCardSpec = z.infer<typeof TableCardSchema>;
