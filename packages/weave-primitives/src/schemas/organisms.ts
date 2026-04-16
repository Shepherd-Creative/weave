import { z } from "zod";
import { AlignSchema, DensitySchema, IconNameSchema, ToneSchema } from "./tokens.js";
import { ChartSchema, DataRowSchema, KPISchema } from "./molecules.js";

// --- MetricBand ------------------------------------------------------

export const MetricBandSchema = z.object({
  type: z.literal("MetricBand"),
  items: z.array(KPISchema).min(1).max(8),
  density: DensitySchema.optional(),
});
export type MetricBandSpec = z.infer<typeof MetricBandSchema>;

// --- NoteCard --------------------------------------------------------

export const NoteCardSchema = z.object({
  type: z.literal("NoteCard"),
  title: z.string().optional(),
  body: z.string(),
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
  type: z.literal("ChartCard"),
  title: z.string(),
  caption: z.string().optional(),
  chart: ChartSchema,
  footer: ChartCardFooterSchema.optional(),
});
export type ChartCardSpec = z.infer<typeof ChartCardSchema>;

// --- TableCard -------------------------------------------------------

export const TableHeaderSchema = z.object({
  text: z.string(),
  align: AlignSchema.optional(),
  tone: ToneSchema.optional(),
});

export const TableCardSchema = z.object({
  type: z.literal("TableCard"),
  title: z.string(),
  caption: z.string().optional(),
  headers: z.array(TableHeaderSchema),
  rows: z.array(DataRowSchema),
  density: z.enum(["compact", "comfortable"]).optional(),
});
export type TableCardSpec = z.infer<typeof TableCardSchema>;
